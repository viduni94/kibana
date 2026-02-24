/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationCriterion } from '@kbn/evals';
import type { GcsConfig } from '../../../src/data_generators/replay';
import type { ValidFeatureType } from '../../../src/evaluators/feature_extraction_evaluators';

export interface QueryGenScenario {
  input: {
    scenario_id: string;
    stream_name: string;
    stream_description: string;
  };
  output: {
    criteria: EvaluationCriterion[];
    expected_categories: string[];
    kql_substrings?: string[];
    expected_ground_truth: string;
  };
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    failure_domain: string;
    failure_mode: string;
  };
}

export interface FeatureExtractionScenario {
  input: {
    scenario_id: string;
    log_query_filter?: Record<string, unknown>;
  };
  output: {
    criteria: EvaluationCriterion[];
    min_features?: number;
    max_features?: number;
    required_types?: ValidFeatureType[];
    expected_ground_truth: string;
  };
  metadata: {
    difficulty: 'easy' | 'medium' | 'hard';
    failure_domain: string;
    failure_mode: string;
  };
}

/**
 * A dataset provider supplies GCS snapshot location and evaluation criteria
 * for both query generation and feature extraction evals.
 *
 * To add a new dataset:
 * 1. Create a file in this directory (e.g. `my_app.ts`)
 * 2. Export a `DatasetConfig` with your GCS location and scenarios
 * 3. Register it in `index.ts`
 * 4. Run evals with: `SIGEVENTS_DATASET=my-app node scripts/evals run ...`
 */
export interface DatasetConfig {
  id: string;
  description: string;
  gcs: GcsConfig;
  queryGeneration: QueryGenScenario[];
  featureExtraction: FeatureExtractionScenario[];
}
