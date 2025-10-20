/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const weightedScore = (parts: Array<[number, number]>) => {
  // parts: [value, weight]
  const totalWeight = parts.reduce((acc, [, w]) => acc + w, 0) || 1;
  const sum = parts.reduce((acc, [v, w]) => acc + v * w, 0);
  return sum / totalWeight;
};
