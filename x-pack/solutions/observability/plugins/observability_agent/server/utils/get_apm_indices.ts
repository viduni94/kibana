/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface ApmIndexOptions {
  override?: string | string[];
}

export const getApmIndices = (options: ApmIndexOptions = {}): string | string[] => {
  if (options.override) {
    return options.override;
  }
  // Default APM/trace index patterns (serverless-compatible)
  return ['traces-apm*', 'apm-*'];
};
