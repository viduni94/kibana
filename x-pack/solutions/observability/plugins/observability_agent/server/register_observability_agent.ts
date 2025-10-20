/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/onechat-common';
import type { CoreSetup } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type {
  ObservabilityAgentPluginSetupDependencies,
  ObservabilityAgentPluginStart,
  ObservabilityAgentPluginStartDependencies,
} from './plugin';

const NAMESPACE = 'solution.observability';

// Tool IDs
export const TOOL_GET_SERVICES = `${NAMESPACE}.get_services`;
export const TOOL_GET_SERVICE_HEALTH = `${NAMESPACE}.get_service_health`;
export const TOOL_GET_ROOT_CAUSE = `${NAMESPACE}.get_root_cause_candidates`;
export const TOOL_GET_RELATED_LOGS = `${NAMESPACE}.get_related_logs`;
export const TOOL_GET_DEPLOY_MARKERS = `${NAMESPACE}.get_deploy_markers`;

// Agent ID
export const OBS_AGENT_ID = `${NAMESPACE}.agent`;

export function registerObservabilityAgent({
  core,
  plugins,
  logger,
}: {
  core: CoreSetup<ObservabilityAgentPluginStartDependencies, ObservabilityAgentPluginStart>;
  plugins: ObservabilityAgentPluginSetupDependencies;
  logger: Logger;
}) {
  const { onechat } = plugins;

  // Register tools from separate modules
  const loadTools = async () => {
    const { getServicesTool } = await import('./tools/get_services');
    const { getServiceHealthTool } = await import('./tools/get_service_health');
    const { getRootCauseCandidatesTool } = await import('./tools/get_root_cause_candidates');
    const { getRelatedLogsTool } = await import('./tools/get_related_logs');
    const { getDeployMarkersTool } = await import('./tools/get_deploy_markers');
    const { anomalyDetectServiceMetricsTool } = await import(
      './tools/anomaly_detect_service_metrics'
    );
    const { crossSignalCorrelatorTool } = await import('./tools/cross_signal_correlator');
    const { serviceDependencyMapTool } = await import('./tools/service_dependency_map');
    const { guidedKqlBuilderTool } = await import('./tools/guided_kql_builder');
    const { logPatternOutliersTool } = await import('./tools/log_pattern_outliers');
    const { incidentViewAggregateTool } = await import('./tools/incident_view_aggregate');
    onechat.tools.register(getServicesTool({ apmDataAccess: (plugins as any).apmDataAccess }));
    onechat.tools.register(getServiceHealthTool({ apmDataAccess: (plugins as any).apmDataAccess }));
    onechat.tools.register(
      getRootCauseCandidatesTool({
        apmDataAccess: (plugins as any).apmDataAccess,
        logsDataAccess: (plugins as any).logsDataAccess,
      })
    );
    onechat.tools.register(getRelatedLogsTool({ logsDataAccess: (plugins as any).logsDataAccess }));
    onechat.tools.register(getDeployMarkersTool({ apmDataAccess: (plugins as any).apmDataAccess }));
    onechat.tools.register(
      anomalyDetectServiceMetricsTool({ apmDataAccess: (plugins as any).apmDataAccess })
    );
    onechat.tools.register(
      crossSignalCorrelatorTool({
        apmDataAccess: (plugins as any).apmDataAccess,
        logsDataAccess: (plugins as any).logsDataAccess,
      })
    );
    onechat.tools.register(
      serviceDependencyMapTool({ apmDataAccess: (plugins as any).apmDataAccess })
    );
    onechat.tools.register(guidedKqlBuilderTool());
    onechat.tools.register(logPatternOutliersTool());
    onechat.tools.register(incidentViewAggregateTool());
  };

  void loadTools();

  // Register built-in Observability Agent
  onechat.agents.register({
    id: OBS_AGENT_ID,
    name: 'Observability Agent',
    description:
      'Observability assistant specialized in logs, metrics, and traces including root cause analysis.',
    configuration: {
      instructions:
        'You are an Observability assistant. You understand logs, metrics, and traces. Form hypotheses when investigating issues, validate them using the provided tools, correlate across data types, and include supporting evidence (queries/results). Perform root-cause analysis as needed and avoid speculation.',
      tools: [
        {
          tool_ids: [
            platformCoreTools.search,
            platformCoreTools.listIndices,
            platformCoreTools.getIndexMapping,
            platformCoreTools.getDocumentById,
            platformCoreTools.generateEsql,
            platformCoreTools.executeEsql,
            TOOL_GET_SERVICES,
            TOOL_GET_SERVICE_HEALTH,
            TOOL_GET_ROOT_CAUSE,
            TOOL_GET_RELATED_LOGS,
            TOOL_GET_DEPLOY_MARKERS,
            'solution.observability.anomaly_detect_service_metrics',
            'solution.observability.cross_signal_correlator',
            'solution.observability.service_dependency_map',
            'solution.observability.guided_kql_builder',
            'solution.observability.log_pattern_outliers',
            'solution.observability.incident_view_aggregate',
          ],
        },
      ],
    },
  });
}
