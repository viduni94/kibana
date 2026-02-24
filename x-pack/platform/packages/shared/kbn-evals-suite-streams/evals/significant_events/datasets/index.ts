/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DatasetConfig } from './types';
import { otelDemoDataset } from './otel_demo';

const DATASETS: Record<string, DatasetConfig> = {
  'otel-demo': otelDemoDataset,
};

const datasetId = process.env.SIGEVENTS_DATASET || 'otel-demo';

const selected = DATASETS[datasetId];
if (!selected) {
  const available = Object.keys(DATASETS).join(', ');
  throw new Error(
    `Unknown dataset "${datasetId}". Available: ${available}. ` +
      'Set SIGEVENTS_DATASET to one of these values.'
  );
}

export const activeDataset: DatasetConfig = selected;

export type { DatasetConfig, QueryGenScenario, FeatureExtractionScenario } from './types';
