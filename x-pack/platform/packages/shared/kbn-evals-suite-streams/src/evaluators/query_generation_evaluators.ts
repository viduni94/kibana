/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createQuantitativeCorrectnessEvaluators,
  selectEvaluators,
  type EvaluationCriterion,
} from '@kbn/evals';
import type { Evaluator } from '@kbn/evals/src/types';
import { fromKueryExpression } from '@kbn/es-query';
import type { ElasticsearchClient } from '@kbn/core/server';
import {
  SIGNIFICANT_EVENT_TYPE_CONFIGURATION,
  SIGNIFICANT_EVENT_TYPE_ERROR,
  SIGNIFICANT_EVENT_TYPE_OPERATIONAL,
  SIGNIFICANT_EVENT_TYPE_RESOURCE_HEALTH,
  SIGNIFICANT_EVENT_TYPE_SECURITY,
} from '@kbn/streams-ai/src/significant_events/types';

const ALLOWED_CATEGORIES = [
  SIGNIFICANT_EVENT_TYPE_OPERATIONAL,
  SIGNIFICANT_EVENT_TYPE_CONFIGURATION,
  SIGNIFICANT_EVENT_TYPE_RESOURCE_HEALTH,
  SIGNIFICANT_EVENT_TYPE_ERROR,
  SIGNIFICANT_EVENT_TYPE_SECURITY,
];

const createQueryGenerationCodeEvaluator = (esClient: ElasticsearchClient): Evaluator => ({
  name: 'query_generation_code_evaluator',
  kind: 'CODE' as const,
  evaluate: async ({ output, input, metadata }) => {
    const queries = Array.isArray(output) ? output : [output];

    if (queries.length === 0 || !queries[0] || !queries[0].kql) {
      return {
        score: 0,
        reasoning: 'No queries generated',
        details: {
          syntaxValidityRate: 0,
          executionHitRate: 0,
        },
      };
    }

    let validSyntaxCount = 0;
    let executionHitCount = 0;
    const validationDetails = [];

    for (const query of queries) {
      const { kql, category, severity_score, evidence } = query;

      let isSyntaxValid = false;
      try {
        fromKueryExpression(kql);
        isSyntaxValid = true;
        validSyntaxCount++;
      } catch {
        // KQL is invalid
      }

      let isExecutionHit = false;
      if (isSyntaxValid) {
        const searchResult = await esClient.search({
          index: metadata?.test_index as string,
          q: kql,
        });
        const total = searchResult.hits.total;
        const hits = typeof total === 'number' ? total : total?.value ?? 0;
        if (hits > 0) {
          isExecutionHit = true;
          executionHitCount++;
        }
      }

      const isCategoryCompliant = ALLOWED_CATEGORIES.includes(category);
      const isSeverityCompliant = severity_score >= 0 && severity_score <= 100;

      const evidenceValidation: {
        allEvidenceFound: boolean;
        missingEvidence: string[];
      } = {
        allEvidenceFound: true,
        missingEvidence: [],
      };
      const sampleLogs = input.sample_logs as string[] | undefined;
      if (evidence && evidence.length > 0 && sampleLogs) {
        const allLogs = sampleLogs.join('\n');
        const missing = evidence.filter((ev: string) => !allLogs.includes(ev));
        if (missing.length > 0) {
          evidenceValidation.allEvidenceFound = false;
          evidenceValidation.missingEvidence = missing;
        }
      }

      validationDetails.push({
        kql,
        isSyntaxValid,
        isExecutionHit,
        isCategoryCompliant,
        isSeverityCompliant,
        evidenceValidation,
      });
    }

    const syntaxValidityRate = validSyntaxCount / queries.length;
    const executionHitRate = executionHitCount / queries.length;
    const score = (syntaxValidityRate + executionHitRate) / 2;

    return {
      score,
      details: {
        syntaxValidityRate,
        executionHitRate,
        queries: validationDetails,
      },
    };
  },
});

export const createQueryGenEvaluators = (esClient: ElasticsearchClient) => {
  return selectEvaluators([
    createQueryGenerationCodeEvaluator(esClient),
    ...createQuantitativeCorrectnessEvaluators(),
  ]);
};

export const createScenarioCriteriaEvaluator = (
  criteriaFn: (criteria: EvaluationCriterion[]) => Evaluator,
  criteria: EvaluationCriterion[]
): Evaluator => ({
  name: 'scenario_criteria',
  kind: 'LLM' as const,
  evaluate: async ({ input, output, expected, metadata }) => {
    return criteriaFn(criteria).evaluate({
      input,
      expected,
      output,
      metadata,
    });
  },
});
