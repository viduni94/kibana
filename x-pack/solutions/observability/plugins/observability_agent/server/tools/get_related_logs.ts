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

export interface RelatedLogsDeps {
  logsDataAccess?: unknown;
}

export const getRelatedLogsSchema = z.object({
  serviceName: z.string(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  environment: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  index: z.string().optional(),
});

export const getRelatedLogsTool = (
  deps: RelatedLogsDeps = {}
): BuiltinToolDefinition<typeof getRelatedLogsSchema> => ({
  id: 'solution.observability.get_related_logs',
  type: ToolType.builtin,
  description: 'Fetch recent error/warn logs related to a service/environment.',
  tags: ['observability', 'logs'],
  schema: getRelatedLogsSchema,
  handler: async ({ serviceName, timeRange, environment, limit, index }, { esClient, logger }) => {
    // Prefer Logs data-access if available
    try {
      const logs = deps.logsDataAccess as any;
      if (logs?.entries?.find) {
        const entries = await logs.entries.find({
          start: timeRange.start,
          end: timeRange.end,
          filter: {
            and: [
              { term: { 'service.name': serviceName } },
              ...(environment ? [{ term: { 'service.environment': environment } }] : []),
            ],
            or: [{ term: { 'log.level': 'error' } }, { exists: { field: 'error.message' } }],
          },
          size: limit,
        });
        const rows = (entries ?? []).map((e: any) => [
          e['@timestamp'],
          e['log.level'] ?? 'info',
          e.message ?? '',
        ]);
        return {
          results: [
            {
              type: ToolResultType.tabularData,
              data: { columns: ['@timestamp', 'level', 'message'], rows },
            },
          ],
        };
      }
    } catch (e) {
      logger.debug(`get_related_logs: logs data-access failed, falling back to ES: ${String(e)}`);
    }
    const indices: string[] = index ? [index] : (getLogsIndices() as string[]);
    const body = {
      size: limit,
      sort: [{ '@timestamp': 'desc' }],
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: timeRange.start, lte: timeRange.end } } },
            { term: { 'service.name': serviceName } },
            ...(environment ? [{ term: { 'service.environment': environment } }] : []),
          ],
          should: [
            { term: { 'log.level': 'error' } },
            { term: { 'log.level': 'warn' } },
            { exists: { field: 'error.message' } },
          ],
          minimum_should_match: 1,
        },
      },
      _source: [
        '@timestamp',
        'log.level',
        'message',
        'error.message',
        'service.name',
        'service.environment',
      ],
    } as Record<string, any>;

    const resp = await esClient.asCurrentUser.search({ index: indices, body });
    const rows = (resp.hits.hits || []).map((h: any) => {
      const s = h._source || {};
      const level = s['log.level'] || (s.error?.message ? 'error' : undefined) || 'info';
      const message = s.message || s.error?.message || '';
      return [s['@timestamp'], level, message];
    });

    return {
      results: [
        {
          type: ToolResultType.tabularData,
          data: { columns: ['@timestamp', 'level', 'message'], rows },
        },
      ],
    };
  },
});
