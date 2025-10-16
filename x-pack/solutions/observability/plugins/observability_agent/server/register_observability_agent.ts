/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { OnechatPluginSetup } from '@kbn/onechat-plugin/server';
import { ToolType } from '@kbn/onechat-common';
import { ToolResultType } from '@kbn/onechat-common/tools/tool_result';
import { z } from '@kbn/zod';

const NAMESPACE = 'solution.observability';

// Tool IDs
export const TOOL_GET_SERVICES = `${NAMESPACE}.get_services`;
export const TOOL_GET_SERVICE_HEALTH = `${NAMESPACE}.get_service_health`;
export const TOOL_GET_ROOT_CAUSE = `${NAMESPACE}.get_root_cause_candidates`;
export const TOOL_GET_RELATED_LOGS = `${NAMESPACE}.get_related_logs`;
export const TOOL_GET_DEPLOY_MARKERS = `${NAMESPACE}.get_deploy_markers`;

// Agent ID
export const OBS_AGENT_ID = `${NAMESPACE}.agent`;

export function registerObservabilityAgent(onechat: OnechatPluginSetup) {
  // Register tools (builtin) — minimal functional skeletons
  onechat.tools.register({
    id: TOOL_GET_SERVICES,
    type: ToolType.builtin,
    description: 'Summarize observable services over a time range.',
    tags: ['observability', 'inventory'],
    schema: z.object({
      timeRange: z.object({ start: z.string(), end: z.string() }).describe('ISO datetimes'),
      index: z.string().optional().describe('Custom index pattern override'),
    }),
    handler: async (_params, { esClient }) => {
      // Placeholder: return an empty structured response. Implementation to follow.
      return {
        results: [
          {
            type: ToolResultType.other,
            data: { services: [], totalServices: 0 },
          },
        ],
      };
    },
  });

  onechat.tools.register({
    id: TOOL_GET_SERVICE_HEALTH,
    type: ToolType.builtin,
    description: 'Return latency/error rate/throughput trends for a service.',
    tags: ['observability', 'health'],
    schema: z.object({
      serviceName: z.string(),
      timeRange: z.object({ start: z.string(), end: z.string() }),
      environment: z.string().optional(),
      index: z.string().optional(),
    }),
    handler: async () => {
      return {
        results: [
          {
            type: ToolResultType.tabular_data,
            data: { columns: ['time', 'latencyP95', 'errorRate', 'tps'], rows: [] },
          },
        ],
      };
    },
  });

  onechat.tools.register({
    id: TOOL_GET_ROOT_CAUSE,
    type: ToolType.builtin,
    description: 'Analyze traces and surface top root-cause candidates.',
    tags: ['observability', 'rca'],
    schema: z.object({
      serviceName: z.string().optional(),
      timeRange: z.object({ start: z.string(), end: z.string() }),
      index: z.string().optional(),
      maxCandidates: z.number().int().min(1).max(50).default(10),
    }),
    handler: async () => {
      return {
        results: [
          {
            type: ToolResultType.other,
            data: { candidates: [] },
          },
        ],
      };
    },
  });

  onechat.tools.register({
    id: TOOL_GET_RELATED_LOGS,
    type: ToolType.builtin,
    description: 'Fetch recent error/warn logs related to a service/environment.',
    tags: ['observability', 'logs'],
    schema: z.object({
      serviceName: z.string(),
      timeRange: z.object({ start: z.string(), end: z.string() }),
      environment: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      index: z.string().optional(),
    }),
    handler: async () => {
      return {
        results: [
          {
            type: ToolResultType.tabular_data,
            data: { columns: ['@timestamp', 'level', 'message'], rows: [] },
          },
        ],
      };
    },
  });

  onechat.tools.register({
    id: TOOL_GET_DEPLOY_MARKERS,
    type: ToolType.builtin,
    description: 'List recent deploy markers and correlate with incidents.',
    tags: ['observability', 'deploy'],
    schema: z.object({
      serviceName: z.string().optional(),
      timeRange: z.object({ start: z.string(), end: z.string() }),
      index: z.string().optional(),
    }),
    handler: async () => {
      return {
        results: [
          {
            type: ToolResultType.tabular_data,
            data: { columns: ['time', 'version', 'source'], rows: [] },
          },
        ],
      };
    },
  });

  // Register built-in Observability Agent
  onechat.agents.register({
    id: OBS_AGENT_ID,
    name: 'Observability Agent',
    description: 'Root cause analysis assistant for Observability data',
    configuration: {
      instructions:
        'You are an Observability RCA assistant. Form hypotheses, validate with tools, extract evidence (queries/results), and avoid speculation.',
      tools: [
        {
          tool_ids: [
            TOOL_GET_SERVICES,
            TOOL_GET_SERVICE_HEALTH,
            TOOL_GET_ROOT_CAUSE,
            TOOL_GET_RELATED_LOGS,
            TOOL_GET_DEPLOY_MARKERS,
          ],
        },
      ],
    },
  });
}
