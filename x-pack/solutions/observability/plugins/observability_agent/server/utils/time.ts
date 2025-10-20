/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const toDate = (iso: string): number => new Date(iso).valueOf();

export const pickAutoInterval = (fromMs: number, toMs: number): string => {
  const spanMs = Math.max(0, toMs - fromMs);
  const minutes = spanMs / 60000;
  if (minutes <= 15) return '30s';
  if (minutes <= 60) return '1m';
  if (minutes <= 6 * 60) return '5m';
  if (minutes <= 24 * 60) return '15m';
  if (minutes <= 3 * 24 * 60) return '30m';
  if (minutes <= 7 * 24 * 60) return '1h';
  return '3h';
};
