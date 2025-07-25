/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PluginInitializerContext } from '@kbn/core/public';

import { lazy } from 'react';

import { FleetPlugin } from './plugin';

export type { GetPackagesResponse } from './types';
export { installationStatuses } from '../common/constants';

export type { FleetSetup, FleetStart, FleetStartServices } from './plugin';

export const plugin = (initializerContext: PluginInitializerContext) => {
  return new FleetPlugin(initializerContext);
};

export type { NewPackagePolicy, KibanaSavedObjectType } from './types';
export { SetupTechnology } from './types';
export {
  SetupTechnologySelector,
  SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ,
} from './services/setup_technology_selector';
export type {
  AgentDetailsReassignPolicyAction,
  AgentPolicyDetailsDeployAgentAction,
  AnyIntraAppRouteState,
  CreatePackagePolicyRouteState,
  IntegrationsAppBrowseRouteState,
  OnSaveQueryParamKeys,
  OnSaveQueryParamOpts,
} from './types/intra_app_route_state';
export type {
  AgentEnrollmentFlyoutFinalStepExtension,
  PackageAssetsComponent,
  PackageAssetsExtension,
  PackageCustomExtension,
  PackageCustomExtensionComponent,
  PackageCustomExtensionComponentProps,
  PackagePolicyCreateExtension,
  PackagePolicyCreateExtensionComponent,
  PackagePolicyCreateExtensionComponentProps,
  PackagePolicyCreateMultiStepExtension,
  PackagePolicyCreateMultiStepExtensionComponent,
  PackagePolicyEditExtension,
  PackagePolicyEditExtensionComponent,
  PackagePolicyEditExtensionComponentProps,
  PackagePolicyEditTabsExtension,
  PackagePolicyResponseExtension,
  PackagePolicyResponseExtensionComponent,
  PackagePolicyResponseExtensionComponentProps,
  PackageGenericErrorsListProps,
  PackageGenericErrorsListComponent,
  UIExtensionPoint,
  UIExtensionRegistrationCallback,
  UIExtensionsStorage,
} from './types/ui_extensions';

export { pagePathGetters, EPM_API_ROUTES } from './constants';
export { pkgKeyFromPackageInfo } from './services';
export type { CustomAssetsAccordionProps } from './components/custom_assets_accordion';
export { CustomAssetsAccordion } from './components/custom_assets_accordion';
export { CardIcon, PackageIcon } from './components/package_icon';
// Export Package editor components for custom editors
export { PackagePolicyEditorDatastreamPipelines } from './applications/fleet/sections/agent_policy/create_package_policy_page/components/datastream_pipelines';
export type { PackagePolicyEditorDatastreamPipelinesProps } from './applications/fleet/sections/agent_policy/create_package_policy_page/components/datastream_pipelines';
export { PackagePolicyEditorDatastreamMappings } from './applications/fleet/sections/agent_policy/create_package_policy_page/components/datastream_mappings';
export type { PackagePolicyEditorDatastreamMappingsProps } from './applications/fleet/sections/agent_policy/create_package_policy_page/components/datastream_mappings';
export type { DynamicPagePathValues } from './constants';

// This Type export is added to prevent error TS4023
export type { InputFieldProps } from './applications/fleet/sections/agent_policy/create_package_policy_page/components/steps/components/package_policy_input_var_field';

export const LazyPackagePolicyInputVarField = lazy(() =>
  import(
    './applications/fleet/sections/agent_policy/create_package_policy_page/components/steps/components/package_policy_input_var_field'
  ).then((module) => ({ default: module.PackagePolicyInputVarField }))
);
export type { PackageListGridProps } from './applications/integrations/sections/epm/components/package_list_grid';
export type { AvailablePackagesHookType } from './applications/integrations/sections/epm/screens/home/hooks/use_available_packages';
export type { IntegrationCardItem } from './applications/integrations/sections/epm/screens/home';
export type { CategoryFacet } from './applications/integrations/sections/epm/screens/home/category_facets';

export const PackageList = () => {
  return import('./applications/integrations/sections/epm/components/package_list_grid');
};
export const AvailablePackagesHook = () => {
  return import(
    './applications/integrations/sections/epm/screens/home/hooks/use_available_packages'
  );
};

export const LazyPackageCard = lazy(() =>
  import('./applications/integrations/sections/epm/components/package_card').then((module) => ({
    default: module.PackageCard,
  }))
);

export { useGetDataStreams } from './hooks/use_request/data_stream';
export { useGetPackagesQuery, useGetPackageInfoByKeyQuery } from './hooks/use_request/epm';
export { useGetSettingsQuery } from './hooks/use_request/settings';
export { useLink } from './hooks/use_link';
export { NamespaceComboBox } from './components/namespace_combo_box';
