/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Feature } from '@kbn/streams-schema';
import type { EvaluationCriterion } from '@kbn/evals';
import {
  SIGEVENTS_SNAPSHOT_NAMES,
  type SigEventsSnapshotName,
} from '../../../src/data_generators/replay';

export interface SnapshotQueryGenExample {
  input: {
    scenario_id: string;
    snapshot_name: SigEventsSnapshotName;
    stream_name: string;
    stream_description: string;
    features: Feature[];
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

const createFeature = (
  id: string,
  type: string,
  streamName: string,
  overrides: Partial<Feature> = {}
): Feature => ({
  id,
  type,
  stream_name: streamName,
  description: '',
  properties: {},
  confidence: 90,
  uuid: `eval-${id}`,
  status: 'active',
  last_seen: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

export const SNAPSHOT_QUERY_GEN_EXAMPLES: SnapshotQueryGenExample[] = [
  {
    input: {
      scenario_id: 'healthy-baseline',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.HEALTHY_BASELINE,
      stream_name: 'logs',
      stream_description:
        'OTel Demo application logs under healthy conditions with normal traffic across all microservices',
      features: [
        createFeature('frontend', 'entity', 'logs', {
          description: 'Frontend web store service',
        }),
        createFeature('checkout', 'entity', 'logs', { description: 'Checkout service' }),
        createFeature('cart', 'entity', 'logs', { description: 'Cart service' }),
        createFeature('payment', 'entity', 'logs', { description: 'Payment service' }),
        createFeature('kubernetes', 'infrastructure', 'logs', {
          description: 'Kubernetes orchestration',
        }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'healthy-baseline-queries',
          text: 'Should generate queries for operational monitoring (e.g., status codes, latency, service health) rather than error detection since this is healthy traffic',
          score: 2,
        },
        {
          id: 'multi-service-coverage',
          text: 'Generated queries should cover multiple services (frontend, checkout, cart, payment)',
          score: 2,
        },
      ],
      expected_categories: ['operational'],
      expected_ground_truth:
        'queries=[operational monitoring for status codes, service health across frontend/checkout/cart/payment services]',
    },
    metadata: {
      difficulty: 'easy',
      failure_domain: 'none',
      failure_mode: 'healthy_baseline',
    },
  },

  {
    input: {
      scenario_id: 'payment-unreachable',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.PAYMENT_UNREACHABLE,
      stream_name: 'logs',
      stream_description:
        'OTel Demo logs where the payment service becomes unreachable, causing checkout failures with connection refused and deadline exceeded errors',
      features: [
        createFeature('checkout', 'entity', 'logs', {
          description: 'Checkout service (calls payment)',
        }),
        createFeature('payment', 'entity', 'logs', {
          description: 'Payment service (unreachable)',
        }),
        createFeature('checkout-payment-dep', 'dependency', 'logs', {
          description: 'Checkout depends on payment service (connection refused)',
        }),
        createFeature('frontend', 'entity', 'logs', { description: 'Frontend service' }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'payment-error-query',
          text: 'Must generate a KQL query that catches payment-related errors (connection refused, deadline exceeded, gRPC transport failure)',
          score: 3,
        },
        {
          id: 'checkout-impact-query',
          text: 'Should generate a query that detects checkout service errors caused by payment unreachability',
          score: 2,
        },
        {
          id: 'valid-kql-syntax',
          text: 'All generated queries must have valid KQL syntax that can be parsed without errors',
          score: 2,
        },
      ],
      expected_categories: ['error', 'operational'],
      kql_substrings: ['connection refused', 'deadline exceeded'],
      expected_ground_truth:
        'queries=[error detection for connection refused/deadline exceeded between checkout and payment, checkout 500 errors]',
    },
    metadata: {
      difficulty: 'medium',
      failure_domain: 'checkout',
      failure_mode: 'payment_unreachable',
    },
  },

  {
    input: {
      scenario_id: 'cart-redis-cutoff',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.CART_REDIS_CUTOFF,
      stream_name: 'logs',
      stream_description:
        'OTel Demo logs where the cart service loses connectivity to its Valkey/Redis backing store, causing cart operations to fail',
      features: [
        createFeature('cart', 'entity', 'logs', {
          description: 'Cart service (failing to connect to cache)',
        }),
        createFeature('valkey', 'technology', 'logs', {
          description: 'Valkey/Redis cache backing the cart',
        }),
        createFeature('cart-valkey-dep', 'dependency', 'logs', {
          description: 'Cart depends on Valkey (connection refused)',
        }),
        createFeature('checkout', 'entity', 'logs', {
          description: 'Checkout service (affected by cart)',
        }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'cache-error-query',
          text: 'Must generate a KQL query that catches Valkey/Redis connection failures (ECONNREFUSED, connection timeout)',
          score: 3,
        },
        {
          id: 'cart-error-query',
          text: 'Should generate a query detecting cart service errors',
          score: 2,
        },
        {
          id: 'valid-kql-syntax',
          text: 'All generated queries must have valid KQL syntax',
          score: 2,
        },
      ],
      expected_categories: ['error', 'operational'],
      kql_substrings: ['cart'],
      expected_ground_truth:
        'queries=[error detection for Valkey/Redis connection failures from cart, cart service errors]',
    },
    metadata: {
      difficulty: 'medium',
      failure_domain: 'cart',
      failure_mode: 'redis_cutoff',
    },
  },

  {
    input: {
      scenario_id: 'currency-unreachable',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.CURRENCY_UNREACHABLE,
      stream_name: 'logs',
      stream_description:
        'OTel Demo logs where the currency service is unreachable, impacting both checkout and frontend services that depend on currency conversion',
      features: [
        createFeature('checkout', 'entity', 'logs', {
          description: 'Checkout service (calls currency)',
        }),
        createFeature('frontend', 'entity', 'logs', {
          description: 'Frontend service (calls currency)',
        }),
        createFeature('currency', 'entity', 'logs', {
          description: 'Currency service (unreachable)',
        }),
        createFeature('checkout-currency-dep', 'dependency', 'logs', {
          description: 'Checkout depends on currency (connection refused)',
        }),
        createFeature('frontend-currency-dep', 'dependency', 'logs', {
          description: 'Frontend depends on currency (connection refused)',
        }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'currency-error-query',
          text: 'Must generate a KQL query that catches currency service connection errors',
          score: 3,
        },
        {
          id: 'multi-consumer-impact',
          text: 'Should generate queries reflecting impact on both checkout and frontend services',
          score: 2,
        },
        {
          id: 'valid-kql-syntax',
          text: 'All generated queries must have valid KQL syntax',
          score: 2,
        },
      ],
      expected_categories: ['error', 'operational'],
      expected_ground_truth:
        'queries=[error detection for currency service connectivity from checkout and frontend, currency connection refused errors]',
    },
    metadata: {
      difficulty: 'medium',
      failure_domain: 'currency',
      failure_mode: 'currency_unreachable',
    },
  },

  {
    input: {
      scenario_id: 'checkout-memory-starvation',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.CHECKOUT_MEMORY_STARVATION,
      stream_name: 'logs',
      stream_description:
        'OTel Demo logs where the checkout service is memory-starved, causing OOMKilled restarts, GC pressure, and cascading timeouts',
      features: [
        createFeature('checkout', 'entity', 'logs', {
          description: 'Checkout service (memory-starved)',
        }),
        createFeature('kubernetes', 'infrastructure', 'logs', {
          description: 'Kubernetes (container restarts, OOMKilled)',
        }),
        createFeature('frontend', 'entity', 'logs', {
          description: 'Frontend service (seeing checkout timeouts)',
        }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'resource-exhaustion-query',
          text: 'Must generate a KQL query that catches resource exhaustion signals (OOMKilled, memory, GC pressure, container restart)',
          score: 3,
        },
        {
          id: 'checkout-timeout-query',
          text: 'Should generate a query detecting checkout timeouts or 500 errors',
          score: 2,
        },
        {
          id: 'valid-kql-syntax',
          text: 'All generated queries must have valid KQL syntax',
          score: 2,
        },
      ],
      expected_categories: ['error', 'resource_health'],
      expected_ground_truth:
        'queries=[resource health for OOMKilled/memory exhaustion in checkout, error detection for checkout timeouts/500s]',
    },
    metadata: {
      difficulty: 'hard',
      failure_domain: 'checkout',
      failure_mode: 'memory_starvation',
    },
  },

  {
    input: {
      scenario_id: 'flagd-unreachable',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.FLAGD_UNREACHABLE,
      stream_name: 'logs',
      stream_description:
        'OTel Demo logs where the flagd feature flag service is unreachable, causing flag evaluation failures across multiple services (cart, payment, recommendation)',
      features: [
        createFeature('cart', 'entity', 'logs', {
          description: 'Cart service (cannot reach flagd)',
        }),
        createFeature('payment', 'entity', 'logs', {
          description: 'Payment service (cannot reach flagd)',
        }),
        createFeature('flagd', 'technology', 'logs', {
          description: 'Feature flag service (unreachable)',
        }),
        createFeature('services-flagd-dep', 'dependency', 'logs', {
          description: 'Multiple services depend on flagd',
        }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'flag-evaluation-query',
          text: 'Must generate a KQL query that catches flag evaluation failures or flagd connection errors',
          score: 3,
        },
        {
          id: 'cross-service-impact',
          text: 'Should capture the cross-service nature of the flagd failure (multiple services affected)',
          score: 2,
        },
        {
          id: 'valid-kql-syntax',
          text: 'All generated queries must have valid KQL syntax',
          score: 2,
        },
      ],
      expected_categories: ['error', 'configuration'],
      expected_ground_truth:
        'queries=[error detection for flagd/feature-flag evaluation failures, connection errors to flagd across cart/payment/recommendation]',
    },
    metadata: {
      difficulty: 'medium',
      failure_domain: 'flagd',
      failure_mode: 'feature_flags_unreachable',
    },
  },

  {
    input: {
      scenario_id: 'load-generator-ramp',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.LOAD_GENERATOR_RAMP,
      stream_name: 'logs',
      stream_description:
        'OTel Demo logs under ramped-up load where the load generator is sending significantly more traffic, causing latency increases and error rates across the entire system',
      features: [
        createFeature('frontend', 'entity', 'logs', {
          description: 'Frontend service (under high load)',
        }),
        createFeature('checkout', 'entity', 'logs', {
          description: 'Checkout service (under pressure)',
        }),
        createFeature('cart', 'entity', 'logs', {
          description: 'Cart service (under pressure)',
        }),
        createFeature('load-generator', 'entity', 'logs', {
          description: 'Load generator (ramped up traffic)',
        }),
      ],
    },
    output: {
      criteria: [
        {
          id: 'latency-spike-query',
          text: 'Must generate KQL queries that catch elevated latency or increased error rates',
          score: 2,
        },
        {
          id: 'system-wide-impact',
          text: 'Should generate queries covering the system-wide nature of the demand surge (not just one service)',
          score: 2,
        },
        {
          id: 'valid-kql-syntax',
          text: 'All generated queries must have valid KQL syntax',
          score: 2,
        },
      ],
      expected_categories: ['operational', 'error'],
      expected_ground_truth:
        'queries=[operational detection for elevated latency/error rates under load surge across frontend/checkout/cart services]',
    },
    metadata: {
      difficulty: 'hard',
      failure_domain: 'system-wide',
      failure_mode: 'demand_surge',
    },
  },
];
