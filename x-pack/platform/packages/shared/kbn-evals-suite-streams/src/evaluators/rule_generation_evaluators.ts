/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SIGNIFICANT_EVENT_TYPE_CONFIGURATION,
  SIGNIFICANT_EVENT_TYPE_ERROR,
  SIGNIFICANT_EVENT_TYPE_OPERATIONAL,
  SIGNIFICANT_EVENT_TYPE_RESOURCE_HEALTH,
  SIGNIFICANT_EVENT_TYPE_SECURITY,
} from '@kbn/streams-ai/src/significant_events/types';
import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import { selectEvaluators } from '@kbn/evals';
import type { EvaluationCriterion, Evaluator } from '@kbn/evals';
import type { SignificantEventType } from '@kbn/streams-ai/src/significant_events/types';
import { createScenarioCriteriaLlmEvaluator } from './scenario_criteria_llm_evaluator';

const ALLOWED_CATEGORIES = [
  SIGNIFICANT_EVENT_TYPE_OPERATIONAL,
  SIGNIFICANT_EVENT_TYPE_CONFIGURATION,
  SIGNIFICANT_EVENT_TYPE_RESOURCE_HEALTH,
  SIGNIFICANT_EVENT_TYPE_ERROR,
  SIGNIFICANT_EVENT_TYPE_SECURITY,
];

const SHORT_EVIDENCE_MAX_LENGTH = 3;

interface RuleGenerationEvaluationExample {
  input: { sample_logs: string[] } & Record<string, unknown>;
  output: {
    expected_categories?: string[];
    esql_substrings?: string[];
  } & Record<string, unknown>;
  metadata: Record<string, unknown> | null;
}

interface Query {
  esql: string;
  title: string;
  category: SignificantEventType;
  severity_score: number;
  evidence?: string[];
}

interface RuleGenerationTaskOutput {
  queries: Query[];
  traceId?: string | null;
}

type RuleGenerationOutput = Query[] | RuleGenerationTaskOutput;

