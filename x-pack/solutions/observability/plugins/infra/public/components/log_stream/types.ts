/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { SerializedTimeRange, SerializedTitles } from '@kbn/presentation-publishing';
import type { InfraClientStartDeps, InfraClientStartExports } from '../../types';

export type LogStreamSerializedState = SerializedTitles & SerializedTimeRange;

export type LogStreamApi = DefaultEmbeddableApi<LogStreamSerializedState>;

export interface Services {
  coreStart: CoreStart;
  pluginDeps: InfraClientStartDeps;
  pluginStart: InfraClientStartExports;
}
