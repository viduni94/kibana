/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Computes the themeTag that will be used on the client-side as `__kbnThemeTag__`
 * @see `src/platform/packages/private/kbn-ui-shared-deps-src/theme.ts`
 */
export const getThemeTag = ({ name, darkMode }: { name: string; darkMode: boolean }) => {
  return `${name}${darkMode ? 'dark' : 'light'}`;
};
