/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationCriterion } from '@kbn/evals';
import {
  SIGEVENTS_SNAPSHOT_NAMES,
  type SigEventsSnapshotName,
} from '../../../src/data_generators/replay';
import type { ValidFeatureType } from '../../../src/evaluators/feature_extraction_evaluators';

export interface SnapshotFeatureExtractionExample {
  input: {
    scenario_id: string;
    snapshot_name: SigEventsSnapshotName;
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

export const SNAPSHOT_FEATURE_EXTRACTION_EXAMPLES: SnapshotFeatureExtractionExample[] = [
  {
    input: {
      scenario_id: 'healthy-baseline',
      snapshot_name: SIGEVENTS_SNAPSHOT_NAMES.HEALTHY_BASELINE,
    },
    output: {
      criteria: [
        {
          id: 'entity-frontend',
          text: 'Must identify the frontend service as an entity',
          score: 2,
        },
        {
          id: 'entity-checkout',
          text: 'Must identify the checkout service as an entity',
          score: 2,
        },
        {
          id: 'entity-cart',
          text: 'Must identify the cart service as an entity',
          score: 2,
        },
        {
          id: 'entity-payment',
          text: 'Must identify the payment service as an entity',
          score: 1,
        },
        {
          id: 'entity-currency',
          text: 'Must identify the currency service as an entity',
          score: 1,
        },
        {
          id: 'dep-checkout-payment',
          text: 'Must identify the dependency from checkout to payment service',
          score: 2,
        },
        {
          id: 'dep-frontend-product-catalog',
          text: 'Must identify the dependency from frontend to product-catalog service',
          score: 2,
        },
        {
          id: 'tech-kubernetes',
          text: 'Must identify Kubernetes as infrastructure (k8s pod/container metadata present)',
          score: 1,
        },
      ],
      min_features: 4,
      max_features: 20,
      required_types: ['entity'],
      expected_ground_truth:
        'entities=[frontend, checkout, cart, payment, currency, product-catalog, recommendation, shipping, email, ad, quote], deps=[checkout->payment, checkout->currency, frontend->product-catalog, cart->valkey], infra=[kubernetes]',
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
    },
    output: {
      criteria: [
        {
          id: 'entity-checkout',
          text: 'Must identify checkout service as an entity (source of payment errors)',
          score: 2,
        },
        {
          id: 'entity-payment',
          text: 'Must identify payment service as an entity (unreachable target)',
          score: 2,
        },
        {
          id: 'dep-checkout-payment',
          text: 'Must identify the dependency from checkout to payment (connection refused / deadline exceeded)',
          score: 3,
        },
        {
          id: 'entity-frontend',
          text: 'Must identify frontend service (upstream impact)',
          score: 1,
        },
        {
          id: 'error-signatures',
          text: 'Must reference error signatures like connection refused, deadline exceeded, or gRPC errors in evidence',
          score: 2,
        },
      ],
      min_features: 3,
      max_features: 20,
      required_types: ['entity', 'dependency'],
      expected_ground_truth:
        'entities=[checkout, payment, frontend], deps=[checkout->payment (connection refused)], error_signatures=[deadline exceeded, connection refused, gRPC transport failure]',
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
    },
    output: {
      criteria: [
        {
          id: 'entity-cart',
          text: 'Must identify cart service as an entity (failing service)',
          score: 2,
        },
        {
          id: 'dep-cart-valkey',
          text: 'Must identify the dependency from cart to Valkey/Redis (dead endpoint)',
          score: 3,
        },
        {
          id: 'entity-checkout',
          text: 'Must identify checkout service (affected by cart failures)',
          score: 1,
        },
        {
          id: 'tech-redis',
          text: 'Must identify Valkey or Redis as technology or dependency',
          score: 2,
        },
        {
          id: 'error-signatures',
          text: 'Must reference connection errors to Valkey/Redis (connection refused, ECONNREFUSED, timeout)',
          score: 2,
        },
      ],
      min_features: 3,
      max_features: 20,
      required_types: ['entity', 'dependency'],
      expected_ground_truth:
        'entities=[cart, checkout, frontend], deps=[cart->valkey (connection refused)], tech=[valkey/redis], error_signatures=[ECONNREFUSED, connection timeout]',
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
    },
    output: {
      criteria: [
        {
          id: 'entity-checkout',
          text: 'Must identify checkout service (cannot reach currency)',
          score: 2,
        },
        {
          id: 'entity-frontend',
          text: 'Must identify frontend service (cannot reach currency)',
          score: 2,
        },
        {
          id: 'entity-currency',
          text: 'Must identify currency service as an entity (unreachable target)',
          score: 2,
        },
        {
          id: 'dep-checkout-currency',
          text: 'Must identify the dependency from checkout to currency service',
          score: 3,
        },
        {
          id: 'dep-frontend-currency',
          text: 'Must identify the dependency from frontend to currency service',
          score: 2,
        },
      ],
      min_features: 3,
      max_features: 20,
      required_types: ['entity', 'dependency'],
      expected_ground_truth:
        'entities=[checkout, frontend, currency], deps=[checkout->currency, frontend->currency], error_signatures=[connection refused, deadline exceeded]',
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
    },
    output: {
      criteria: [
        {
          id: 'entity-checkout',
          text: 'Must identify checkout service as an entity (resource-starved)',
          score: 2,
        },
        {
          id: 'resource-exhaustion',
          text: 'Must identify memory pressure, GC thrashing, or resource exhaustion signals',
          score: 3,
        },
        {
          id: 'entity-frontend',
          text: 'Must identify frontend (upstream, seeing timeouts from checkout)',
          score: 1,
        },
        {
          id: 'infra-kubernetes',
          text: 'Must identify Kubernetes as infrastructure (OOMKilled, container restarts)',
          score: 2,
        },
        {
          id: 'dep-upstream',
          text: 'Must identify dependency impact on services calling checkout',
          score: 2,
        },
      ],
      min_features: 3,
      max_features: 20,
      required_types: ['entity'],
      expected_ground_truth:
        'entities=[checkout, frontend], infra=[kubernetes, memory/GC], error_signatures=[timeout, OOMKilled, GC pressure, 500 errors]',
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
    },
    output: {
      criteria: [
        {
          id: 'entity-cart',
          text: 'Must identify cart service (cannot reach flagd)',
          score: 2,
        },
        {
          id: 'entity-payment',
          text: 'Must identify payment service (cannot reach flagd)',
          score: 2,
        },
        {
          id: 'dep-services-flagd',
          text: 'Must identify the dependency from multiple services to flagd (feature flag service)',
          score: 3,
        },
        {
          id: 'tech-flagd',
          text: 'Must identify flagd or feature flags as technology/dependency',
          score: 2,
        },
        {
          id: 'error-signatures',
          text: 'Must reference flag evaluation failures or connection errors to flagd',
          score: 1,
        },
      ],
      min_features: 3,
      max_features: 20,
      required_types: ['entity', 'dependency'],
      expected_ground_truth:
        'entities=[cart, payment, recommendation], deps=[cart->flagd, payment->flagd, recommendation->flagd], tech=[flagd/feature-flags], error_signatures=[flag evaluation failed, connection refused]',
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
    },
    output: {
      criteria: [
        {
          id: 'entity-frontend',
          text: 'Must identify frontend service (under high load)',
          score: 2,
        },
        {
          id: 'entity-checkout',
          text: 'Must identify checkout service (under pressure)',
          score: 1,
        },
        {
          id: 'latency-signals',
          text: 'Must identify latency increase or elevated error rates across services',
          score: 2,
        },
        {
          id: 'multiple-services',
          text: 'Must identify impact across multiple services (demand surge affects the whole system)',
          score: 2,
        },
      ],
      min_features: 3,
      max_features: 20,
      required_types: ['entity'],
      expected_ground_truth:
        'entities=[frontend, checkout, cart, ...multiple services], signals=[elevated latency, increased error rates, 500 errors under load]',
    },
    metadata: {
      difficulty: 'hard',
      failure_domain: 'system-wide',
      failure_mode: 'demand_surge',
    },
  },
];
