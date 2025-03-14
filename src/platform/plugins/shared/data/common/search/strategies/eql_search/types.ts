/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IKibanaSearchResponse, IKibanaSearchRequest } from '@kbn/search-types';
import type { EqlSearchRequest } from '@elastic/elasticsearch/lib/api/types';
import type { TransportRequestOptions } from '@elastic/elasticsearch';

export const EQL_SEARCH_STRATEGY = 'eql';

export type EqlRequestParams = EqlSearchRequest;

export interface EqlSearchStrategyRequest extends IKibanaSearchRequest<EqlRequestParams> {
  /**
   * @deprecated: use IAsyncSearchOptions.transport instead.
   */
  options?: TransportRequestOptions;
}

export type EqlSearchStrategyResponse<T = unknown> = IKibanaSearchResponse<T>;
