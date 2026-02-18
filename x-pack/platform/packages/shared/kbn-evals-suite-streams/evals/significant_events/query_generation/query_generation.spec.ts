/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generateSignificantEvents } from '@kbn/streams-ai';
import { significantEventsPrompt } from '@kbn/streams-ai/src/significant_events/prompt';
import kbnDatemath from '@kbn/datemath';
import { tags } from '@kbn/scout';
import { withEvaluatorSpan } from '@kbn/evals';
import { evaluate } from '../../../src/evaluate';
import {
  createQueryGenEvaluators,
  createScenarioCriteriaEvaluator,
} from '../../../src/evaluators/query_generation_evaluators';
import { SNAPSHOT_QUERY_GEN_EXAMPLES } from './snapshot_datasets';
import {
  replaySignificantEventsSnapshot,
  cleanSignificantEventsDataStreams,
} from '../../../src/data_generators/replay';

const INDEX_REFRESH_WAIT_MS = 2500;

evaluate.describe(
  'Significant events query generation',
  { tag: tags.serverless.observability.complete },
  () => {
    for (const scenario of SNAPSHOT_QUERY_GEN_EXAMPLES) {
      evaluate.describe(scenario.input.scenario_id, () => {
        let sampleLogs: string[] = [];
        let testIndex: string;

        evaluate.beforeAll(async ({ esClient, apiServices, log }) => {
          await apiServices.streams.enable();
          await replaySignificantEventsSnapshot(esClient, log, scenario.input.snapshot_name);

          log.debug('Waiting for indices to refresh');
          await new Promise((resolve) => setTimeout(resolve, INDEX_REFRESH_WAIT_MS));

          const searchResult = await esClient.search({
            index: 'logs*',
            size: 50,
            query: { match_all: {} },
            sort: [{ '@timestamp': { order: 'desc' } }],
          });

          sampleLogs = searchResult.hits.hits.map((hit) => {
            const source = hit._source as Record<string, unknown>;
            return (source.message as string) || (source.body as string) || '';
          });

          testIndex = `logs-otel-query-gen-${scenario.input.scenario_id}-${Date.now()}`;
          await esClient.indices.createDataStream({ name: testIndex });

          if (searchResult.hits.hits.length === 0) {
            throw new Error(
              `No log documents found after replaying snapshot ${scenario.input.snapshot_name}`
            );
          }

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
                    features: scenario.input.features,
                  });

                  const correctnessResult = await withEvaluatorSpan('CorrectnessAnalysis', {}, () =>
                    evaluators.correctnessAnalysis().evaluate({
                      input: {
                        question: `Generate KQL queries for significant events: ${scenario.input.stream_description}`,
                      },
                      expected: { expected: scenario.output.expected_ground_truth },
                      output: {
                        messages: [{ message: JSON.stringify(queries) }],
                      },
                      metadata: scenario.metadata,
                    })
                  );

                  return {
                    queries,
                    messages: [{ message: JSON.stringify(queries) }],
                    correctnessAnalysis: correctnessResult?.metadata,
                  };
                },
              },
              [
                ...createQueryGenEvaluators(esClient),
                createScenarioCriteriaEvaluator(
                  evaluators.criteria.bind(evaluators),
                  scenario.output.criteria
                ),
              ]
            );
          }
        );

        evaluate.afterAll(async ({ esClient, apiServices, log }) => {
          log.debug('Cleaning up test data');
          await Promise.all([
            testIndex
              ? esClient.indices.deleteDataStream({ name: testIndex }).catch(() => {})
              : Promise.resolve(),
            cleanSignificantEventsDataStreams(esClient),
          ]);
          await apiServices.streams.disable();
        });
      });
    }
  }
);
