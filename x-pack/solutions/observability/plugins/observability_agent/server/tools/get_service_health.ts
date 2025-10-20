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
import { pickAutoInterval, toDate } from '../utils/time';

export const getServiceHealthSchema = z.object({
  serviceName: z.string(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  environment: z.string().optional(),
  index: z.string().optional(),
});

export interface ServiceHealthDeps {
  apmDataAccess?: unknown;
}

export const getServiceHealthTool = (
  deps: ServiceHealthDeps = {}
): BuiltinToolDefinition<typeof getServiceHealthSchema> => ({
  id: 'solution.observability.get_service_health',
  type: ToolType.builtin,
  description: 'Return latency/error rate/throughput trends for a service.',
  tags: ['observability', 'health'],
  schema: getServiceHealthSchema,
  handler: async ({ serviceName, timeRange, environment, index }, { esClient, logger }) => {
    // Prefer APM data-access if available
    try {
      const apm = deps.apmDataAccess as any;
      if (apm?.timeseries?.getServiceMetrics) {
        const series = await apm.timeseries.getServiceMetrics({
          serviceName,
          start: timeRange.start,
          end: timeRange.end,
          environment,
        });
        const rows = (series?.buckets ?? []).map((b: any) => [
          new Date(b.time).toISOString(),
          b.latencyP95 ?? 0,
          b.errorRate ?? 0,
          b.throughput ?? 0,
        ]);
        return {
          results: [
            {
              type: ToolResultType.tabularData,
              data: { columns: ['time', 'latencyP95', 'errorRate', 'tps'], rows },
            },
          ],
        };
      }
    } catch (e) {
      logger.debug(`get_service_health: APM data-access failed, falling back to ES: ${String(e)}`);
    }
    const indices: string[] = index ? [index] : (getApmIndices() as string[]);
    const from = toDate(timeRange.start);
    const to = toDate(timeRange.end);
    const interval = pickAutoInterval(from, to);

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
        timeseries: {
          date_histogram: { field: '@timestamp', fixed_interval: interval, min_doc_count: 0 },
          aggs: {
            p95_latency: { percentiles: { field: 'transaction.duration.us', percents: [95] } },
            total: { value_count: { field: 'trace.id' } },
            failures: {
              filter: { term: { 'event.outcome': 'failure' } },
              aggs: { count: { value_count: { field: 'trace.id' } } },
            },
          },
        },
      },
    } as Record<string, any>;

    const resp = await esClient.asCurrentUser.search({ index: indices, body });
    const buckets = (resp.aggregations as any)?.timeseries?.buckets ?? [];
    const rows = buckets.map((b: any) => {
      const p95 = b.p95_latency?.values?.['95.0'] ?? 0;
      const total = b.total?.value ?? 0;
      const failed = b.failures?.count?.value ?? 0;
      const errorRate = total > 0 ? failed / total : 0;
      const tps = total; // value_count per bucket; treat as count per interval; UI may scale
      return [new Date(b.key).toISOString(), p95, errorRate, tps];
    });

    return {
      results: [
        {
          type: ToolResultType.tabularData,
          data: { columns: ['time', 'latencyP95', 'errorRate', 'tps'], rows },
        },
      ],
    };
  },
});
