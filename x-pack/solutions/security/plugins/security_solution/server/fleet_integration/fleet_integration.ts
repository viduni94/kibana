/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { AlertingServerStart } from '@kbn/alerting-plugin/server';
import type {
  PostPackagePolicyCreateCallback,
  PostPackagePolicyPostDeleteCallback,
  PutPackagePolicyUpdateCallback,
  PostPackagePolicyPostCreateCallback,
} from '@kbn/fleet-plugin/server';

import type {
  AgentPolicy,
  NewAgentPolicy,
  NewPackagePolicy,
  PackagePolicy,
  UpdatePackagePolicy,
} from '@kbn/fleet-plugin/common';
import type { CloudSetup } from '@kbn/cloud-plugin/server';
import type { InfoResponse } from '@elastic/elasticsearch/lib/api/types';
import { ProductFeatureSecurityKey } from '@kbn/security-solution-features/keys';
import type {
  PostAgentPolicyCreateCallback,
  PostAgentPolicyPostUpdateCallback,
  PostAgentPolicyUpdateCallback,
  PutPackagePolicyPostUpdateCallback,
} from '@kbn/fleet-plugin/server/types';
import { updateDeletedPolicyResponseActions } from './handlers/update_deleted_policy_response_actions';
import type { TelemetryConfigProvider } from '../../common/telemetry_config/telemetry_config_provider';
import type { EndpointInternalFleetServicesInterface } from '../endpoint/services/fleet';
import type { EndpointAppContextService } from '../endpoint/endpoint_app_context_services';
import { createPolicyDataStreamsIfNeeded } from './handlers/create_policy_datastreams';
import { updateAntivirusRegistrationEnabled } from '../../common/endpoint/utils/update_antivirus_registration_enabled';
import { validatePolicyAgainstProductFeatures } from './handlers/validate_policy_against_product_features';
import { validateEndpointPackagePolicy } from './handlers/validate_endpoint_package_policy';
import {
  isPolicySetToEventCollectionOnly,
  ensureOnlyEventCollectionIsAllowed,
  isBillablePolicy,
} from '../../common/endpoint/models/policy_config_helpers';
import type { NewPolicyData, PolicyConfig, PolicyData } from '../../common/endpoint/types';
import type { LicenseService } from '../../common/license';
import type { ManifestManager } from '../endpoint/services';
import type { IRequestContextFactory } from '../request_context_factory';
import { installEndpointSecurityPrebuiltRule } from '../lib/detection_engine/prebuilt_rules/logic/integrations/install_endpoint_security_prebuilt_rule';
import { createPolicyArtifactManifest } from './handlers/create_policy_artifact_manifest';
import { createDefaultPolicy } from './handlers/create_default_policy';
import { validatePolicyAgainstLicense } from './handlers/validate_policy_against_license';
import { validateIntegrationConfig } from './handlers/validate_integration_config';
import { removePolicyFromArtifacts } from './handlers/remove_policy_from_artifacts';
import { notifyProtectionFeatureUsage } from './notify_protection_feature_usage';
import type { AnyPolicyCreateConfig } from './types';
import { ENDPOINT_INTEGRATION_CONFIG_KEY } from './constants';
import { createEventFilters } from './handlers/create_event_filters';
import type { ProductFeaturesService } from '../lib/product_features_service/product_features_service';
import { removeProtectionUpdatesNote } from './handlers/remove_protection_updates_note';
import { catchAndWrapError } from '../endpoint/utils';

const isEndpointPackagePolicy = <T extends { package?: { name: string } }>(
  packagePolicy: T
): boolean => {
  return packagePolicy.package?.name === 'endpoint';
};

const getEndpointPolicyForAgentPolicy = async (
  fleetServices: EndpointInternalFleetServicesInterface,
  agentPolicy: AgentPolicy
): Promise<PackagePolicy | undefined> => {
  let agentPolicyIntegrations: PackagePolicy[] | undefined = agentPolicy.package_policies;

  if (!agentPolicyIntegrations) {
    const fullAgentPolicy = await fleetServices.agentPolicy.get(
      fleetServices.savedObjects.createInternalUnscopedSoClient(),
      agentPolicy.id,
      true
    );
    agentPolicyIntegrations = fullAgentPolicy?.package_policies ?? [];
  }

  if (Array.isArray(agentPolicyIntegrations)) {
    for (const integrationPolicy of agentPolicyIntegrations) {
      if (isEndpointPackagePolicy(integrationPolicy)) {
        return integrationPolicy;
      }
    }
  }

  return undefined;
};

