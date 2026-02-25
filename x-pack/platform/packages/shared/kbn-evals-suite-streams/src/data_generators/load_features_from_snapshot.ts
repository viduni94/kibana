/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { ToolingLog } from '@kbn/tooling-log';
import { createGcsRepository } from '@kbn/es-snapshot-loader';
import type { Feature } from '@kbn/streams-schema';
import type { GcsConfig } from './snapshot_run_config';
import { resolveBasePath } from './snapshot_run_config';
import { getSigeventsSnapshotFeaturesIndex } from './sigevents_features_index';

const FEATURES_TEMP_INDEX = 'sigevents-replay-temp-features';

/**
 * Restores sigevents-captured features from a snapshot and returns all
 * {@link Feature} documents for the given stream. The temp index is cleaned
 * up before returning.
 */
export async function loadFeaturesFromSnapshot(
  esClient: Client,
  log: ToolingLog,
  snapshotName: string,
  gcs: GcsConfig,
  streamName: string = 'logs'
): Promise<Feature[]> {
  const basePath = resolveBasePath(gcs);
  const repoName = `sigevents-features-${Date.now()}`;
  const repository = createGcsRepository({ bucket: gcs.bucket, basePath });
  const featuresIndex = getSigeventsSnapshotFeaturesIndex(snapshotName);

  try {
    repository.validate();
    await repository.register({ esClient, log, repoName });

    const snapshotInfo = await esClient.snapshot.get({
      repository: repoName,
      snapshot: snapshotName,
    });
    const snap = snapshotInfo.snapshots?.[0];
    if (!snap) {
      throw new Error(`Snapshot "${snapshotName}" not found`);
    }

    const hasFeatures = (snap.indices ?? []).includes(featuresIndex);
    if (!hasFeatures) {
      log.warning(`Snapshot "${snapshotName}" does not contain "${featuresIndex}"`);
      return [];
    }

    await esClient.indices.delete({ index: FEATURES_TEMP_INDEX, ignore_unavailable: true });
    await esClient.snapshot.restore({
      repository: repoName,
      snapshot: snapshotName,
      wait_for_completion: true,
      indices: featuresIndex,
      include_global_state: false,
      rename_pattern: '(.+)',
      rename_replacement: FEATURES_TEMP_INDEX,
    });

    const searchResult = await esClient.search<Record<string, unknown>>({
      index: FEATURES_TEMP_INDEX,
      size: 1000,
      query: { term: { stream_name: streamName } },
    });

    const features: Feature[] = searchResult.hits.hits
      .map((hit) => hit._source as Feature)
      .filter(Boolean);

    log.info(`Loaded ${features.length} features from snapshot "${snapshotName}"`);
    return features;
  } finally {
    try {
      await esClient.indices.delete({ index: FEATURES_TEMP_INDEX, ignore_unavailable: true });
    } catch {
      log.debug(`Failed to delete temp features index`);
    }
    try {
      await esClient.snapshot.deleteRepository({ name: repoName });
    } catch {
      log.debug('Failed to delete features snapshot repository');
    }
  }
}
