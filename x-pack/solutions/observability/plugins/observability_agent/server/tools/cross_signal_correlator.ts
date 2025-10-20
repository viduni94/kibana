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
import { getLogsIndices } from '../utils/get_logs_indices';
import { pickAutoInterval, toDate } from '../utils/time';

export interface CorrelatorDeps {
  apmDataAccess?: unknown;
  logsDataAccess?: unknown;
}

export const crossSignalSchema = z.object({
  serviceName: z.string(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  environment: z.string().optional(),
});

const corr = (a: number[], b: number[]) => {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / n;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db) || 1;
  return num / den;
};

export const crossSignalCorrelatorTool = (
  _deps: CorrelatorDeps = {}
): BuiltinToolDefinition<typeof crossSignalSchema> => ({
  id: 'solution.observability.cross_signal_correlator',
  type: ToolType.builtin,
  description: 'Correlate service metrics and log bursts across time; compute correlation and lag.',
  tags: ['observability', 'correlator'],
  schema: crossSignalSchema,
  handler: async ({ serviceName, timeRange, environment }, { esClient }) => {
    const indices = getApmIndices() as string[];
    const logsIdx = getLogsIndices() as string[];
    const from = toDate(timeRange.start);
    const to = toDate(timeRange.end);
    const interval = pickAutoInterval(from, to);

    const tsBody = {
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
    const logsBody = {
      size: 0,
      query: {
        bool: {
          filter: [
            { range: { '@timestamp': { gte: timeRange.start, lte: timeRange.end } } },
            { term: { 'service.name': serviceName } },
            ...(environment ? [{ term: { 'service.environment': environment } }] : []),
          ],
          should: [{ term: { 'log.level': 'error' } }, { exists: { field: 'error.message' } }],
          minimum_should_match: 1,
        },
      },
      aggs: {
        ts: { date_histogram: { field: '@timestamp', fixed_interval: interval, min_doc_count: 0 } },
      },
    } as Record<string, any>;

    const [metricsResp, logsResp] = await Promise.all([
      esClient.asCurrentUser.search({ index: indices, body: tsBody }),
      esClient.asCurrentUser.search({ index: logsIdx, body: logsBody }),
    ]);

    const mBuckets = (metricsResp.aggregations as any)?.ts?.buckets ?? [];
    const lBuckets = (logsResp.aggregations as any)?.ts?.buckets ?? [];
    const seriesLatency = mBuckets.map((b: any) => b.p95_latency?.values?.['95.0'] ?? 0);
    const seriesErrors = mBuckets.map((b: any) => b.failures?.count?.value ?? 0);
    const seriesLogs = lBuckets.map((b: any) => b.doc_count ?? 0);

    // Base correlation at zero-lag
    const result = [
      { metric: 'latencyP95', logsCorr: corr(seriesLatency, seriesLogs), lagMs: 0 },
      { metric: 'errors', logsCorr: corr(seriesErrors, seriesLogs), lagMs: 0 },
    ];

    return {
      results: [{ type: ToolResultType.other, data: { correlations: result, interval } }],
    };
  },
});
