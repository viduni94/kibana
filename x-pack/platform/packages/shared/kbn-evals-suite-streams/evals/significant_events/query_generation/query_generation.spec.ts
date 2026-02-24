/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateSignificantEvents } from '@kbn/streams-ai';
import { significantEventsPrompt } from '@kbn/streams-ai/src/significant_events/prompt';
import { tags } from '@kbn/scout';
import kbnDatemath from '@kbn/datemath';
import type { Feature } from '@kbn/streams-schema';
import { evaluate } from '../../../src/evaluate';
import { activeDataset } from '../datasets';
import {
  listAvailableSnapshots,
  loadFeaturesFromSnapshot,
  replayIntoManagedStream,
  SIGEVENTS_SNAPSHOT_RUN,
} from '../../../src/data_generators/replay';
import { createQueryGenerationEvaluators } from '../../../src/evaluators/query_generation_evaluators';
import { createScenarioCriteriaLlmEvaluator } from '../../../src/evaluators/scenario_criteria_llm_evaluator';

const INDEX_REFRESH_WAIT_MS = 2500;
const SAMPLE_DOCS_SIZE = 500;

const { gcs } = activeDataset;

evaluate.describe(
  'Significant events query generation',
  { tag: tags.serverless.observability.complete },
  () => {
    let availableSnapshots: string[] = [];

    evaluate.beforeAll(async ({ esClient, log }) => {
      availableSnapshots = await listAvailableSnapshots(esClient, log, gcs);
    });

    for (const scenario of activeDataset.queryGeneration) {
      evaluate.describe(scenario.input.scenario_id, () => {
        let sampleLogs: string[] = [];
        let testIndex: string;
        let features: Feature[] = [];

        evaluate.beforeAll(async ({ esClient, apiServices, log }) => {
          if (!availableSnapshots.includes(scenario.input.scenario_id)) {
            log.info(
              `Snapshot "${scenario.input.scenario_id}" not found in run "${SIGEVENTS_SNAPSHOT_RUN}" — skipping`
            );
            evaluate.skip();
            return;
          }

          await apiServices.streams.enable();

          const [stats, snapshotFeatures] = await Promise.all([
            replayIntoManagedStream(esClient, log, scenario.input.scenario_id, gcs),
            loadFeaturesFromSnapshot(esClient, log, scenario.input.scenario_id, gcs),
          ]);

          features = snapshotFeatures;
          if (features.length === 0) {
            throw new Error(
              `No features found in snapshot ${scenario.input.scenario_id}. ` +
                'Ensure the snapshot was created with .kibana_streams_features included.'
            );
          }
          log.info(`Loaded ${features.length} features from snapshot`);

          if (stats.created === 0) {
            throw new Error(
              `No documents indexed after replaying snapshot ${scenario.input.scenario_id}`
            );
          }

          await new Promise((resolve) => setTimeout(resolve, INDEX_REFRESH_WAIT_MS));

          const searchResult = await esClient.search({
            index: 'logs*',
            size: SAMPLE_DOCS_SIZE,
            query: { match_all: {} },
            sort: [{ '@timestamp': { order: 'desc' } }],
          });

          sampleLogs = searchResult.hits.hits.map((hit) => {
            const source = hit._source as Record<string, unknown>;
            return (source.message as string) || (source.body as string) || '';
          });

          testIndex = `logs-otel-query-gen-${scenario.input.scenario_id}-${Date.now()}`;
          await esClient.indices.createDataStream({ name: testIndex });

          const bulkBody = searchResult.hits.hits.flatMap((hit) => [
            { create: { _index: testIndex } },
            hit._source as Record<string, unknown>,
          ]);
          await esClient.bulk({ refresh: true, body: bulkBody });
        });

        evaluate(
          'query generation',
          async ({
            executorClient,
            evaluators,
            esClient,
            inferenceClient,
            logger,
            apiServices,
          }) => {
            await executorClient.runExperiment(
              {
                dataset: {
                  name: `query generation: ${scenario.input.scenario_id}`,
                  description: scenario.input.stream_description,
                  examples: [
                    {
                      input: {
                        ...scenario.input,
                        features,
                        sample_logs: sampleLogs,
                      },
                      output: {
                        ...scenario.output,
                        expected: scenario.output.expected_ground_truth,
                      },
                      metadata: {
                        ...scenario.metadata,
                        test_index: testIndex,
                      },
                    },
                  ],
                },
                task: async () => {
                  const { stream } = await apiServices.streams.getStreamDefinition(testIndex);
                  const { queries } = await generateSignificantEvents({
                    stream,
                    start: kbnDatemath.parse('now-24h')!.valueOf(),
                    end: kbnDatemath.parse('now')!.valueOf(),
                    esClient,
                    inferenceClient,
                    logger,
                    signal: new AbortController().signal,
                    systemPrompt: significantEventsPrompt,
                    getFeatures: async () => features,
                  });

                  return { queries };
                },
              },
              createQueryGenerationEvaluators(esClient, {
                criteriaFn: evaluators.criteria.bind(evaluators),
                criteria: scenario.output.criteria,
              })
            );
          }
        );

        evaluate.afterAll(async ({ esClient, apiServices, log }) => {
          log.debug('Cleaning up test data');
          if (testIndex) {
            await esClient.indices.deleteDataStream({ name: testIndex }).catch(() => {});
          }
          await apiServices.streams.disable();
        });
      });
    }

    evaluate(
      'empty datastream',
      async ({ executorClient, evaluators, esClient, inferenceClient, logger, apiServices }) => {
        const testIndex = `logs-sig-events-test-${Date.now()}`;
        await esClient.indices.createDataStream({ name: testIndex });
        await executorClient.runExperiment(
          {
            dataset: {
              name: 'query generation: empty datastream',
              description: 'Significant events query generation with empty stream data',
              examples: [
                {
                  input: {},
                  output: {},
                  metadata: {},
                },
              ],
            },
            task: async () => {
              const { stream } = await apiServices.streams.getStreamDefinition(testIndex);
              const { queries } = await generateSignificantEvents({
                stream,
                esClient,
                start: kbnDatemath.parse('now-24h')!.valueOf(),
                end: kbnDatemath.parse('now')!.valueOf(),
                inferenceClient,
                logger,
                signal: new AbortController().signal,
                systemPrompt: significantEventsPrompt,
                getFeatures: async () => [],
              });

              return queries;
            },
          },
          [
            createScenarioCriteriaLlmEvaluator({
              criteriaFn: evaluators.criteria.bind(evaluators),
              criteria: ['Assert the KQL queries are generated following the user intent'],
            }),
          ]
        );
      }
    );
  }
);