const shouldUpdateMetaValues = (
  endpointPackagePolicy: PolicyConfig,
  currentLicenseType: string,
  currentCloudInfo: boolean,
  currentClusterName: string,
  currentClusterUUID: string,
  currentLicenseUUID: string,
  currentIsServerlessEnabled: boolean
) => {
  return (
    endpointPackagePolicy.meta.license !== currentLicenseType ||
    endpointPackagePolicy.meta.cloud !== currentCloudInfo ||
    endpointPackagePolicy.meta.cluster_name !== currentClusterName ||
    endpointPackagePolicy.meta.cluster_uuid !== currentClusterUUID ||
    endpointPackagePolicy.meta.license_uuid !== currentLicenseUUID ||
    endpointPackagePolicy.meta.serverless !== currentIsServerlessEnabled
  );
};

/**
 * Callback to handle creation of PackagePolicies in Fleet
 */
export const getPackagePolicyCreateCallback = (
  logger: Logger,
  manifestManager: ManifestManager,
  securitySolutionRequestContextFactory: IRequestContextFactory,
  alerts: AlertingServerStart,
  licenseService: LicenseService,
  cloud: CloudSetup,
  productFeatures: ProductFeaturesService,
  telemetryConfigProvider: TelemetryConfigProvider
): PostPackagePolicyCreateCallback => {
  return async (
    newPackagePolicy,
    soClient,
    esClient,
    context,
    request
  ): Promise<NewPackagePolicy> => {
    // callback is called outside request context
    if (!context || !request) {
      logger.debug('PackagePolicyCreateCallback called outside request context. Skipping...');
      return newPackagePolicy;
    }

    // We only care about Endpoint package policies
    if (!isEndpointPackagePolicy(newPackagePolicy)) {
      return newPackagePolicy;
    }

    logger.debug(
      () =>
        `Checking create of endpoint policy [${newPackagePolicy.id}][${newPackagePolicy.name}] for compliance.`
    );

    if (newPackagePolicy?.inputs) {
      validatePolicyAgainstProductFeatures(newPackagePolicy.inputs, productFeatures);
      validateEndpointPackagePolicy(newPackagePolicy.inputs);
    }
    // Optional endpoint integration configuration
    let endpointIntegrationConfig;

    // Check if has endpoint integration configuration input
    const integrationConfigInput = newPackagePolicy?.inputs?.find(
      (input) => input.type === ENDPOINT_INTEGRATION_CONFIG_KEY
    )?.config?._config;

    if (integrationConfigInput?.value) {
      // The cast below is needed in order to ensure proper typing for the
      // Elastic Defend integration configuration
      endpointIntegrationConfig = integrationConfigInput.value as AnyPolicyCreateConfig;

      // Validate that the Elastic Defend integration config is valid
      validateIntegrationConfig(endpointIntegrationConfig, logger);
    }

    // In this callback we are handling an HTTP request to the fleet plugin. Since we use
    // code from the security_solution plugin to handle it (installPrepackagedRules),
    // we need to build the context that is native to security_solution and pass it there.
    const securitySolutionContext = await securitySolutionRequestContextFactory.create(
      context,
      request
    );

    // perform these operations in parallel in order to help in not delaying the API response too much
    const [, manifestValue] = await Promise.all([
      installEndpointSecurityPrebuiltRule({
        logger,
        context: securitySolutionContext,
        request,
        alerts,
        soClient,
      }),

      // create the Artifact Manifest for this policy
      createPolicyArtifactManifest(logger, manifestManager),
    ]);

    const esClientInfo: InfoResponse = await esClient.info();

    // Add the default endpoint security policy
    const defaultPolicyValue = createDefaultPolicy(
      licenseService,
      endpointIntegrationConfig,
      cloud,
      esClientInfo,
      productFeatures,
      telemetryConfigProvider
    );

    return {
      // We cast the type here so that any changes to the Endpoint
      // specific data follow the types/schema expected
      ...(newPackagePolicy as NewPolicyData),
      inputs: [
        {
          type: 'endpoint',
          enabled: true,
          streams: [],
          config: {
            integration_config: endpointIntegrationConfig
              ? { value: endpointIntegrationConfig }
              : {},
            artifact_manifest: {
              value: manifestValue,
            },
            policy: {
              value: defaultPolicyValue,
            },
          },
        },
      ],
    };
  };
};

