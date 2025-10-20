/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { ToolType } from '@kbn/onechat-common';
import { ToolResultType } from '@kbn/onechat-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/onechat-server';

export const incidentAggregateSchema = z.object({
  serviceName: z.string().optional(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
});

export const incidentViewAggregateTool = (): BuiltinToolDefinition<
  typeof incidentAggregateSchema
> => ({
  id: 'solution.observability.incident_view_aggregate',
  type: ToolType.builtin,
  description: 'Aggregate key RCA signals into one incident payload for UI overlays.',
  tags: ['observability', 'incident'],
  schema: incidentAggregateSchema,
  handler: async ({ serviceName, timeRange }, { runner }) => {
    const tasks = [] as Promise<any>[];
    tasks.push(
      runner.runTool({
        toolId: 'solution.observability.anomaly_detect_service_metrics',
        toolParams: { serviceName, timeRange },
        onEvent: () => {},
      })
    );
    tasks.push(
      runner.runTool({
        toolId: 'solution.observability.get_service_health',
        toolParams: { serviceName, timeRange },
        onEvent: () => {},
      })
    );
    tasks.push(
      runner.runTool({
        toolId: 'solution.observability.get_deploy_markers',
        toolParams: { serviceName, timeRange },
        onEvent: () => {},
      })
    );
    const [anomaly, health, deploys] = await Promise.all(tasks);

    return {
      results: [
        {
          type: ToolResultType.resource,
          data: {
            incident: {
              timeRange,
              serviceName,
              anomaly,
              health,
              deployments: deploys,
            },
          },
        },
      ],
    };
  },
});
