/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { getGroupingQuery } from '@kbn/grouping';
import {
  GroupingAggregation,
  GroupPanelRenderer,
  GetGroupStats,
  isNoneGroup,
  NamedAggregation,
  parseGroupingQuery,
} from '@kbn/grouping/src';
import { useMemo } from 'react';
import { buildEsQuery, Filter } from '@kbn/es-query';
import {
  LATEST_FINDINGS_RETENTION_POLICY,
  buildMutedRulesFilter,
} from '@kbn/cloud-security-posture-common';
import type { FindingsGroupingAggregation } from '@kbn/cloud-security-posture';
import { useGetCspBenchmarkRulesStatesApi } from '@kbn/cloud-security-posture/src/hooks/use_get_benchmark_rules_state_api';
import {
  CDR_MISCONFIGURATION_GROUPING_RUNTIME_MAPPING_FIELDS,
  FINDINGS_GROUPING_OPTIONS,
  LOCAL_STORAGE_FINDINGS_GROUPING_KEY,
} from '../../../common/constants';
import { useDataViewContext } from '../../../common/contexts/data_view_context';
import { Evaluation } from '../../../../common/types_old';
import { FindingsRootGroupingAggregation, useGroupedFindings } from './use_grouped_findings';
import {
  FINDINGS_UNIT,
  groupingTitle,
  defaultGroupingOptions,
  getDefaultQuery,
  MISCONFIGURATIONS_GROUPS_UNIT,
} from './constants';
import { useCloudSecurityGrouping } from '../../../components/cloud_security_grouping';
import { getFilters } from '../utils/get_filters';

const getTermAggregation = (key: keyof FindingsGroupingAggregation, field: string) => ({
  [key]: {
    terms: { field, size: 1 },
  },
});

const getAggregationsByGroupField = (field: string): NamedAggregation[] => {
  if (isNoneGroup([field])) {
    return [];
  }
  const aggMetrics: NamedAggregation[] = [
    {
      groupByField: {
        cardinality: {
          field,
        },
      },
      failedFindings: {
        filter: {
          term: {
            'result.evaluation': { value: 'failed' },
          },
        },
      },
      passedFindings: {
        filter: {
          term: {
            'result.evaluation': { value: 'passed' },
          },
        },
      },
      complianceScore: {
        bucket_script: {
          buckets_path: {
            passed: 'passedFindings>_count',
            failed: 'failedFindings>_count',
          },
          script: 'params.passed / (params.passed + params.failed)',
        },
      },
    },
  ];

  switch (field) {
    case FINDINGS_GROUPING_OPTIONS.RESOURCE_ID:
      return [
        ...aggMetrics,
        getTermAggregation('resourceName', 'resource.name'),
        getTermAggregation('resourceSubType', 'resource.sub_type'),
      ];
    case FINDINGS_GROUPING_OPTIONS.RULE_NAME:
      return [
        ...aggMetrics,
        getTermAggregation('benchmarkName', 'rule.benchmark.name'),
        getTermAggregation('benchmarkVersion', 'rule.benchmark.version'),
      ];
    case FINDINGS_GROUPING_OPTIONS.CLOUD_ACCOUNT_ID:
      return [
        ...aggMetrics,
        getTermAggregation('benchmarkName', 'rule.benchmark.name'),
        getTermAggregation('benchmarkId', 'rule.benchmark.id'),
        getTermAggregation('accountName', 'cloud.account.name'),
      ];
    case FINDINGS_GROUPING_OPTIONS.ORCHESTRATOR_CLUSTER_ID:
      return [
        ...aggMetrics,
        getTermAggregation('benchmarkName', 'rule.benchmark.name'),
        getTermAggregation('benchmarkId', 'rule.benchmark.id'),
        getTermAggregation('clusterName', 'orchestrator.cluster.name'),
      ];
  }
  return aggMetrics;
};

/**
 * Get runtime mappings for the given group field
 * Some fields require additional runtime mappings to aggregate additional information
 * Fallback to keyword type to support custom fields grouping
 */
const getRuntimeMappingsByGroupField = (
  field: string
): Record<string, { type: 'keyword' }> | undefined => {
  if (CDR_MISCONFIGURATION_GROUPING_RUNTIME_MAPPING_FIELDS?.[field]) {
    return CDR_MISCONFIGURATION_GROUPING_RUNTIME_MAPPING_FIELDS[field].reduce(
      (acc, runtimeField) => ({
        ...acc,
        [runtimeField]: {
          type: 'keyword',
        },
      }),
      {}
    );
  }
  return {};
};

/**
 * Type Guard for checking if the given source is a FindingsRootGroupingAggregation
 */
export const isFindingsRootGroupingAggregation = (
  groupData: Record<string, any> | undefined
): groupData is FindingsRootGroupingAggregation => {
  return (
    groupData?.passedFindings?.doc_count !== undefined &&
    groupData?.failedFindings?.doc_count !== undefined
  );
};

