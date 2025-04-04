/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * NOTICE: Do not edit this file manually.
 * This file is automatically generated by the OpenAPI Generator, @kbn/openapi-generator.
 *
 * info:
 *   title: ML Rule Attributes
 *   version: not applicable
 */

import { z } from '@kbn/zod';

/**
 * Anomaly score threshold above which the rule creates an alert. Valid values are from 0 to 100.
 */
export type AnomalyThreshold = z.infer<typeof AnomalyThreshold>;
export const AnomalyThreshold = z.number().int().min(0);

/**
 * Machine learning job ID(s) the rule monitors for anomaly scores.
 */
export type MachineLearningJobId = z.infer<typeof MachineLearningJobId>;
export const MachineLearningJobId = z.union([z.string(), z.array(z.string()).min(1)]);
