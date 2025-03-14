/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  hashedItemStore,
  getStatesFromKbnUrl,
  setStateToKbnUrl,
} from '@kbn/kibana-utils-plugin/public';
import { mockStorage } from '@kbn/kibana-utils-plugin/public/storage/hashed_item_store/mock';
import { FilterStateStore } from '@kbn/es-query';
import type { DiscoverAppLocatorParams } from './app_locator';
import { DISCOVER_APP_LOCATOR } from './app_locator';
import type { SerializableRecord } from '@kbn/utility-types';
import { createDataViewDataSource, createEsqlDataSource } from './data_sources';
import { appLocatorGetLocationCommon } from './app_locator_get_location';

const dataViewId: string = 'c367b774-a4c2-11ea-bb37-0242ac130002';
const savedSearchId: string = '571aaf70-4c88-11e8-b3d7-01146121b73d';

interface SetupParams {
  useHash?: boolean;
}

const setup = async ({ useHash = false }: SetupParams = {}) => {
  const locator = {
    id: DISCOVER_APP_LOCATOR,
    getLocation: (params: DiscoverAppLocatorParams) => {
      return appLocatorGetLocationCommon({ useHash, setStateToKbnUrl }, params);
    },
  };

  return { locator };
};

beforeEach(() => {
  // @ts-expect-error
  hashedItemStore.storage = mockStorage;
});

describe('Discover url generator', () => {
  test('can create a link to Discover with no state and no saved search', async () => {
    const { locator } = await setup();
    const { app, path } = await locator.getLocation({});
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(app).toBe('discover');
    expect(_a).toEqual(undefined);
    expect(_g).toEqual(undefined);
  });

  test('can create a link to a saved search in Discover', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({ savedSearchId });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(path.startsWith(`#/view/${savedSearchId}`)).toBe(true);
    expect(_a).toEqual(undefined);
    expect(_g).toEqual(undefined);
  });

  test('can specify specific data view', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({ dataViewId });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual({
      dataSource: createDataViewDataSource({ dataViewId }),
    });
    expect(_g).toEqual(undefined);
  });

  test('can specify specific time range', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      timeRange: { to: 'now', from: 'now-15m', mode: 'relative' },
    });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual(undefined);
    expect(_g).toEqual({
      time: {
        from: 'now-15m',
        mode: 'relative',
        to: 'now',
      },
    });
  });

  test('can specify query', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      query: {
        language: 'kuery',
        query: 'foo',
      },
    });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual({
      query: {
        language: 'kuery',
        query: 'foo',
      },
    });
    expect(_g).toEqual(undefined);
  });

  test('can specify an ES|QL query', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      dataViewId,
      query: {
        esql: 'SELECT * FROM test',
      },
    });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual({
      dataSource: createEsqlDataSource(),
      query: {
        esql: 'SELECT * FROM test',
      },
    });
    expect(_g).toEqual(undefined);
  });

  test('can specify local and global filters', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      filters: [
        {
          meta: {
            alias: 'foo',
            disabled: false,
            negate: false,
          },
          $state: {
            store: FilterStateStore.APP_STATE,
          },
        },
        {
          meta: {
            alias: 'bar',
            disabled: false,
            negate: false,
          },
          $state: {
            store: FilterStateStore.GLOBAL_STATE,
          },
        },
      ],
    });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual({
      filters: [
        {
          $state: {
            store: 'appState',
          },
          meta: {
            alias: 'foo',
            disabled: false,
            negate: false,
          },
        },
      ],
    });
    expect(_g).toEqual({
      filters: [
        {
          $state: {
            store: 'globalState',
          },
          meta: {
            alias: 'bar',
            disabled: false,
            negate: false,
          },
        },
      ],
    });
  });

  test('can set refresh interval', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      refreshInterval: {
        pause: false,
        value: 666,
      },
    });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual(undefined);
    expect(_g).toEqual({
      refreshInterval: {
        pause: false,
        value: 666,
      },
    });
  });

  test('can set time range', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      timeRange: {
        from: 'now-3h',
        to: 'now',
      },
    });
    const { _a, _g } = getStatesFromKbnUrl(path, ['_a', '_g']);

    expect(_a).toEqual(undefined);
    expect(_g).toEqual({
      time: {
        from: 'now-3h',
        to: 'now',
      },
    });
  });

  test('can specify a search session id', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      searchSessionId: '__test__',
    });

    expect(path).toMatchInlineSnapshot(`"#/?searchSessionId=__test__"`);
    expect(path).toContain('__test__');
  });

  test('can specify columns, grid, interval, sort and savedQuery', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({
      columns: ['_source'],
      grid: {
        columns: {
          _source: { width: 150 },
        },
      },
      interval: 'auto',
      sort: [['timestamp, asc']] as string[][] & SerializableRecord,
      savedQuery: '__savedQueryId__',
    });

    expect(path).toMatchInlineSnapshot(
      `"#/?_a=(columns:!(_source),grid:(columns:(_source:(width:150))),interval:auto,savedQuery:__savedQueryId__,sort:!(!('timestamp,%20asc')))"`
    );
  });

  test('should use legacy locator params', async () => {
    const { locator } = await setup();
    const { path } = await locator.getLocation({ dataViewId });
    const { path: legacyParamsPath } = await locator.getLocation({ indexPatternId: dataViewId });

    expect(path).toEqual(legacyParamsPath);
  });

  test('should create data view when dataViewSpec is used', async () => {
    const dataViewSpecMock = {
      id: 'mock-id',
      title: 'mock-title',
      timeFieldName: 'mock-time-field-name',
    };
    const { locator } = await setup();
    const { state } = await locator.getLocation({ dataViewSpec: dataViewSpecMock });

    expect((state as Record<string, unknown>).dataViewSpec).toEqual(dataViewSpecMock);
  });

  describe('useHash property', () => {
    describe('when default useHash is set to false', () => {
      test('when using default, sets data view ID in the generated URL', async () => {
        const { locator } = await setup();
        const { path } = await locator.getLocation({ dataViewId });

        expect(path.indexOf(dataViewId) > -1).toBe(true);
      });

      test('when enabling useHash, does not set data view ID in the generated URL', async () => {
        const { locator } = await setup();
        const { path } = await locator.getLocation({
          useHash: true,
          dataViewId,
        });

        expect(path.indexOf(dataViewId) > -1).toBe(false);
      });
    });

    describe('when default useHash is set to true', () => {
      test('when using default, does not set data view ID in the generated URL', async () => {
        const { locator } = await setup({ useHash: true });
        const { path } = await locator.getLocation({
          dataViewId,
        });

        expect(path.indexOf(dataViewId) > -1).toBe(false);
      });

      test('when disabling useHash, sets data view ID in the generated URL', async () => {
        const { locator } = await setup({ useHash: true });
        const { path } = await locator.getLocation({
          useHash: false,
          dataViewId,
        });

        expect(path.indexOf(dataViewId) > -1).toBe(true);
      });
    });
  });
});
