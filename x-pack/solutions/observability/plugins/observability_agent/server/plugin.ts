/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, CoreStart, Plugin, PluginInitializerContext } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import type { OnechatPluginSetup, OnechatPluginStart } from '@kbn/onechat-plugin/server';
import type {
  ApmDataAccessPluginSetup,
  ApmDataAccessPluginStart,
} from '@kbn/apm-data-access-plugin/server';
import type {
  LogsDataAccessPluginSetup,
  LogsDataAccessPluginStart,
} from '@kbn/logs-data-access-plugin/server';
import { registerObservabilityAgent } from './register_observability_agent';

export type ObservabilityAgentPluginSetup = Record<string, never>;
export type ObservabilityAgentPluginStart = Record<string, never>;

export interface ObservabilityAgentPluginSetupDependencies {
  onechat: OnechatPluginSetup;
  apmDataAccess: ApmDataAccessPluginSetup;
  logsDataAccess: LogsDataAccessPluginSetup;
}

export interface ObservabilityAgentPluginStartDependencies {
  onechat: OnechatPluginStart;
  apmDataAccess: ApmDataAccessPluginStart;
  logsDataAccess: LogsDataAccessPluginStart;
}

export class ObservabilityAgentPlugin
  implements
    Plugin<
      ObservabilityAgentPluginSetup,
      ObservabilityAgentPluginStart,
      ObservabilityAgentPluginSetupDependencies
    >
{
  private readonly logger: Logger;

  constructor(initContext: PluginInitializerContext) {
    this.logger = initContext.logger.get();
  }

  public setup(
    core: CoreSetup<ObservabilityAgentPluginStartDependencies, ObservabilityAgentPluginStart>,
    plugins: ObservabilityAgentPluginSetupDependencies
  ): ObservabilityAgentPluginSetup {
    registerObservabilityAgent({ core, plugins, logger: this.logger });
    return {};
  }

  public start(
    _core: CoreStart,
    _plugins: ObservabilityAgentPluginStartDependencies
  ): ObservabilityAgentPluginStart {
    return {};
  }

  public stop() {}
}
