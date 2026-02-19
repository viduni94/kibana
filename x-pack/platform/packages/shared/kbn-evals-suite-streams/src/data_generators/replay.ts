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

/**
 * Identifies which snapshot run to replay. Each run is stored in its own
 * GCS subfolder: `sigevents/otel-demo/<run-id>/`.
 *
 * Update this value after creating new snapshots with:
 *   node scripts/create_sigevents_snapshots.js --connector-id <id>
 */
export const SIGEVENTS_SNAPSHOT_RUN = '2026-02-19';

// const GCS_BASE_PATH = `sigevents/otel-demo/${SIGEVENTS_SNAPSHOT_RUN}`;
const GCS_BASE_PATH = `sigevents/otel-demo`;

const SIGEVENTS_INDEX_TEMPLATE = 'sigevents-otel-logs';

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

/**
 * OTel Demo data requires two mapping workarounds for clean reindexing:
 *
 * 1. `subobjects: false` -- Different services emit `resource.attributes.app`
 *    as a flat string or a nested object. Flattening all fields to leaves
 *    eliminates the structural mapping conflict.
 *
 * 2. `ignore_malformed: true` -- Fields like `attributes.log.timestamp`
 *    contain epoch millis in scientific notation (e.g. `1.771443280796E12`)
 *    which ES's date parser rejects. Ignoring malformed values lets the
 *    document index successfully while silently dropping the unparseable field.
 */
async function ensureLogsIndexTemplate(esClient: Client, log: ToolingLog): Promise<void> {
  log.debug(`Creating index template "${SIGEVENTS_INDEX_TEMPLATE}"`);

  await esClient.indices.putIndexTemplate({
    name: SIGEVENTS_INDEX_TEMPLATE,
    index_patterns: ['logs'],
    data_stream: {},
    template: {
      settings: {
        index: {
          mapping: {
            ignore_malformed: true,
          },
        },
      },
      mappings: {
        subobjects: false,
      },
    },
    priority: 500,
  });
}

async function deleteLogsIndexTemplate(esClient: Client, log: ToolingLog): Promise<void> {
  try {
    await esClient.indices.deleteIndexTemplate({ name: SIGEVENTS_INDEX_TEMPLATE });
  } catch {
    log.debug(`Failed to delete index template "${SIGEVENTS_INDEX_TEMPLATE}" (may not exist)`);
  }
}

export async function replaySignificantEventsSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string
) {
  log.debug(`Replaying significant events data from snapshot: ${snapshotName}`);

  await cleanSignificantEventsDataStreams(esClient, log);
  await ensureLogsIndexTemplate(esClient, log);

  await replaySnapshot({
    esClient,
    log,
    repository: createGcsRepository({ bucket: GCS_BUCKET, basePath: GCS_BASE_PATH }),
    snapshotName,
    patterns: ['logs*'],
  });
}

export async function cleanSignificantEventsDataStreams(
  esClient: Client,
  log: ToolingLog
): Promise<void> {
  try {
    await esClient.indices.deleteDataStream({ name: 'logs*' });
  } catch {
    log.debug('No logs data stream to delete');
  }

  await deleteLogsIndexTemplate(esClient, log);
}

const REPLAY_TEMP_PREFIX = 'sigevents-replay-temp-';

const TIMESTAMP_TRANSFORM_SCRIPT = `
  ctx._id = null;
  if (ctx.containsKey('@timestamp') && ctx['@timestamp'] != null) {
    Instant maxTime = Instant.parse(params.max_timestamp);
    Instant originalTime = Instant.parse(ctx['@timestamp'].toString());
    long deltaMillis = maxTime.toEpochMilli() - originalTime.toEpochMilli();
    Instant now = Instant.ofEpochMilli(System.currentTimeMillis());
    ctx['@timestamp'] = now.minusMillis(deltaMillis).toString();
  }
`;

export interface ReplayStats {
  total: number;
  created: number;
  skipped: number;
}

/**
 * Replays a snapshot into the managed `logs` ES stream by setting a
 * `default_pipeline` on the write index rather than specifying a per-request
 * pipeline. ES streams reject per-request pipelines but honour the
 * `default_pipeline` index setting — the same mechanism the Streams plugin
 * itself uses for its own processing pipelines.
 *
 * Documents that fail due to mapping conflicts (e.g. `resource.attributes.app`
 * typed as string in one service and object in another) are skipped.  The
 * returned {@link ReplayStats} reports how many documents were indexed vs
 * skipped so callers can decide whether the drop rate is acceptable.
 */
