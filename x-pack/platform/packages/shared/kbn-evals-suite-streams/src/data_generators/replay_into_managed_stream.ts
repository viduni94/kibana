/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository } from '@kbn/es-snapshot-loader';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';
import { ensureLogsIndexTemplate } from './logs_index_template';

const REPLAY_TEMP_PREFIX = 'sigevents-replay-temp-';

const TIMESTAMP_TRANSFORM_SCRIPT = `
  // Reset the _id field to null to avoid conflicts with subsequent reindex operations
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
  snapshotName: string,
  gcs: GcsConfig
): Promise<ReplayStats> {
  log.debug(`Replaying snapshot "${snapshotName}" into managed logs stream`);

  const basePath = resolveBasePath(gcs);
  const repoName = `sigevents-replay-${Date.now()}`;
  const repository = createGcsRepository({ bucket: gcs.bucket, basePath });
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

    let logsDs:
      | {
          name: string;
          indices: Array<{ index_name: string }>;
        }
      | undefined;

    try {
      const dataStreams = await esClient.indices.getDataStream({ name: 'logs' });
      logsDs = dataStreams.data_streams[0] as typeof logsDs;
    } catch (err) {
      const statusCode = (err as { meta?: { statusCode?: number } })?.meta?.statusCode;
      if (statusCode !== 404) {
        throw err;
      }

      log.debug('logs data stream not found — creating it for replay');
      await ensureLogsIndexTemplate(esClient, log);
      await esClient.indices.createDataStream({ name: 'logs' });

      const dataStreams = await esClient.indices.getDataStream({ name: 'logs' });
      logsDs = dataStreams.data_streams[0] as typeof logsDs;
    }

    if (!logsDs) {
      throw new Error('logs data stream not found');
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

    let chainedPipelineName: string | undefined =
      previousDefaultPipeline !== '_none' ? previousDefaultPipeline : undefined;

    if (chainedPipelineName) {
      try {
        await esClient.ingest.getPipeline({ id: chainedPipelineName });
        log.debug(`Chaining existing default_pipeline: ${chainedPipelineName}`);
      } catch {
        log.warning(
          `Write index default_pipeline "${chainedPipelineName}" not found; replay will run without it`
        );
        chainedPipelineName = undefined;
      }
    } else {
      log.debug('Write index has no default_pipeline; replay will use timestamp transform only');
    }

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
        ...(chainedPipelineName
          ? [
              {
                pipeline: {
                  name: chainedPipelineName,
                  ignore_missing_pipeline: true,
                },
              },
            ]
          : []),
      ],
    });

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
