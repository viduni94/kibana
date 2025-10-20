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

export interface DepMapDeps {
  apmDataAccess?: unknown;
}

export const depMapSchema = z.object({
  timeRange: z.object({ start: z.string(), end: z.string() }),
  focusService: z.string().optional(),
});

export const serviceDependencyMapTool = (
  deps: DepMapDeps = {}
): BuiltinToolDefinition<typeof depMapSchema> => ({
  id: 'solution.observability.service_dependency_map',
  type: ToolType.builtin,
  description: 'Fetch service dependency graph and overlay node health and versions if available.',
  tags: ['observability', 'graph'],
  schema: depMapSchema,
  handler: async ({ timeRange, focusService }, { logger }) => {
    try {
      const apm = deps.apmDataAccess as any;
      if (apm?.serviceMap?.getGraph) {
        const graph = await apm.serviceMap.getGraph({
          start: timeRange.start,
          end: timeRange.end,
          serviceName: focusService,
        });
        return {
          results: [{ type: ToolResultType.resource, data: { graph } }],
        };
      }
    } catch (e) {
      logger.debug(`service_dependency_map: APM data-access failed: ${String(e)}`);
    }

    // Fallback: minimal empty graph
    return {
      results: [{ type: ToolResultType.resource, data: { graph: { nodes: [], edges: [] } } }],
    };
  },
});
