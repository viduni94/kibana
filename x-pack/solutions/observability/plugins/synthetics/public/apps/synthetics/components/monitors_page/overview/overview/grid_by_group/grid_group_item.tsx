/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiBadge,
  EuiButtonIcon,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiNotificationBadge,
  EuiSpacer,
  EuiTablePagination,
} from '@elastic/eui';
import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useSelector } from 'react-redux';
import useKey from 'react-use/lib/useKey';
import { FlyoutParamProps } from '../types';
import { OverviewLoader } from '../overview_loader';
import { useFilteredGroupMonitors } from './use_filtered_group_monitors';
import { OverviewStatusMetaData } from '../../types';
import { selectOverviewStatus } from '../../../../../state/overview_status';
import { MetricItem } from '../metric_item/metric_item';
import { OverviewView } from '../../../../../state';
import { MonitorsTable } from '../compact_view/components/monitors_table';

const PER_ROW = 4;
const DEFAULT_ROW_SIZE = 2;

const GroupGridCardContent = ({
  isLoading,
  setFlyoutConfigCallback,
  groupMonitors,
}: {
  isLoading: boolean;
  setFlyoutConfigCallback: (params: FlyoutParamProps) => void;
  groupMonitors: OverviewStatusMetaData[];
}) => {
  const [activePage, setActivePage] = useState(0);
  const [rowSize, setRowSize] = useState(DEFAULT_ROW_SIZE);
  const visibleMonitors = groupMonitors.slice(
    activePage * rowSize * PER_ROW,
    (activePage + 1) * rowSize * PER_ROW
  );

  const totalEntries = groupMonitors.length / PER_ROW;

  const goToPage = (pageNumber: number) => setActivePage(pageNumber);
  const changeItemsPerPage = (pageSize: number) => {
    setRowSize(pageSize);
    setActivePage(0);
  };

  return (
    <>
      {!isLoading ? (
        <EuiFlexGrid
          columns={4}
          gutterSize="m"
          data-test-subj="syntheticsOverviewGridItemContainer"
        >
          {visibleMonitors.map((monitor) => (
            <EuiFlexItem
              key={`${monitor.configId}-${monitor.locationId}`}
              data-test-subj="syntheticsOverviewGridItem"
            >
              <MetricItem monitor={monitor} onClick={setFlyoutConfigCallback} />
            </EuiFlexItem>
          ))}
        </EuiFlexGrid>
      ) : (
        <OverviewLoader rows={rowSize} />
      )}
      <EuiSpacer size="m" />
      <EuiTablePagination
        aria-label={i18n.translate(
          'xpack.synthetics.groupGridItem.euiTablePagination.monitorGridPaginationLabel',
          { defaultMessage: 'Monitor grid pagination' }
        )}
        pageCount={Math.ceil(totalEntries / rowSize)}
        activePage={activePage}
        onChangePage={goToPage}
        itemsPerPage={rowSize}
        onChangeItemsPerPage={changeItemsPerPage}
        itemsPerPageOptions={[2, 3, 4, 5, 10]}
      />
    </>
  );
};

export const GroupGridItem = ({
  loaded,
  groupLabel,
  fullScreenGroup,
  setFullScreenGroup,
  groupMonitors: allGroupMonitors,
  setFlyoutConfigCallback,
  view,
}: {
  loaded: boolean;
  groupMonitors: OverviewStatusMetaData[];
  groupLabel: string;
  fullScreenGroup: string;
  setFullScreenGroup: (group: string) => void;
  setFlyoutConfigCallback: (params: FlyoutParamProps) => void;
  view: OverviewView;
}) => {
  const { status: overviewStatus } = useSelector(selectOverviewStatus);

  const groupMonitors = useFilteredGroupMonitors({ groupMonitors: allGroupMonitors });
  const downMonitors = groupMonitors.filter((monitor) => {
    const downConfigs = overviewStatus?.downConfigs;
    if (downConfigs) {
      return downConfigs[`${monitor.configId}-${monitor.locationId}`]?.status === 'down';
    }
  });

  const downMonitorsCount = downMonitors.length;

  const { status } = useSelector(selectOverviewStatus);

  useKey('Escape', () => {
    if (fullScreenGroup === groupLabel) {
      setFullScreenGroup('');
    }
  });

  const isLoading = !loaded || !status;

  return (
    <EuiAccordion
      initialIsOpen={fullScreenGroup === groupLabel}
      isDisabled={fullScreenGroup === groupLabel || groupMonitors.length === 0}
      id={'groupAccordion' + groupLabel}
      buttonContent={
        <EuiFlexGroup alignItems="center" gutterSize="s">
          <EuiFlexItem className="eui-textNoWrap">{groupLabel}</EuiFlexItem>
          {downMonitorsCount > 0 && (
            <EuiFlexItem className="eui-textNoWrap">
              <EuiNotificationBadge color="accent">{downMonitorsCount}</EuiNotificationBadge>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      }
      extraAction={
        isLoading ? null : (
          <EuiFlexGroup alignItems="center" gutterSize="m">
            <EuiFlexItem>
              <EuiButtonIcon
                data-test-subj="syntheticsGroupGridItemButton"
                isDisabled={groupMonitors.length === 0}
                className="fullScreenButton"
                iconType="fullScreen"
                aria-label={i18n.translate(
                  'xpack.synthetics.groupGridItem.euiButtonIcon.fullScreenLabel',
                  { defaultMessage: 'Full screen' }
                )}
                onClick={() => {
                  if (fullScreenGroup) {
                    setFullScreenGroup('');
                    document.exitFullscreen();
                  } else {
                    document.documentElement.requestFullscreen();
                    setFullScreenGroup(groupLabel);
                  }
                }}
              />
            </EuiFlexItem>

            <EuiFlexItem>
              <EuiBadge color="danger">
                {i18n.translate('xpack.synthetics.groupGridItem.monitorsBadgeLabel.downCount', {
                  defaultMessage: '{downCount} Down',
                  values: { downCount: downMonitorsCount },
                })}
              </EuiBadge>
            </EuiFlexItem>

            <EuiFlexItem>
              <EuiBadge color="success">
                {i18n.translate('xpack.synthetics.groupGridItem.monitorsBadgeLabel.upCount', {
                  defaultMessage: '{upCount} Up',
                  values: { upCount: groupMonitors.length - downMonitorsCount },
                })}
              </EuiBadge>
            </EuiFlexItem>

            <EuiFlexItem>
              <EuiBadge color="subdued">
                {i18n.translate('xpack.synthetics.groupGridItem.monitorsBadgeLabel.count', {
                  defaultMessage: '{count, number} {count, plural, one {monitor} other {monitors}}',
                  values: { count: groupMonitors.length },
                })}
              </EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
        )
      }
    >
      <EuiSpacer size="m" />
      {view === 'cardView' ? (
        <GroupGridCardContent
          isLoading={isLoading}
          setFlyoutConfigCallback={setFlyoutConfigCallback}
          groupMonitors={groupMonitors}
        />
      ) : null}
      {view === 'compactView' ? (
        <MonitorsTable items={groupMonitors} setFlyoutConfigCallback={setFlyoutConfigCallback} />
      ) : null}
    </EuiAccordion>
  );
};
