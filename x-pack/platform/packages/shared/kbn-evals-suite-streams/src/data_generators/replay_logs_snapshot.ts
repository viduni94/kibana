/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository, replaySnapshot } from '@kbn/es-snapshot-loader';
import { deleteLogsIndexTemplate, ensureLogsIndexTemplate } from './logs_index_template';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';

export async function replaySignificantEventsSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig
) {
  log.debug(`Replaying significant events data from snapshot: ${snapshotName}`);

  await cleanSignificantEventsDataStreams(esClient, log);
  await ensureLogsIndexTemplate(esClient, log);

  const basePath = resolveBasePath(gcs);
  await replaySnapshot({
    esClient,
    log,
    repository: createGcsRepository({ bucket: gcs.bucket, basePath }),
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
