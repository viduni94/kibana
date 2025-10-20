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
import { getApmIndices } from '../utils/get_apm_indices';

export const getDeployMarkersSchema = z.object({
  serviceName: z.string().optional(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  index: z.string().optional(),
});

export interface DeployMarkersDeps {
  apmDataAccess?: unknown;
}

export const getDeployMarkersTool = (
  deps: DeployMarkersDeps = {}
): BuiltinToolDefinition<typeof getDeployMarkersSchema> => ({
  id: 'solution.observability.get_deploy_markers',
  type: ToolType.builtin,
  description: 'List recent deploy markers and correlate with incidents.',
  tags: ['observability', 'deploy'],
  schema: getDeployMarkersSchema,
  handler: async ({ serviceName, timeRange, index }, { esClient, logger }) => {
    // Prefer APM data-access if available (annotations or version timeline)
    try {
      const apm = deps.apmDataAccess as any;
      if (apm?.versions?.getServiceVersions) {
        const versions = await apm.versions.getServiceVersions({
          serviceName,
          start: timeRange.start,
          end: timeRange.end,
        });
        const rows = (versions ?? []).map((v: any) => [
          v.time ?? v.firstSeen ?? v.lastSeen,
          v.version ?? 'unknown',
          'apm',
        ]);
        return {
          results: [
            {
              type: ToolResultType.tabularData,
              data: { columns: ['time', 'version', 'source'], rows },
            },
          ],
        };
      }
    } catch (e) {
      logger.debug(`get_deploy_markers: APM data-access failed, falling back to ES: ${String(e)}`);
    }
    const indices: string[] = index ? [index] : (getApmIndices() as string[]);
    const filters = [
      { range: { '@timestamp': { gte: timeRange.start, lte: timeRange.end } } },
      ...(serviceName ? [{ term: { 'service.name': serviceName } }] : []),
    ];

    // Heuristic: find distinct service.version changes in the window by terms agg on version
    const body = {
      size: 0,
      query: { bool: { filter: filters } },
      aggs: {
        versions: {
          terms: { field: 'service.version', size: 50, missing: 'unknown' },
          aggs: {
            first_seen: { min: { field: '@timestamp' } },
            last_seen: { max: { field: '@timestamp' } },
          },
        },
      },
    } as Record<string, any>;

    const resp = await esClient.asCurrentUser.search({ index: indices, body });
    const rows = ((resp.aggregations as any)?.versions?.buckets ?? []).map((b: any) => [
      new Date(b.first_seen?.value || b.last_seen?.value || Date.now()).toISOString(),
      b.key,
      'apm',
    ]);

    return {
      results: [
        {
          type: ToolResultType.tabularData,
          data: { columns: ['time', 'version', 'source'], rows },
        },
      ],
    };
  },
});
