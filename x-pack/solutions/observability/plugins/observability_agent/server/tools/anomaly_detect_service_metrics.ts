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

export interface AnomalyDeps {
  apmDataAccess?: unknown;
}

export const anomalyDetectSchema = z.object({
  serviceName: z.string(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  environment: z.string().optional(),
  index: z.string().optional(),
});

export const anomalyDetectServiceMetricsTool = (
  deps: AnomalyDeps = {}
): BuiltinToolDefinition<typeof anomalyDetectSchema> => ({
  id: 'solution.observability.anomaly_detect_service_metrics',
  type: ToolType.builtin,
  description: 'Detect spikes/anomalies in service metrics (latency, error rate, throughput).',
  tags: ['observability', 'anomaly'],
  schema: anomalyDetectSchema,
  handler: async ({ serviceName, timeRange, environment, index }, { esClient, logger }) => {
    const from = toDate(timeRange.start);
    const to = toDate(timeRange.end);
    const interval = pickAutoInterval(from, to);

    // Try APM data-access first (if an anomaly endpoint exists in your env, use it here)
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
        // Simple anomaly score: z-like by local windows (placeholder deterministic)
        const anomalies = [] as Array<{ time: string; metric: string; score: number }>;
        // naive scan
        for (let i = 1; i < rows.length - 1; i++) {
          const prev = rows[i - 1][1] as number;
          const cur = rows[i][1] as number;
          const next = rows[i + 1][1] as number;
          const spike = cur > ((prev + next) / 2) * 1.5;
          if (spike) anomalies.push({ time: rows[i][0] as string, metric: 'latencyP95', score: 1 });
        }
        return {
          results: [
            {
              type: ToolResultType.tabularData,
              data: { columns: ['time', 'latencyP95', 'errorRate', 'tps'], rows },
            },
            { type: ToolResultType.other, data: { anomalies } },
          ],
        };
      }
    } catch (e) {
      logger.debug(
        `anomaly_detect_service_metrics: APM data-access failed, falling back to ES: ${String(e)}`
      );
    }

    const indices: string[] = index ? [index] : (getApmIndices() as string[]);
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
        ts: {
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
    const buckets = (resp.aggregations as any)?.ts?.buckets ?? [];
    const rows = buckets.map((b: any) => {
      const p95 = b.p95_latency?.values?.['95.0'] ?? 0;
      const total = b.total?.value ?? 0;
      const failed = b.failures?.count?.value ?? 0;
      const errorRate = total > 0 ? failed / total : 0;
      const tps = total;
      return [new Date(b.key).toISOString(), p95, errorRate, tps];
    });

    const anomalies: Array<{ time: string; metric: string; score: number }> = [];
    for (let i = 1; i < rows.length - 1; i++) {
      const prev = rows[i - 1][1] as number;
      const cur = rows[i][1] as number;
      const next = rows[i + 1][1] as number;
      const spike = cur > ((prev + next) / 2) * 1.5;
      if (spike) anomalies.push({ time: rows[i][0] as string, metric: 'latencyP95', score: 1 });
    }

    return {
      results: [
        {
          type: ToolResultType.tabularData,
          data: { columns: ['time', 'latencyP95', 'errorRate', 'tps'], rows },
        },
        { type: ToolResultType.other, data: { anomalies } },
      ],
    };
  },
});
