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
import { getLogsIndices } from '../utils/get_logs_indices';

export interface LogOutlierDeps {
  ml?: unknown;
}

export const logOutliersSchema = z.object({
  serviceName: z.string(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  environment: z.string().optional(),
  limitPatterns: z.number().int().min(1).max(50).default(10),
});

export const logPatternOutliersTool = (
  _deps: LogOutlierDeps = {}
): BuiltinToolDefinition<typeof logOutliersSchema> => ({
  id: 'solution.observability.log_pattern_outliers',
  type: ToolType.builtin,
  description: 'Group logs by message patterns and surface rare/spiky groups.',
  tags: ['observability', 'logs'],
  schema: logOutliersSchema,
  handler: async ({ serviceName, timeRange, environment, limitPatterns }, { esClient }) => {
    const index = getLogsIndices() as string[];
    // Heuristic: Top patterns via terms on normalized message.keyword (if exists) or message
    const body = {
      size: 0,
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: timeRange.start, lte: timeRange.end } } },
            { term: { 'service.name': serviceName } },
            ...(environment ? [{ term: { 'service.environment': environment } }] : []),
          ],
        },
      },
      aggs: {
        patterns: {
          terms: { field: 'message.keyword', size: limitPatterns, missing: 'unknown' },
        },
      },
    } as Record<string, any>;
    const resp = await esClient.asCurrentUser.search({ index, body });
    const buckets = (resp.aggregations as any)?.patterns?.buckets ?? [];
    const groups = buckets.map((b: any) => ({ pattern: b.key, documents: b.doc_count }));
    return {
      results: [{ type: ToolResultType.other, data: { groups } }],
    };
  },
});
