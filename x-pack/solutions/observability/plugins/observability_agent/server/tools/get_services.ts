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

export interface ToolDeps {
  apmDataAccess?: unknown;
}

export const getServicesSchema = z.object({
  timeRange: z.object({ start: z.string(), end: z.string() }),
  index: z.string().optional(),
});

export const getServicesTool = (
  deps: ToolDeps = {}
): BuiltinToolDefinition<typeof getServicesSchema> => ({
  id: 'solution.observability.get_services',
  type: ToolType.builtin,
  description: 'Summarize observable services over a time range.',
  tags: ['observability', 'inventory'],
  schema: getServicesSchema,
  handler: async ({ timeRange, index }, { esClient, logger }) => {
    // Prefer APM data-access if available
    try {
      const apm = deps.apmDataAccess as any;
      if (apm?.serviceInventory?.getServices) {
        const services = await apm.serviceInventory.getServices({
          start: timeRange.start,
          end: timeRange.end,
          kuery: undefined,
        });
        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                results: services.map((s: any) => ({
                  serviceName: s.serviceName ?? s.name ?? 'unknown',
                  totalDocuments: s.docCount ?? s.events ?? 0,
                  dataStreamTypes: s.types
                    ? s.types.map((t: any) => ({ type: t, documents: 0 }))
                    : [],
                  environments: s.environments
                    ? s.environments.map((e: string) => ({ environment: e, documents: 0 }))
                    : [],
                  lastSeen: s.lastSeen,
                })),
                totalServices: services.length,
              },
            },
          ],
        };
      }
    } catch (e) {
      logger.debug(`get_services: APM data-access failed, falling back to ES: ${String(e)}`);
    }
    const indices: string[] = Array.isArray(index)
      ? (index as unknown as string[])
      : index
      ? [index]
      : ([...getApmIndices(), ...getLogsIndices()] as string[]);

    const body = {
      size: 0,
      query: {
        bool: {
          filter: [{ range: { '@timestamp': { gte: timeRange.start, lte: timeRange.end } } }],
        },
      },
      aggs: {
        services: {
          terms: { field: 'service.name', size: 1000, missing: 'unknown' },
          aggs: {
            by_type: { terms: { field: 'data_stream.type', size: 10, missing: 'unknown' } },
            environments: {
              terms: { field: 'service.environment', size: 20, missing: 'unknown' },
            },
            last_seen: { max: { field: '@timestamp' } },
          },
        },
      },
    } as Record<string, any>;

    const resp = await esClient.asCurrentUser.search({ index: indices, body });
    const buckets = (resp.aggregations as any)?.services?.buckets ?? [];
    const services = buckets.map((b: any) => ({
      serviceName: b.key,
      totalDocuments: b.doc_count,
      dataStreamTypes: (b.by_type?.buckets ?? []).map((tb: any) => ({
        type: tb.key,
        documents: tb.doc_count,
      })),
      environments: (b.environments?.buckets ?? []).map((eb: any) => ({
        environment: eb.key,
        documents: eb.doc_count,
      })),
      lastSeen: b.last_seen?.value ? new Date(b.last_seen.value).toISOString() : undefined,
    }));

    return {
      results: [
        {
          type: ToolResultType.other,
          data: {
            results: services,
            totalServices: services.length,
          },
        },
      ],
    };
  },
});