const getQueriesFromOutput = (output: RuleGenerationOutput): Query[] => {
  return Array.isArray(output) ? output : output.queries;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesEvidenceInLog(logLine: string, evidence: string): boolean {
  const normalizedEvidence = evidence.trim();
  if (normalizedEvidence.length === 0) {
    return false;
  }

  if (normalizedEvidence.length <= SHORT_EVIDENCE_MAX_LENGTH) {
    return new RegExp(`(^|[^a-zA-Z0-9_])${escapeRegExp(normalizedEvidence)}($|[^a-zA-Z0-9_])`).test(
      logLine
    );
  }

  return logLine.includes(normalizedEvidence);
}

const evaluateRuleGenerationCode = async ({
  queries,
  sampleLogs,
  expectedCategories,
  expectedEsqlSubstrings,
  esClient,
  logger,
}: {
  queries: Query[];
  sampleLogs: string[];
  expectedCategories: string[];
  expectedEsqlSubstrings: string[];
  esClient: ElasticsearchClient;
  logger?: Logger;
}) => {
  if (queries.length === 0 || !queries[0] || !queries[0].esql) {
    return {
      score: 0,
      explanation: 'No queries generated',
      details: {
        syntaxValidityRate: 0,
        executionHitRate: 0,
      },
    };
  }

  let validSyntaxCount = 0;
  let executionHitCount = 0;
  let categoryComplianceCount = 0;
  let severityComplianceCount = 0;
  let groundedEvidenceCount = 0;
  let totalEvidenceCount = 0;
  const validationDetails: Array<{
    esql: string;
    isSyntaxValid: boolean;
    isExecutionHit: boolean;
    isCategoryCompliant: boolean;
    isSeverityCompliant: boolean;
    evidenceValidation: { allEvidenceFound: boolean; missingEvidence: string[] };
  }> = [];

  for (const query of queries) {
    const { esql, category, severity_score, evidence = [] } = query;

    let isSyntaxValid = false;
    let isExecutionHit = false;
    try {
      const result = await esClient.esql.query({ query: esql });
      isSyntaxValid = true;
      validSyntaxCount++;
      if (result.values && result.values.length > 0) {
        isExecutionHit = true;
        executionHitCount++;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger?.warn(`ES|QL validation failed for "${esql}": ${errorMessage}`);
    }

    const isCategoryCompliant = ALLOWED_CATEGORIES.includes(category);
    if (isCategoryCompliant) {
      categoryComplianceCount++;
    }

    const isSeverityCompliant = severity_score >= 0 && severity_score <= 100;
    if (isSeverityCompliant) {
      severityComplianceCount++;
    }

    const evidenceValidation: {
      allEvidenceFound: boolean;
      missingEvidence: string[];
    } = {
      allEvidenceFound: true,
      missingEvidence: [],
    };
    if (evidence.length > 0) {
      totalEvidenceCount += evidence.length;
      const missing = evidence.filter(
        (ev: string) => !sampleLogs.some((logLine) => matchesEvidenceInLog(logLine, ev))
      );
      if (missing.length > 0) {
        evidenceValidation.allEvidenceFound = false;
        evidenceValidation.missingEvidence = missing;
      }
      groundedEvidenceCount += evidence.length - missing.length;
    }

    validationDetails.push({
      esql,
      isSyntaxValid,
      isExecutionHit,
      isCategoryCompliant,
      isSeverityCompliant,
      evidenceValidation,
    });
  }

  const syntaxValidityRate = validSyntaxCount / queries.length;
  const executionHitRate = executionHitCount / queries.length;
  const categoryComplianceRate = categoryComplianceCount / queries.length;
  const severityComplianceRate = severityComplianceCount / queries.length;
  const observedCategories = new Set(queries.map((query) => query.category.toLowerCase()));
  const missingExpectedCategories = expectedCategories.filter(
    (category) => !observedCategories.has(category)
  );
  const expectedCategoryCoverageRate =
    expectedCategories.length > 0
      ? (expectedCategories.length - missingExpectedCategories.length) / expectedCategories.length
      : null;
  const normalizedEsql = queries.map((query) => query.esql.toLowerCase());
  const missingEsqlSubstrings = expectedEsqlSubstrings.filter(
    (substring) => !normalizedEsql.some((esql) => esql.includes(substring.toLowerCase()))
  );
  const esqlSubstringCoverageRate =
    expectedEsqlSubstrings.length > 0
      ? (expectedEsqlSubstrings.length - missingEsqlSubstrings.length) /
        expectedEsqlSubstrings.length
      : null;
  const evidenceGroundingRate =
    totalEvidenceCount > 0 ? groundedEvidenceCount / totalEvidenceCount : null;

  const scoreComponents = [
    syntaxValidityRate,
    executionHitRate,
    categoryComplianceRate,
    severityComplianceRate,
    ...(expectedCategoryCoverageRate == null ? [] : [expectedCategoryCoverageRate]),
    ...(esqlSubstringCoverageRate == null ? [] : [esqlSubstringCoverageRate]),
    ...(evidenceGroundingRate == null ? [] : [evidenceGroundingRate]),
  ];
  const score =
    scoreComponents.reduce((sum, component) => sum + component, 0) / scoreComponents.length;

  const invalidCategories = validationDetails
    .filter((detail) => !detail.isCategoryCompliant)
    .map((detail) => detail.esql);
  const invalidSeverities = queries
    .filter((query) => query.severity_score < 0 || query.severity_score > 100)
    .map((query) => `${query.title} (${query.severity_score})`);
  const missingEvidence = validationDetails.flatMap(
    (detail) => detail.evidenceValidation.missingEvidence
  );
  const issues: string[] = [];

  if (syntaxValidityRate < 1) {
    issues.push(
      `${queries.length - validSyntaxCount}/${queries.length} queries have invalid ES|QL syntax`
    );
  }
  if (executionHitRate < 1) {
    issues.push(`${queries.length - executionHitCount}/${queries.length} queries returned no hits`);
  }
  if (categoryComplianceRate < 1) {
    issues.push(`${invalidCategories.length} queries use unsupported categories`);
  }
  if (severityComplianceRate < 1) {
    issues.push(`${invalidSeverities.length} queries have severity outside [0, 100]`);
  }
  if (missingExpectedCategories.length > 0) {
    issues.push(`Missing expected categories: ${missingExpectedCategories.join(', ')}`);
  }
  if (missingEsqlSubstrings.length > 0) {
    issues.push(`Missing expected ES|QL substrings: ${missingEsqlSubstrings.join(', ')}`);
  }
  if (missingEvidence.length > 0) {
    issues.push(`Evidence not found in sample logs: ${missingEvidence.slice(0, 5).join(', ')}`);
  }

  return {
    score,
    explanation:
      issues.length > 0
        ? `${issues.join('; ')} (score=${score.toFixed(2)})`
        : `All ${queries.length} generated rules passed code validation`,
    details: {
      syntaxValidityRate,
      executionHitRate,
      categoryComplianceRate,
      severityComplianceRate,
      expectedCategoryCoverageRate,
      missingExpectedCategories,
      esqlSubstringCoverageRate,
      missingEsqlSubstrings,
      evidenceGroundingRate,
      groundedEvidenceCount,
      totalEvidenceCount,
      queries: validationDetails,
    },
  };
};

const createRuleGenerationCodeEvaluator = (
  esClient: ElasticsearchClient,
  logger?: Logger
): Evaluator<RuleGenerationEvaluationExample, RuleGenerationOutput> => ({
  name: 'rule_generation_code_evaluator',
  kind: 'CODE' as const,
  evaluate: async ({ output, input, expected }) => {
    const queries = getQueriesFromOutput(output ?? []);
    const { sample_logs: sampleLogs } = input;
    const expectedCategories = (expected.expected_categories ?? []).map((category) =>
      category.toLowerCase()
    );
    const expectedEsqlSubstrings = expected.esql_substrings ?? [];

    return evaluateRuleGenerationCode({
      queries,
      sampleLogs,
      expectedCategories,
      expectedEsqlSubstrings,
      esClient,
      logger,
    });
  },
});

export const createRuleGenerationEvaluators = (
  esClient: ElasticsearchClient,
  scenarioCriteria?: {
    criteriaFn: (criteria: EvaluationCriterion[]) => Evaluator;
    criteria: EvaluationCriterion[];
  },
  logger?: Logger
) => {
  const base = selectEvaluators([createRuleGenerationCodeEvaluator(esClient, logger)]);

  if (!scenarioCriteria) {
    return base;
  }

  const { criteriaFn, criteria } = scenarioCriteria;
  return [
    ...base,
    createScenarioCriteriaLlmEvaluator<RuleGenerationEvaluationExample, RuleGenerationOutput>({
      criteriaFn: (c) =>
        criteriaFn(c) as Evaluator<RuleGenerationEvaluationExample, RuleGenerationOutput>,
      criteria,
    }),
  ];
};
