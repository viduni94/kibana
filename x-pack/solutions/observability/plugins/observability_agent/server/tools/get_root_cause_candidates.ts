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
import { weightedScore } from '../utils/scoring';

export const getRootCauseCandidatesSchema = z.object({
  serviceName: z.string().optional(),
  timeRange: z.object({ start: z.string(), end: z.string() }),
  index: z.string().optional(),
  maxCandidates: z.number().int().min(1).max(50).default(10),
});

export interface RcaDeps {
  apmDataAccess?: unknown;
  logsDataAccess?: unknown;
}

export const getRootCauseCandidatesTool = (
  _deps: RcaDeps = {}
): BuiltinToolDefinition<typeof getRootCauseCandidatesSchema> => ({
  id: 'solution.observability.get_root_cause_candidates',
  type: ToolType.builtin,
  description: 'Analyze traces and surface top root-cause candidates.',
  tags: ['observability', 'rca'],
  schema: getRootCauseCandidatesSchema,
  handler: async ({ serviceName, timeRange, index, maxCandidates }, { esClient, events }) => {
    events.reportProgress('Collecting current window metrics');
    const indices: string[] = index ? [index] : (getApmIndices() as string[]);
    const logsIndices: string[] = getLogsIndices() as string[];

    const commonFilters = [
      { range: { '@timestamp': { gte: timeRange.start, lte: timeRange.end } } },
      ...(serviceName ? [{ term: { 'service.name': serviceName } }] : []),
    ];

    // Current window: service+operation error rate and latency p95
    const currentAggBody = {
      size: 0,
      query: { bool: { filter: commonFilters } },
      aggs: {
        by_service: {
          terms: { field: 'service.name', size: 200 },
          aggs: {
            by_op: {
              terms: { field: 'transaction.name', size: 200, missing: 'unknown' },
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
        },
      },
    };

    const currentResp = await esClient.asCurrentUser.search({
      index: indices,
      body: currentAggBody as Record<string, any>,
    });

    events.reportProgress('Collecting related log bursts');
    const logsBody = {
      size: 0,
      query: {
        bool: {
          filter: commonFilters,
          should: [{ term: { 'log.level': 'error' } }, { exists: { field: 'error.message' } }],
          minimum_should_match: 1,
        },
      },
      aggs: {
        by_service: { terms: { field: 'service.name', size: 200 } },
      },
    };
    const logsResp = await esClient.asCurrentUser.search({
      index: logsIndices,
      body: logsBody as Record<string, any>,
    });

    const logCounts: Record<string, number> = {};
    for (const b of ((logsResp.aggregations as any)?.by_service?.buckets ?? []) as any[]) {
      logCounts[b.key] = b.doc_count;
    }

    events.reportProgress('Ranking candidates');
    const candidates: Array<{
      service: string;
      operation: string;
      score: number;
      errorRate: number;
      latencyP95: number;
      logs: number;
    }> = [];

    for (const s of ((currentResp.aggregations as any)?.by_service?.buckets ?? []) as any[]) {
      for (const op of (s.by_op?.buckets ?? []) as any[]) {
        const total = op.total?.value ?? 0;
        const failed = op.failures?.count?.value ?? 0;
        const errorRate = total > 0 ? failed / total : 0;
        const latencyP95 = op.p95_latency?.values?.['95.0'] ?? 0;
        const logs = logCounts[s.key] ?? 0;
        // Simple weighted score; future: baseline deltas/z-scores
        const score = weightedScore([
          [errorRate, 0.5],
          [latencyP95, 0.3],
          [logs, 0.2],
        ]);
        candidates.push({ service: s.key, operation: op.key, score, errorRate, latencyP95, logs });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const top = candidates.slice(0, maxCandidates);

    return {
      results: [
        {
          type: ToolResultType.other,
          data: { candidates: top },
        },
      ],
    };
  },
});
