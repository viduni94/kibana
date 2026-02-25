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
import { ALWAYS_CONDITION } from '@kbn/streamlang';
import { evaluate } from '../../../src/evaluate';
import { activeDataset } from '../datasets';
import {
  canonicalFeaturesFromExpectedGroundTruth,
  listAvailableSnapshots,
  loadFeaturesFromSnapshot,
  replayIntoManagedStream,
  SIGEVENTS_SNAPSHOT_RUN,
} from '../../../src/data_generators/replay';
import { createQueryGenerationEvaluators } from '../../../src/evaluators/query_generation_evaluators';
import { createScenarioCriteriaLlmEvaluator } from '../../../src/evaluators/scenario_criteria_llm_evaluator';
import { FEATURE_SOURCES_TO_RUN } from './resolve_feature_sources';

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
      for (const featureSource of FEATURE_SOURCES_TO_RUN) {
        evaluate.describe(`${scenario.input.scenario_id} (${featureSource})`, () => {
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

            const extractionScenario = activeDataset.featureExtraction.find(
              (s) => s.input.scenario_id === scenario.input.scenario_id
            );
            const canonicalFeatures =
              extractionScenario?.output?.expected_ground_truth != null
                ? canonicalFeaturesFromExpectedGroundTruth({
                    streamName: scenario.input.stream_name,
                    scenarioId: scenario.input.scenario_id,
                    expectedGroundTruth: extractionScenario.output.expected_ground_truth,
                  })
                : [];

            const shouldUseCanonical =
              featureSource === 'canonical' ||
              (featureSource === 'auto' && canonicalFeatures.length > 0);

            const resolvedFeatures = shouldUseCanonical
              ? canonicalFeatures
              : await loadFeaturesFromSnapshot(esClient, log, scenario.input.scenario_id, gcs);

            if (!shouldUseCanonical && resolvedFeatures.length === 0) {
              log.info(
                `No snapshot features available for "${scenario.input.scenario_id}" — skipping snapshot-features variant`
              );
              evaluate.skip();
              return;
            }

            const stats = await replayIntoManagedStream(
              esClient,
              log,
              scenario.input.scenario_id,
              gcs
            );

            features = resolvedFeatures;
            if (features.length === 0) {
              let details =
                'Ensure the snapshot was created with sigevents-streams-features-<scenario> included.';
              if (shouldUseCanonical) {
                details =
                  'No canonical features could be derived from dataset ground truth. Either improve expected_ground_truth formatting or set SIGEVENTS_QUERYGEN_FEATURES_SOURCE=snapshot.';
              }
              throw new Error(
                `No features available for scenario ${scenario.input.scenario_id}. ${details}`
              );
            }

            log.info(
              `Using ${shouldUseCanonical ? 'canonical' : 'snapshot'} features (${features.length})`
            );

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

            testIndex = [
              'logs-otel-query-gen',
              scenario.input.scenario_id,
              featureSource,
              Date.now(),
            ].join('-');
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
                    name: `query generation: ${scenario.input.scenario_id} (${featureSource})`,
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
                      system: {
                        type: 'system',
                        name: scenario.input.stream_name,
                        description: scenario.input.stream_description,
                        filter: ALWAYS_CONDITION,
                      },
                      start: kbnDatemath.parse('now-24h')!.valueOf(),
                      end: kbnDatemath.parse('now')!.valueOf(),
                      esClient,
                      inferenceClient,
                      logger,
                      signal: new AbortController().signal,
                      systemPrompt: significantEventsPrompt,
                      getFeatures: async () => features,
                    });

                    return queries;
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