export const getPackagePolicyUpdateCallback = (
  endpointServices: EndpointAppContextService,
  cloud: CloudSetup,
  productFeatures: ProductFeaturesService
): PutPackagePolicyUpdateCallback => {
  const logger = endpointServices.createLogger('endpointPackagePolicyUpdateCallback');
  const licenseService = endpointServices.getLicenseService();
  const featureUsageService = endpointServices.getFeatureUsageService();

  return async (
    newPackagePolicy: NewPackagePolicy,
    soClient,
    esClient
  ): Promise<UpdatePackagePolicy> => {
    if (!isEndpointPackagePolicy(newPackagePolicy)) {
      return newPackagePolicy;
    }

    logger.debug(
      () =>
        `Checking update of endpoint policy [${newPackagePolicy.id}][${newPackagePolicy.name}] for compliance.`
    );

    const endpointIntegrationData = newPackagePolicy as NewPolicyData;

    // Validate that Endpoint Security policy is valid against current license
    validatePolicyAgainstLicense(
      // The cast below is needed in order to ensure proper typing for
      // the policy configuration specific for endpoint
      endpointIntegrationData.inputs[0].config?.policy?.value as PolicyConfig,
      licenseService,
      logger
    );

    // Validate that Endpoint Security policy uses only enabled App Features
    validatePolicyAgainstProductFeatures(endpointIntegrationData.inputs, productFeatures);

    validateEndpointPackagePolicy(endpointIntegrationData.inputs);

    if (endpointIntegrationData.id) {
      await notifyProtectionFeatureUsage(
        endpointIntegrationData,
        (await endpointServices
          .getInternalFleetServices()
          .packagePolicy.get(soClient, endpointIntegrationData.id as string)
          .catch(catchAndWrapError)) as PolicyData,
        featureUsageService
      );
    }

    const newEndpointPackagePolicy = endpointIntegrationData.inputs[0].config?.policy
      ?.value as PolicyConfig;

    const esClientInfo: InfoResponse = await esClient.info();

    if (
      endpointIntegrationData.inputs[0].config?.policy?.value &&
      shouldUpdateMetaValues(
        newEndpointPackagePolicy,
        licenseService.getLicenseType(),
        cloud?.isCloudEnabled,
        esClientInfo.cluster_name,
        esClientInfo.cluster_uuid,
        licenseService.getLicenseUID(),
        cloud?.isServerlessEnabled
      )
    ) {
      newEndpointPackagePolicy.meta.license = licenseService.getLicenseType();
      newEndpointPackagePolicy.meta.cloud = cloud?.isCloudEnabled;
      newEndpointPackagePolicy.meta.cluster_name = esClientInfo.cluster_name;
      newEndpointPackagePolicy.meta.cluster_uuid = esClientInfo.cluster_uuid;
      newEndpointPackagePolicy.meta.license_uuid = licenseService.getLicenseUID();
      newEndpointPackagePolicy.meta.serverless = cloud?.isServerlessEnabled;

      endpointIntegrationData.inputs[0].config.policy.value = newEndpointPackagePolicy;
    }

    // If no Policy Protection allowed (ex. serverless)
    const eventsOnlyPolicy = isPolicySetToEventCollectionOnly(newEndpointPackagePolicy);
    if (
      !productFeatures.isEnabled(ProductFeatureSecurityKey.endpointPolicyProtections) &&
      !eventsOnlyPolicy.isOnlyCollectingEvents
    ) {
      logger.warn(
        `Endpoint integration policy [${endpointIntegrationData.id}][${endpointIntegrationData.name}] adjusted due to [endpointPolicyProtections] productFeature not being enabled. Trigger [${eventsOnlyPolicy.message}]`
      );

      endpointIntegrationData.inputs[0].config.policy.value =
        ensureOnlyEventCollectionIsAllowed(newEndpointPackagePolicy);
    }

    updateAntivirusRegistrationEnabled(newEndpointPackagePolicy);

    newEndpointPackagePolicy.meta.billable = isBillablePolicy(newEndpointPackagePolicy);

    return endpointIntegrationData;
  };
};

export const getPackagePolicyPostUpdateCallback = (
  endpointServices: EndpointAppContextService
): PutPackagePolicyPostUpdateCallback => {
  const logger = endpointServices.createLogger('endpointPackagePolicyPostUpdate');

  return async (packagePolicy) => {
    if (!isEndpointPackagePolicy(packagePolicy)) {
      return packagePolicy;
    }

    logger.debug(`Processing endpoint integration policy (post update): ${packagePolicy.id}`);

    // The check below will run in the background - we don't need to wait for it
    createPolicyDataStreamsIfNeeded({
      endpointServices,
      endpointPolicyIds: [packagePolicy.id],
    }).catch((e) => {
      logger.error(
        `Attempt to check and create DOT datastreams indexes for endpoint integration policy [${packagePolicy.id}] failed`,
        { error: e }
      );
    });

    return packagePolicy;
  };
};