export async function replayIntoManagedStream(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string
): Promise<ReplayStats> {
  log.debug(`Replaying snapshot "${snapshotName}" into managed logs stream`);

  const repoName = `sigevents-replay-${Date.now()}`;
  const repository = createGcsRepository({ bucket: GCS_BUCKET, basePath: GCS_BASE_PATH });
  const pipelineName = `sigevents-ts-transform-${Date.now()}`;
  const tempIndices: string[] = [];
  let previousDefaultPipeline: string | null = null;
  let writeIndexName: string | null = null;

  try {
    repository.validate();
    await repository.register({ esClient, log, repoName });

    const snapshotInfo = await esClient.snapshot.get({
      repository: repoName,
      snapshot: snapshotName,
    });

    const snap = snapshotInfo.snapshots?.[0];
    if (!snap) {
      throw new Error(`Snapshot "${snapshotName}" not found in repository "${repoName}"`);
    }

    const logsIndices = (snap.indices ?? []).filter(
      (idx) => idx.startsWith('.ds-logs') || idx === 'logs'
    );
    if (logsIndices.length === 0) {
      throw new Error(`No logs indices found in snapshot "${snapshotName}"`);
    }

    log.debug(`Restoring ${logsIndices.length} indices to temp location`);
    await esClient.snapshot.restore({
      repository: repoName,
      snapshot: snapshotName,
      wait_for_completion: true,
      indices: logsIndices.join(','),
      include_global_state: false,
      rename_pattern: '(.+)',
      rename_replacement: `${REPLAY_TEMP_PREFIX}$1`,
    });
    tempIndices.push(...logsIndices.map((idx) => `${REPLAY_TEMP_PREFIX}${idx}`));

    const maxTsResult = await esClient.search({
      index: tempIndices.join(','),
      size: 0,
      aggs: { max_ts: { max: { field: '@timestamp' } } },
    });
    const maxTsValue = (maxTsResult.aggregations?.max_ts as { value_as_string?: string })
      ?.value_as_string;
    if (!maxTsValue) {
      throw new Error('No @timestamp found in restored snapshot indices');
    }
    log.debug(`Max timestamp from snapshot data: ${maxTsValue}`);

    await esClient.ingest.putPipeline({
      id: pipelineName,
      processors: [
        {
          script: {
            lang: 'painless',
            params: { max_timestamp: maxTsValue },
            source: TIMESTAMP_TRANSFORM_SCRIPT,
          },
        },
      ],
    });

    const dataStreams = await esClient.indices.getDataStream({ name: 'logs' });
    const logsDs = dataStreams.data_streams[0];
    if (!logsDs) {
      throw new Error('logs data stream not found — is Streams enabled?');
    }
    const writeIndex = logsDs.indices.at(-1);
    if (!writeIndex) {
      throw new Error('logs data stream has no write index');
    }
    writeIndexName = writeIndex.index_name;

    const settings = await esClient.indices.getSettings({ index: writeIndexName });
    previousDefaultPipeline =
      ((settings[writeIndexName]?.settings?.index as Record<string, unknown>)?.default_pipeline as
        | string
        | undefined) ?? '_none';

    log.debug(`Setting default_pipeline on ${writeIndexName} to ${pipelineName}`);
    await esClient.indices.putSettings({
      index: writeIndexName,
      settings: { 'index.default_pipeline': pipelineName },
    });

    log.debug('Reindexing into managed logs stream via default_pipeline');
    const reindexResult = await esClient.reindex(
      {
        wait_for_completion: true,
        source: { index: tempIndices.join(',') },
        dest: { index: 'logs', op_type: 'create' },
      },
      { requestTimeout: 30 * 60 * 1000 }
    );

    const total = reindexResult.total ?? 0;
    const created = reindexResult.created ?? 0;
    const failures = reindexResult.failures ?? [];
    const skipped = total - created;

    if (failures.length > 0) {
      log.warning(`Reindex: ${skipped} docs skipped due to mapping conflicts`);
      for (const failure of failures.slice(0, 5)) {
        const reason = failure.cause?.reason?.split('\n')[0]?.slice(0, 150) ?? 'unknown';
        log.debug(`  - ${failure.cause?.type ?? 'error'}: ${reason}`);
      }
      if (failures.length > 5) {
        log.debug(`  ... and ${failures.length - 5} more`);
      }
    }

    log.info(`Replay complete: ${created}/${total} docs indexed, ${skipped} skipped`);
    return { total, created, skipped };
  } finally {
    if (writeIndexName && previousDefaultPipeline !== null) {
      try {
        await esClient.indices.putSettings({
          index: writeIndexName,
          settings: { 'index.default_pipeline': previousDefaultPipeline },
        });
      } catch {
        log.debug('Failed to restore default_pipeline');
      }
    }

    for (const index of tempIndices) {
      try {
        await esClient.indices.delete({ index, ignore_unavailable: true });
      } catch {
        log.debug(`Failed to delete temp index: ${index}`);
      }
    }
    try {
      await esClient.ingest.deletePipeline({ id: pipelineName });
    } catch {
      log.debug('Failed to delete timestamp pipeline');
    }
    try {
      await esClient.snapshot.deleteRepository({ name: repoName });
    } catch {
      log.debug('Failed to delete snapshot repository');
    }
  }
}
