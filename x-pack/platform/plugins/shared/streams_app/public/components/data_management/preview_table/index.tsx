/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiDataGrid,
  EuiDataGridControlColumn,
  EuiDataGridProps,
  EuiDataGridRowHeightsOptions,
  EuiDataGridSorting,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { SampleDocument } from '@kbn/streams-schema';
import React, { useMemo, useState, useCallback } from 'react';
import { css } from '@emotion/css';
import { recalcColumnWidths } from '../stream_detail_enrichment/utils';
import { SimulationContext } from '../stream_detail_enrichment/state_management/simulation_state_machine';

export function PreviewTable({
  documents,
  displayColumns,
  height,
  renderCellValue,
  rowHeightsOptions,
  sorting,
  setSorting,
  toolbarVisibility = false,
  setVisibleColumns,
  columnOrderHint = [],
  selectedRowIndex,
  leadingControlColumns,
}: {
  documents: SampleDocument[];
  displayColumns?: string[];
  height?: EuiDataGridProps['height'];
  renderCellValue?: (doc: SampleDocument, columnId: string) => React.ReactNode | undefined;
  rowHeightsOptions?: EuiDataGridRowHeightsOptions;
  toolbarVisibility?: boolean;
  setVisibleColumns?: (visibleColumns: string[]) => void;
  columnOrderHint?: string[];
  sorting?: SimulationContext['previewColumnsSorting'];
  setSorting?: (sorting: SimulationContext['previewColumnsSorting']) => void;
  selectedRowIndex?: number;
  leadingControlColumns?: EuiDataGridControlColumn[];
}) {
  const { euiTheme: theme } = useEuiTheme();
  // Determine canonical column order
  const canonicalColumnOrder = useMemo(() => {
    const cols = new Set<string>();
    documents.forEach((doc) => {
      if (!doc || typeof doc !== 'object') {
        return;
      }
      Object.keys(doc).forEach((key) => {
        cols.add(key);
      });
    });
    let allColumns = Array.from(cols);

    // Sort columns by displayColumns or alphabetically as baseline
    allColumns = allColumns.sort((a, b) => {
      const indexA = (displayColumns || []).indexOf(a);
      const indexB = (displayColumns || []).indexOf(b);
      if (indexA === -1 && indexB === -1) {
        return a.localeCompare(b);
      }
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // Sort columns based on the columnOrderHint if provided
    if (columnOrderHint.length > 0) {
      const orderedCols = columnOrderHint.filter((col) => allColumns.includes(col));
      const unorderedCols = allColumns.filter((col) => !orderedCols.includes(col));
      allColumns = [...orderedCols, ...unorderedCols];
    }
    // Always show the displayColumns first, but preserve the order from allColumns
    if (displayColumns) {
      const displaySet = new Set(displayColumns);
      allColumns = [
        ...allColumns.filter((col) => displaySet.has(col)),
        ...allColumns.filter((col) => !displaySet.has(col)),
      ];
    }
    return allColumns;
  }, [columnOrderHint, displayColumns, documents]);

  const sortingConfig = useMemo(() => {
    if (!sorting && !setSorting) {
      return undefined;
    }
    return {
      columns: sorting?.fieldName
        ? [
            {
              id: sorting?.fieldName || '',
              direction: sorting?.direction || 'asc',
            },
          ]
        : [],
      onSort: (newSorting) => {
        if (setSorting) {
          const mostRecentSorting = newSorting[newSorting.length - 1];
          setSorting({
            fieldName: mostRecentSorting?.id,
            direction: mostRecentSorting?.direction || 'asc',
          });
        }
      },
    } as EuiDataGridSorting;
  }, [setSorting, sorting]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number | undefined>>({});

  // Derive visibleColumns from canonical order
  const visibleColumns = useMemo(() => {
    if (displayColumns) {
      return canonicalColumnOrder.filter((col) => displayColumns.includes(col));
    }
    return canonicalColumnOrder;
  }, [canonicalColumnOrder, displayColumns]);

  const onColumnResize = useCallback(
    ({ columnId, width }: { columnId: string; width: number | undefined }) => {
      setColumnWidths((prev) => {
        const updated = recalcColumnWidths({
          columnId,
          width,
          prevWidths: prev,
          visibleColumns,
        });
        return updated;
      });
    },
    [visibleColumns]
  );

  const gridColumns = useMemo(() => {
    return canonicalColumnOrder.map((column) => ({
      id: column,
      displayAsText: column,
      actions:
        Boolean(setVisibleColumns) || Boolean(setSorting)
          ? {
              showHide: Boolean(setVisibleColumns),
              showMoveLeft: Boolean(setVisibleColumns),
              showMoveRight: Boolean(setVisibleColumns),
              showSortAsc: Boolean(setSorting),
              showSortDesc: Boolean(setSorting),
            }
          : (false as false),
      initialWidth: columnWidths[column],
    }));
  }, [canonicalColumnOrder, setSorting, setVisibleColumns, columnWidths]);

  return (
    <EuiDataGrid
      aria-label={i18n.translate('xpack.streams.resultPanel.euiDataGrid.previewLabel', {
        defaultMessage: 'Preview',
      })}
      leadingControlColumns={visibleColumns.length > 0 ? leadingControlColumns : undefined}
      columns={gridColumns}
      columnVisibility={{
        visibleColumns,
        setVisibleColumns: setVisibleColumns || (() => {}),
        canDragAndDropColumns: false,
      }}
      gridStyle={
        selectedRowIndex !== undefined
          ? {
              rowClasses: {
                [String(selectedRowIndex)]: css`
                  background-color: ${theme.colors.highlight};
                `,
              },
            }
          : undefined
      }
      sorting={sortingConfig}
      inMemory={sortingConfig ? { level: 'sorting' } : undefined}
      height={height}
      toolbarVisibility={toolbarVisibility}
      rowCount={documents.length}
      rowHeightsOptions={rowHeightsOptions}
      onColumnResize={onColumnResize}
      renderCellValue={({ rowIndex, columnId }) => {
        const doc = documents[rowIndex];
        if (!doc || typeof doc !== 'object') {
          return '';
        }

        if (renderCellValue) {
          const renderedValue = renderCellValue(doc, columnId);
          if (renderedValue !== undefined) {
            return renderedValue;
          }
        }

        const value = doc[columnId];
        if (value === undefined || value === null) {
          return '';
        }
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      }}
    />
  );
}
