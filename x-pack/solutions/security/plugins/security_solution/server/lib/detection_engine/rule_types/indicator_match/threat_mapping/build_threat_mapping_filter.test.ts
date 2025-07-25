/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ThreatMapping,
  ThreatMappingEntries,
} from '@kbn/securitysolution-io-ts-alerting-types';

import {
  filterThreatMapping,
  buildThreatMappingFilter,
  createInnerAndClauses,
  createAndOrClauses,
  buildEntriesMappingFilter,
} from './build_threat_mapping_filter';
import {
  getThreatMappingMock,
  getThreatListItemMock,
  getThreatMappingFilterMock,
  getFilterThreatMapping,
  getThreatMappingFilterShouldMock,
  getThreatListSearchResponseMock,
} from './build_threat_mapping_filter.mock';
import type { BooleanFilter, ThreatListItem } from './types';

describe('build_threat_mapping_filter', () => {
  describe('buildThreatMappingFilter', () => {
    test('it should create the correct entries when using the default mocks', () => {
      const threatMapping = getThreatMappingMock();
      const threatList = getThreatListSearchResponseMock().hits.hits;
      const filter = buildThreatMappingFilter({ threatMapping, threatList, entryKey: 'value' });
      expect(filter).toEqual(getThreatMappingFilterMock());
    });

    test('it should not mutate the original threatMapping', () => {
      const threatMapping = getThreatMappingMock();
      const threatList = getThreatListSearchResponseMock().hits.hits;
      buildThreatMappingFilter({ threatMapping, threatList, entryKey: 'value' });
      expect(threatMapping).toEqual(getThreatMappingMock());
    });

    test('it should not mutate the original threatListItem', () => {
      const threatMapping = getThreatMappingMock();
      const threatList = getThreatListSearchResponseMock().hits.hits;
      buildThreatMappingFilter({ threatMapping, threatList, entryKey: 'value' });
      expect(threatList).toEqual(getThreatListSearchResponseMock().hits.hits);
    });
  });

  describe('filterThreatMapping', () => {
    test('it should not remove any entries when using the default mocks', () => {
      const threatMapping = getThreatMappingMock();
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];

      const item = filterThreatMapping({ threatMapping, threatListItem, entryKey: 'value' });
      const expected = getFilterThreatMapping();
      expect(item).toEqual(expected);
    });

    test('it should only give one filtered element if only 1 element is defined', () => {
      const [firstElement] = getThreatMappingMock(); // get only the first element
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];

      const item = filterThreatMapping({
        threatMapping: [firstElement],
        threatListItem,
        entryKey: 'value',
      });
      const [firstElementFilter] = getFilterThreatMapping(); // get only the first element to compare
      expect(item).toEqual([firstElementFilter]);
    });

    test('it should not mutate the original threatMapping', () => {
      const threatMapping = getThreatMappingMock();
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];

      filterThreatMapping({
        threatMapping,
        threatListItem,
        entryKey: 'value',
      });
      expect(threatMapping).toEqual(getThreatMappingMock());
    });

    test('it should not mutate the original threatListItem', () => {
      const threatMapping = getThreatMappingMock();
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];

      filterThreatMapping({
        threatMapping,
        threatListItem,
        entryKey: 'value',
      });
      expect(threatListItem).toEqual(getThreatListSearchResponseMock().hits.hits[0]);
    });

    test('it should remove the entire "AND" clause if one of the pieces of data is missing from the list', () => {
      const item = filterThreatMapping({
        threatMapping: [
          {
            entries: [
              {
                field: 'host.name',
                type: 'mapping',
                value: 'host.name',
              },
              {
                field: 'host.ip',
                type: 'mapping',
                value: 'host.ip',
              },
            ],
          },
        ],
        threatListItem: getThreatListItemMock({
          _source: {
            '@timestamp': '2020-09-09T21:59:13Z',
            host: {
              name: 'host-1',
              // since ip is missing this entire AND clause should be dropped
            },
          },
          fields: {
            '@timestamp': ['2020-09-09T21:59:13Z'],
            'host.name': ['host-1'],
          },
        }),
        entryKey: 'value',
      });
      expect(item).toEqual([]);
    });

    test('it should remove 1 "AND" clause but keep the second one from the "OR" if the first "AND" has missing data element from the list', () => {
      const item = filterThreatMapping({
        threatMapping: [
          {
            entries: [
              {
                field: 'host.name',
                type: 'mapping',
                value: 'host.name',
              },
              {
                field: 'host.ip', // Since host.ip is missing, this entire "AND" should be dropped
                type: 'mapping',
                value: 'host.ip',
              },
            ],
          },
          {
            entries: [
              {
                field: 'host.name',
                type: 'mapping',
                value: 'host.name',
              },
            ],
          },
        ],
        threatListItem: getThreatListItemMock({
          _source: {
            '@timestamp': '2020-09-09T21:59:13Z',
            host: {
              name: 'host-1',
            },
          },
          fields: {
            '@timestamp': ['2020-09-09T21:59:13Z'],
            'host.name': ['host-1'],
          },
        }),
        entryKey: 'value',
      });
      expect(item).toEqual([
        {
          entries: [
            {
              field: 'host.name',
              type: 'mapping',
              value: 'host.name',
            },
          ],
        },
      ]);
    });
  });

  describe('createInnerAndClauses', () => {
    test('it should return two clauses given a single entry', () => {
      const [{ entries: threatMappingEntries }] = getThreatMappingMock(); // get the first element
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      const innerClause = createInnerAndClauses({
        threatMappingEntries,
        threatListItem,
        entryKey: 'value',
      });
      const {
        bool: {
          should: [
            {
              bool: { filter },
            },
          ],
        },
      } = getThreatMappingFilterShouldMock();
      expect(innerClause).toEqual(filter);
    });

    test('it should return an empty array given an empty array', () => {
      const threatListItem = getThreatListItemMock();
      const innerClause = createInnerAndClauses({
        threatMappingEntries: [],
        threatListItem,
        entryKey: 'value',
      });
      expect(innerClause).toEqual([]);
    });

    test('it should filter out a single unknown value', () => {
      const [{ entries }] = getThreatMappingMock(); // get the first element
      const threatMappingEntries: ThreatMappingEntries = [
        ...entries,
        {
          field: 'host.name', // add second invalid entry which should be filtered away
          value: 'invalid',
          type: 'mapping',
        },
      ];
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      const innerClause = createInnerAndClauses({
        threatMappingEntries,
        threatListItem,
        entryKey: 'value',
      });
      const {
        bool: {
          should: [
            {
              bool: { filter },
            },
          ],
        },
      } = getThreatMappingFilterShouldMock(); // get the first element
      expect(innerClause).toEqual(filter);
    });

    test('it should filter out 2 unknown values', () => {
      const [{ entries }] = getThreatMappingMock(); // get the first element
      const threatMappingEntries: ThreatMappingEntries = [
        ...entries,
        {
          field: 'host.name', // add second invalid entry which should be filtered away
          value: 'invalid',
          type: 'mapping',
        },
        {
          field: 'host.ip', // add second invalid entry which should be filtered away
          value: 'invalid',
          type: 'mapping',
        },
      ];
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      const innerClause = createInnerAndClauses({
        threatMappingEntries,
        threatListItem,
        entryKey: 'value',
      });
      const {
        bool: {
          should: [
            {
              bool: { filter },
            },
          ],
        },
      } = getThreatMappingFilterShouldMock(); // get the first element
      expect(innerClause).toEqual(filter);
    });

    test('it should filter out all unknown values as an empty array', () => {
      const threatMappingEntries: ThreatMappingEntries = [
        {
          field: 'host.name', // add second invalid entry which should be filtered away
          value: 'invalid',
          type: 'mapping',
        },
        {
          field: 'host.ip', // add second invalid entry which should be filtered away
          value: 'invalid',
          type: 'mapping',
        },
      ];
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      const innerClause = createInnerAndClauses({
        threatMappingEntries,
        threatListItem,
        entryKey: 'value',
      });
      expect(innerClause).toEqual([]);
    });
  });

  describe('createAndOrClauses', () => {
    test('it should return all clauses given the entries', () => {
      const threatMapping = getThreatMappingMock();
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      const innerClause = createAndOrClauses({ threatMapping, threatListItem, entryKey: 'value' });
      expect(innerClause).toEqual(getThreatMappingFilterShouldMock().bool.should);
    });

    test('it should filter out data from entries that do not have mappings', () => {
      const threatMapping = getThreatMappingMock();
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      threatListItem._source = {
        ...getThreatListSearchResponseMock().hits.hits[0]._source,
        foo: 'bar',
      };
      const innerClause = createAndOrClauses({ threatMapping, threatListItem, entryKey: 'value' });
      expect(innerClause).toEqual(getThreatMappingFilterShouldMock().bool.should);
    });

    test('it should return an empty boolean given an empty array', () => {
      const threatListItem = getThreatListSearchResponseMock().hits.hits[0];
      const innerClause = createAndOrClauses({
        threatMapping: [],
        threatListItem,
        entryKey: 'value',
      });
      expect(innerClause).toEqual([]);
    });

    test('it should return an empty boolean clause given an empty object for a threat list item', () => {
      const threatMapping = getThreatMappingMock();
      const innerClause = createAndOrClauses({
        threatMapping,
        threatListItem: getThreatListItemMock({ _source: {}, fields: {} }),
        entryKey: 'value',
      });
      expect(innerClause).toEqual([]);
    });
  });

  describe('buildEntriesMappingFilter', () => {
    test('it should return all clauses given the entries', () => {
      const threatMapping = getThreatMappingMock();
      const threatList = getThreatListSearchResponseMock().hits.hits;
      const mapping = buildEntriesMappingFilter({
        threatMapping,
        threatList,
        entryKey: 'value',
      });
      const expected: BooleanFilter = getThreatMappingFilterShouldMock();
      expect(mapping).toEqual(expected);
    });

    test('it should return empty "should" given an empty threat list', () => {
      const threatMapping = getThreatMappingMock();
      const threatList: ThreatListItem[] = [];
      const mapping = buildEntriesMappingFilter({
        threatMapping,
        threatList,
        entryKey: 'value',
      });
      const expected: BooleanFilter = {
        bool: { should: [], minimum_should_match: 1 },
      };
      expect(mapping).toEqual(expected);
    });

    test('it should return empty "should" given an empty threat mapping', () => {
      const threatList = getThreatListSearchResponseMock().hits.hits;
      const mapping = buildEntriesMappingFilter({
        threatMapping: [],
        threatList,
        entryKey: 'value',
      });
      const expected: BooleanFilter = {
        bool: { should: [], minimum_should_match: 1 },
      };
      expect(mapping).toEqual(expected);
    });

    test('it should ignore entries that are invalid', () => {
      const entries: ThreatMappingEntries = [
        {
          field: 'host.name',
          type: 'mapping',
          value: 'invalid',
        },
        {
          field: 'host.ip',
          type: 'mapping',
          value: 'invalid',
        },
      ];

      const threatMapping: ThreatMapping = [
        ...getThreatMappingMock(),
        ...[
          {
            entries,
          },
        ],
      ];
      const threatList = getThreatListSearchResponseMock().hits.hits;
      const mapping = buildEntriesMappingFilter({
        threatMapping,
        threatList,
        entryKey: 'value',
      });
      const expected: BooleanFilter = getThreatMappingFilterShouldMock();
      expect(mapping).toEqual(expected);
    });

    test('it should use terms query if allowedFieldsForTermsQuery provided', () => {
      const threatMapping = getThreatMappingMock();
      const threatList = getThreatListSearchResponseMock().hits.hits;
      const mapping = buildEntriesMappingFilter({
        threatMapping,
        threatList,
        entryKey: 'value',
        allowedFieldsForTermsQuery: {
          source: { 'source.ip': true },
          threat: { 'source.ip': true },
        },
      });
      const mock = getThreatMappingFilterShouldMock();
      mock.bool.should.pop();

      const expected: BooleanFilter = {
        bool: {
          should: [
            ...mock.bool.should,
            {
              terms: {
                _name: '__SEP____SEP__source.ip__SEP__source.ip__SEP__tq',
                'source.ip': ['127.0.0.1'],
              },
            },
          ],
          minimum_should_match: 1,
        },
      };
      expect(mapping).toEqual(expected);
    });

    test('it should use match query if allowedFieldsForTermsQuery provided, but it is AND', () => {
      const threatMapping = getThreatMappingMock();
      const threatList = getThreatListSearchResponseMock().hits.hits;
      const mapping = buildEntriesMappingFilter({
        threatMapping,
        threatList,
        entryKey: 'value',
        allowedFieldsForTermsQuery: {
          source: { 'host.name': true, 'host.ip': true },
          threat: { 'host.name': true, 'host.ip': true },
        },
      });

      const expected: BooleanFilter = getThreatMappingFilterShouldMock();
      expect(mapping).toEqual(expected);
    });
  });
});
