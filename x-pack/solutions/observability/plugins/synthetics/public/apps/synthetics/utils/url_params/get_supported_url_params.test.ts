/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import DateMath from '@kbn/datemath';
import { getSupportedUrlParams } from './get_supported_url_params';
import { CLIENT_DEFAULTS } from '../../../../../common/constants';
import { CLIENT_DEFAULTS_SYNTHETICS } from '../../../../../common/constants/synthetics/client_defaults';

describe('getSupportedUrlParams', () => {
  let dateMathSpy: any;
  const MOCK_DATE_VALUE = 20;

  beforeEach(() => {
    dateMathSpy = jest.spyOn(DateMath, 'parse');
    dateMathSpy.mockReturnValue(MOCK_DATE_VALUE);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns custom values', () => {
    const customValues = {
      autorefreshInterval: '23',
      autorefreshIsPaused: 'false',
      dateRangeStart: 'now-15m',
      dateRangeEnd: 'now',
      monitorListPageIndex: '23',
      monitorListPageSize: '50',
      monitorListSortDirection: 'desc',
      monitorListSortField: 'monitor.status',
      search: 'monitor.status: down',
      selectedPingStatus: 'up',
    };

    const expected = {
      absoluteDateRangeEnd: 20,
      absoluteDateRangeStart: 20,
      dateRangeEnd: 'now',
      dateRangeStart: 'now-15m',
      search: 'monitor.status: down',
    };

    const result = getSupportedUrlParams(customValues);
    expect(result).toMatchObject(expected);
  });

  it('returns default values', () => {
    const { FILTERS, SEARCH, STATUS_FILTER } = CLIENT_DEFAULTS;
    const { DATE_RANGE_START, DATE_RANGE_END } = CLIENT_DEFAULTS_SYNTHETICS;
    const result = getSupportedUrlParams({});
    expect(result).toEqual({
      absoluteDateRangeStart: MOCK_DATE_VALUE,
      absoluteDateRangeEnd: MOCK_DATE_VALUE,
      dateRangeStart: DATE_RANGE_START,
      dateRangeEnd: DATE_RANGE_END,
      excludedFilters: '',
      filters: FILTERS,
      focusConnectorField: false,
      pagination: undefined,
      search: SEARCH,
      statusFilter: STATUS_FILTER,
      query: '',
      locations: [],
      monitorTypes: [],
      projects: [],
      schedules: [],
      tags: [],
      useLogicalAndFor: [],
    });
  });

  it('returns the first item for string arrays', () => {
    const result = getSupportedUrlParams({
      dateRangeStart: ['now-18d', 'now-11d', 'now-5m'],
    });

    const expected = {
      absoluteDateRangeEnd: 20,
      absoluteDateRangeStart: 20,
    };

    expect(result).toMatchObject(expected);
  });

  it('provides defaults for undefined values', () => {
    const result = getSupportedUrlParams({
      dateRangeStart: undefined,
    });

    const expected = {
      absoluteDateRangeStart: 20,
    };

    expect(result).toMatchObject(expected);
  });

  it('provides defaults for empty string array values', () => {
    const result = getSupportedUrlParams({
      dateRangeStart: [],
    });

    const expected = {
      absoluteDateRangeStart: 20,
    };

    expect(result).toMatchObject(expected);
  });
});
