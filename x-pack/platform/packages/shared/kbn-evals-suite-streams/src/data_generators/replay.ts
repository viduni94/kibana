/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import { createGcsRepository, replaySnapshot } from '@kbn/es-snapshot-loader';
import type { ToolingLog } from '@kbn/tooling-log';

const GCS_BUCKET = 'obs-ai-datasets';
const GCS_BASE_PATH = 'sigevents/otel-demo';

export const SIGEVENTS_SNAPSHOT_NAMES = {
  HEALTHY_BASELINE: 'healthy-baseline',
  PAYMENT_UNREACHABLE: 'payment-unreachable',
  CART_REDIS_CUTOFF: 'cart-redis-cutoff',
  CURRENCY_UNREACHABLE: 'currency-unreachable',
  CHECKOUT_MEMORY_STARVATION: 'checkout-memory-starvation',
  FLAGD_UNREACHABLE: 'flagd-unreachable',
  LOAD_GENERATOR_RAMP: 'load-generator-ramp',
} as const;

export type SigEventsSnapshotName =
  (typeof SIGEVENTS_SNAPSHOT_NAMES)[keyof typeof SIGEVENTS_SNAPSHOT_NAMES];

export async function replaySignificantEventsSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string
) {
  log.debug(`Replaying significant events data from snapshot: ${snapshotName}`);

  await replaySnapshot({
    esClient,
    log,
    repository: createGcsRepository({ bucket: GCS_BUCKET, basePath: GCS_BASE_PATH }),
    snapshotName,
    patterns: ['logs*'],
  });
}

export async function cleanSignificantEventsDataStreams(esClient: Client): Promise<void> {
  await esClient.deleteByQuery({
    index: 'logs*',
    query: { match_all: {} },
    refresh: true,
  });
}