/**
 * Utility hook to get the latest findings grouping data
 * for the findings page
 */
export const useLatestFindingsGrouping = ({
  groupPanelRenderer,
  getGroupStats,
  groupingLevel = 0,
  groupFilters = [],
  selectedGroup,
}: {
  groupPanelRenderer?: GroupPanelRenderer<FindingsGroupingAggregation>;
  getGroupStats?: GetGroupStats<FindingsGroupingAggregation>;
  groupingLevel?: number;
  groupFilters?: Filter[];
  selectedGroup?: string;
}) => {
  const { dataView } = useDataViewContext();

  const {
    activePageIndex,
    grouping,
    pageSize,
    query,
    onChangeGroupsItemsPerPage,
    onChangeGroupsPage,
    urlQuery,
    setUrlQuery,
    uniqueValue,
    isNoneSelected,
    onResetFilters,
    error,
    filters,
    setActivePageIndex,
  } = useCloudSecurityGrouping({
    dataView,
    groupingTitle,
    defaultGroupingOptions,
    getDefaultQuery,
    unit: FINDINGS_UNIT,
    groupPanelRenderer,
    getGroupStats,
    groupingLocalStorageKey: LOCAL_STORAGE_FINDINGS_GROUPING_KEY,
    groupingLevel,
    groupsUnit: MISCONFIGURATIONS_GROUPS_UNIT,
  });

  const additionalFilters = buildEsQuery(dataView, [], groupFilters);
  const currentSelectedGroup = selectedGroup || grouping.selectedGroups[0];

  const { data: rulesStates } = useGetCspBenchmarkRulesStatesApi();
  const mutedRulesFilterQuery = rulesStates ? buildMutedRulesFilter(rulesStates) : [];

  const groupingQuery = getGroupingQuery({
    additionalFilters: query ? [query, additionalFilters] : [additionalFilters],
    groupByField: currentSelectedGroup,
    uniqueValue,
    timeRange: {
      from: `now-${LATEST_FINDINGS_RETENTION_POLICY}`,
      to: 'now',
    },
    pageNumber: activePageIndex * pageSize,
    size: pageSize,
    sort: [{ groupByField: { order: 'desc' } }, { complianceScore: { order: 'asc' } }],
    statsAggregations: getAggregationsByGroupField(currentSelectedGroup),
    runtimeMappings: getRuntimeMappingsByGroupField(currentSelectedGroup),
    rootAggregations: [
      {
        failedFindings: {
          filter: {
            term: {
              'result.evaluation': { value: 'failed' },
            },
          },
        },
        passedFindings: {
          filter: {
            term: {
              'result.evaluation': { value: 'passed' },
            },
          },
        },
        ...(!isNoneGroup([currentSelectedGroup]) && {
          nullGroupItems: {
            missing: { field: currentSelectedGroup },
          },
        }),
      },
    ],
  });

  const filteredGroupingQuery = {
    ...groupingQuery,
    query: {
      ...groupingQuery.query,
      bool: { ...groupingQuery.query.bool, must_not: mutedRulesFilterQuery },
    },
  };

  const { data, isFetching } = useGroupedFindings({
    query: filteredGroupingQuery,
    enabled: !isNoneSelected,
  });

  const groupData = useMemo(
    () =>
      parseGroupingQuery(
        currentSelectedGroup,
        uniqueValue,
        data as GroupingAggregation<FindingsGroupingAggregation>
      ),
    [data, currentSelectedGroup, uniqueValue]
  );

  const totalPassedFindings = isFindingsRootGroupingAggregation(groupData)
    ? groupData?.passedFindings?.doc_count || 0
    : 0;
  const totalFailedFindings = isFindingsRootGroupingAggregation(groupData)
    ? groupData?.failedFindings?.doc_count || 0
    : 0;

  const onDistributionBarClick = (evaluation: Evaluation) => {
    setUrlQuery({
      filters: getFilters({
        filters,
        dataView,
        field: 'result.evaluation',
        value: evaluation,
        negate: false,
      }),
    });
  };

  const isEmptyResults =
    !isFetching && isFindingsRootGroupingAggregation(groupData) && !groupData.unitsCount?.value;

  return {
    groupData,
    grouping,
    isFetching,
    activePageIndex,
    setActivePageIndex,
    pageSize,
    selectedGroup,
    onChangeGroupsItemsPerPage,
    onChangeGroupsPage,
    urlQuery,
    setUrlQuery,
    isGroupSelected: !isNoneSelected,
    isGroupLoading: !data,
    onResetFilters,
    filters,
    error,
    onDistributionBarClick,
    totalPassedFindings,
    totalFailedFindings,
    isEmptyResults,
  };
};
