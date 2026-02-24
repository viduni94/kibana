/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { identifyFeatures } from '@kbn/streams-ai';
import { featuresPrompt } from '@kbn/streams-ai/src/features/prompt';
import { tags } from '@kbn/scout';
import { evaluate } from '../../../src/evaluate';
import { activeDataset } from '../datasets';
import {
  SIGEVENTS_SNAPSHOT_RUN,
  cleanSignificantEventsDataStreams,
  listAvailableSnapshots,
  replaySignificantEventsSnapshot,
} from '../../../src/data_generators/replay';
import { createFeatureExtractionEvaluators } from '../../../src/evaluators/feature_extraction_evaluators';

const INDEX_REFRESH_WAIT_MS = 2500;

evaluate.describe.configure({ timeout: 300_000 });

const { gcs } = activeDataset;

evaluate.describe(
  'Streams feature extraction',
  { tag: tags.serverless.observability.complete },
  () => {
    let availableSnapshots: string[] = [];

    evaluate.beforeAll(async ({ esClient, log }) => {
      availableSnapshots = await listAvailableSnapshots(esClient, log, gcs);
    });

    for (const scenario of activeDataset.featureExtraction) {
      evaluate.describe(scenario.input.scenario_id, () => {
        let sampleDocuments: Array<Record<string, unknown>> = [];

        evaluate.beforeAll(async ({ esClient, log }) => {
          if (!availableSnapshots.includes(scenario.input.scenario_id)) {
            log.info(
              `Snapshot "${scenario.input.scenario_id}" not found in run "${SIGEVENTS_SNAPSHOT_RUN}" — skipping`
            );
            evaluate.skip();
            return;
          }

          await replaySignificantEventsSnapshot(esClient, log, scenario.input.scenario_id, gcs);

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
              `No log documents found after replaying snapshot ${scenario.input.scenario_id}`
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

                  return { features };
                },
              },
              createFeatureExtractionEvaluators({
                criteriaFn: evaluators.criteria.bind(evaluators),
                criteria: scenario.output.criteria,
              })
            );
          }
        );

        evaluate.afterAll(async ({ esClient, log }) => {
          log.debug('Cleaning up significant events data');
          await cleanSignificantEventsDataStreams(esClient, log);
        });
      });
    }
  }
);
