/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { identifyFeatures } from '@kbn/streams-ai';
import { featuresPrompt } from '@kbn/streams-ai/src/features/prompt';
import { tags } from '@kbn/scout';
import { withEvaluatorSpan } from '@kbn/evals';
import { evaluate } from '../../../src/evaluate';
import {
  createFeatureExtractionEvaluators,
  createScenarioCriteriaEvaluator,
} from '../../../src/evaluators/feature_extraction_evaluators';
import { SNAPSHOT_FEATURE_EXTRACTION_EXAMPLES } from './snapshot_datasets';
import {
  replaySignificantEventsSnapshot,
  cleanSignificantEventsDataStreams,
} from '../../../src/data_generators/replay';

const INDEX_REFRESH_WAIT_MS = 2500;

evaluate.describe.configure({ timeout: 300_000 });

evaluate.describe(
  'Significant events feature extraction',
  { tag: tags.serverless.observability.complete },
  () => {
    for (const scenario of SNAPSHOT_FEATURE_EXTRACTION_EXAMPLES) {
      evaluate.describe(scenario.input.scenario_id, () => {
        let sampleDocuments: Array<Record<string, unknown>> = [];

        evaluate.beforeAll(async ({ esClient, log }) => {
          await replaySignificantEventsSnapshot(esClient, log, scenario.input.snapshot_name);

          log.debug('Waiting for indices to refresh');
          await new Promise((resolve) => setTimeout(resolve, INDEX_REFRESH_WAIT_MS));

          const searchResult = await esClient.search({
            index: 'logs*',
            size: 20,
            query: scenario.input.log_query_filter ?? { match_all: {} },
            sort: [{ '@timestamp': { order: 'desc' } }],
          });

          if (searchResult.hits.hits.length === 0) {
            throw new Error(
              `No log documents found after replaying snapshot ${scenario.input.snapshot_name}`
            );
          }

          sampleDocuments = searchResult.hits.hits.map(
            (hit) => hit._source as Record<string, unknown>
          );
        });

        evaluate(
          'feature identification',
          async ({ executorClient, evaluators, inferenceClient, logger }) => {
            await executorClient.runExperiment(
              {
                dataset: {
                  name: `feature extraction: ${scenario.input.scenario_id}`,
                  description: `Feature extraction from ${scenario.metadata.failure_domain} / ${scenario.metadata.failure_mode}`,
                  examples: [
                    {
                      input: { sample_documents: sampleDocuments },
                      output: {
                        ...scenario.output,
                        expected: scenario.output.expected_ground_truth,
                      },
                      metadata: scenario.metadata,
                    },
                  ],
                },
                concurrency: 1,
                task: async ({
                  input,
                }: {
                  input: { sample_documents: Array<Record<string, unknown>> };
                }) => {
                  const { features } = await identifyFeatures({
                    streamName: `logs.otel.${scenario.input.scenario_id}`,
                    sampleDocuments: input.sample_documents,
                    systemPrompt: featuresPrompt,
                    inferenceClient,
                    logger,
                    signal: new AbortController().signal,
                  });

                  const correctnessResult = await withEvaluatorSpan('CorrectnessAnalysis', {}, () =>
                    evaluators.correctnessAnalysis().evaluate({
                      input: {
                        question: `Identify features for stream with scenario: ${scenario.metadata.failure_domain} / ${scenario.metadata.failure_mode}`,
                      },
                      expected: { expected: scenario.output.expected_ground_truth },
                      output: {
                        messages: [{ message: JSON.stringify(features) }],
                      },
                      metadata: scenario.metadata,
                    })
                  );

                  return {
                    features,
                    messages: [{ message: JSON.stringify(features) }],
                    correctnessAnalysis: correctnessResult?.metadata,
                  };
                },
              },
              [
                ...createFeatureExtractionEvaluators(),
                createScenarioCriteriaEvaluator(
                  evaluators.criteria.bind(evaluators),
                  scenario.output.criteria
                ),
              ]
            );
          }
        );

        evaluate.afterAll(async ({ esClient, log }) => {
          log.debug('Cleaning up significant events data');
          await cleanSignificantEventsDataStreams(esClient);
        });
      });
    }
  }
);