export const getPackagePolicyPostCreateCallback = (
  endpointServices: EndpointAppContextService
): PostPackagePolicyPostCreateCallback => {
  const logger = endpointServices.createLogger('endpointPolicyPostCreate');
  const exceptionsClient = endpointServices.getExceptionListsClient();

  return async (packagePolicy: PackagePolicy): Promise<PackagePolicy> => {
    // We only care about Endpoint package policies
    if (!exceptionsClient || !isEndpointPackagePolicy(packagePolicy)) {
      return packagePolicy;
    }

    // Check and create internal datastreams for this policy if needed.
    // NOTE: we don't need for it to complete here, thus no `await`.
    createPolicyDataStreamsIfNeeded({
      endpointServices,
      endpointPolicyIds: [packagePolicy.id],
    }).catch((e) => {
      logger.error(
        `Attempt to check and create DOT datastreams indexes for agent policy [${packagePolicy.id}] failed`,
        { error: e }
      );
    });

    const integrationConfig = packagePolicy?.inputs[0]?.config?.integration_config;

    if (integrationConfig && integrationConfig?.value?.eventFilters !== undefined) {
      createEventFilters(
        logger,
        exceptionsClient,
        integrationConfig.value.eventFilters,
        packagePolicy
      ).catch((error) => {
        logger.error(`Failed to create event filters: ${error}`);
      });
    }
    return packagePolicy;
  };
};

const throwAgentTamperProtectionUnavailableError = (
  logger: Logger,
  policyName?: string,
  policyId?: string
): void => {
  const agentTamperProtectionUnavailableError: Error & {
    statusCode?: number;
    apiPassThrough?: boolean;
  } = new Error('Agent Tamper Protection is not allowed in current environment');
  // Agent Policy Service will check for apiPassThrough and rethrow. Route handler will check for statusCode and overwrite.
  agentTamperProtectionUnavailableError.statusCode = 403;
  agentTamperProtectionUnavailableError.apiPassThrough = true;
  logger.error(
    `Policy [${policyName}:${policyId}] error: Agent Tamper Protection requires Complete Endpoint Security tier`
  );
  throw agentTamperProtectionUnavailableError;
};

export const getAgentPolicyCreateCallback = (
  logger: Logger,
  productFeatures: ProductFeaturesService
): PostAgentPolicyCreateCallback => {
  return async (agentPolicy: NewAgentPolicy): Promise<NewAgentPolicy> => {
    if (
      agentPolicy.is_protected &&
      !productFeatures.isEnabled(ProductFeatureSecurityKey.endpointAgentTamperProtection)
    ) {
      throwAgentTamperProtectionUnavailableError(logger, agentPolicy.name, agentPolicy.id);
    }
    return agentPolicy;
  };
};

export const getAgentPolicyUpdateCallback = (
  logger: Logger,
  productFeatures: ProductFeaturesService
): PostAgentPolicyUpdateCallback => {
  return async (agentPolicy: Partial<AgentPolicy>): Promise<Partial<AgentPolicy>> => {
    if (
      agentPolicy.is_protected &&
      !productFeatures.isEnabled(ProductFeatureSecurityKey.endpointAgentTamperProtection)
    ) {
      throwAgentTamperProtectionUnavailableError(logger, agentPolicy.name, agentPolicy.id);
    }
    return agentPolicy;
  };
};

export const getAgentPolicyPostUpdateCallback = (
  endpointServices: EndpointAppContextService
): PostAgentPolicyPostUpdateCallback => {
  const logger = endpointServices.createLogger('endpointPolicyPostUpdate');

  return async (agentPolicy) => {
    const fleetServices = endpointServices.getInternalFleetServices();
    const endpointPolicy = await getEndpointPolicyForAgentPolicy(fleetServices, agentPolicy);

    if (!endpointPolicy) {
      return agentPolicy;
    }

    logger.debug(`Processing post-update to Fleet agent policy: [${agentPolicy.id}]`);

    // We don't need to `await` for this function to execute. It can be done in the background
    createPolicyDataStreamsIfNeeded({
      endpointServices,
      endpointPolicyIds: [endpointPolicy.id],
    }).catch((e) => {
      logger.error(
        `Attempt to check and create DOT datastreams indexes for agent policy [${endpointPolicy.id}] failed`,
        { error: e }
      );
    });

    return agentPolicy;
  };
};

export const getPackagePolicyDeleteCallback = (
  endpointServices: EndpointAppContextService
): PostPackagePolicyPostDeleteCallback => {
  const exceptionsClient = endpointServices.getExceptionListsClient();
  const logger = endpointServices.createLogger('endpointPolicyDeleteCallback');

  return async (deletePackagePolicy): Promise<void> => {
    const policiesToRemove: Array<Promise<void>> = [];

    for (const policy of deletePackagePolicy) {
      if (isEndpointPackagePolicy(policy)) {
        logger.debug(`Processing deleted endpoint policy [${policy.id}]`);

        policiesToRemove.push(removePolicyFromArtifacts(exceptionsClient, policy, logger));
        policiesToRemove.push(removeProtectionUpdatesNote(endpointServices, policy));
      }
    }

    policiesToRemove.push(
      updateDeletedPolicyResponseActions(endpointServices, deletePackagePolicy)
    );

    await Promise.all(policiesToRemove);

    logger.debug(`Done processing deleted policies`);
  };
};
