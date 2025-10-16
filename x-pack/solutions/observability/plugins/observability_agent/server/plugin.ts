/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Plugin } from '@kbn/core/server';
import type { OnechatPluginSetup } from '@kbn/onechat-plugin/server';
import { registerObservabilityAgent } from './register_observability_agent';

export interface ObservabilityAgentPluginSetup {}
export interface ObservabilityAgentPluginStart {}

export interface ObservabilityAgentSetupDeps {
  onechat: OnechatPluginSetup;
}

export class ObservabilityAgentPlugin
  implements
    Plugin<
      ObservabilityAgentPluginSetup,
      ObservabilityAgentPluginStart,
      ObservabilityAgentSetupDeps
    >
{
  public setup(_core: CoreSetup, deps: ObservabilityAgentSetupDeps): ObservabilityAgentPluginSetup {
    registerObservabilityAgent(deps.onechat);
    return {};
  }

  public start(): ObservabilityAgentPluginStart {
    return {};
  }

  public stop() {}
}
