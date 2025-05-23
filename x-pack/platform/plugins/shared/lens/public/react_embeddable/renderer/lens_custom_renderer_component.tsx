/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import { useSearchApi } from '@kbn/presentation-publishing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BehaviorSubject } from 'rxjs';
import type { PresentationPanelProps } from '@kbn/presentation-panel-plugin/public';
import type { LensApi, LensRendererProps, LensSerializedState } from '../types';
import { LENS_EMBEDDABLE_TYPE } from '../../../common/constants';
import { createEmptyLensState } from '../helper';

// This little utility uses the same pattern of the useSearchApi hook:
// create the Subject once and then update its value on change
function useObservableVariable<T extends unknown>(value: T) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const observable = useMemo(() => new BehaviorSubject<T>(value), []);

  // update the observable on change
  useEffect(() => {
    observable.next(value);
  }, [observable, value]);

  return observable;
}

type PanelProps = Pick<
  PresentationPanelProps<LensApi>,
  | 'showShadow'
  | 'showBorder'
  | 'showBadges'
  | 'showNotifications'
  | 'hideLoader'
  | 'hideHeader'
  | 'hideInspector'
  | 'getActions'
>;

/**
 * The aim of this component is to provide a wrapper for other plugins who want to
 * use a Lens component into their own page. This hides the embeddable parts of it
 * by wrapping it into a ReactEmbeddableRenderer component and exposing a custom API
 */
export function LensRenderer({
  title,
  withDefaultActions,
  extraActions,
  showInspector,
  syncColors,
  syncCursor,
  syncTooltips,
  viewMode,
  id,
  query,
  filters,
  timeRange,
  disabledActions,
  searchSessionId,
  forceDSL,
  hidePanelTitles,
  lastReloadRequestTime,
  ...props
}: LensRendererProps) {
  // Use the settings interface to store panel settings
  const settings = useMemo(() => {
    return {
      syncColors$: new BehaviorSubject(false),
      syncCursor$: new BehaviorSubject(false),
      syncTooltips$: new BehaviorSubject(false),
    };
  }, []);
  const disabledActionIds$ = useObservableVariable(disabledActions);
  const viewMode$ = useObservableVariable(viewMode);
  const searchSessionId$ = useObservableVariable(searchSessionId);
  const hideTitle$ = useObservableVariable(hidePanelTitles);

  // Lens API will be set once, but when set trigger a reflow to adopt the latest attributes
  const [lensApi, setLensApi] = useState<LensApi | undefined>(undefined);
  const initialStateRef = useRef<LensSerializedState>(
    props.attributes ? { attributes: props.attributes } : createEmptyLensState(null, title)
  );

  const searchApi = useSearchApi({ query, filters, timeRange });

  const showPanelChrome = Boolean(withDefaultActions) || (extraActions?.length || 0) > 0;

  const reload$ = useMemo(() => new BehaviorSubject<void>(undefined), []);
  useEffect(() => {
    reload$.next();
  }, [reload$, lastReloadRequestTime]);

  // Re-render on changes
  // internally the embeddable will evaluate whether it is worth to actual render or not
  useEffect(() => {
    // trigger a re-render if the attributes change
    if (lensApi) {
      lensApi.updateAttributes({
        ...('attributes' in initialStateRef.current
          ? initialStateRef.current.attributes
          : initialStateRef.current),
        ...props.attributes,
      });
      lensApi.updateOverrides(props.overrides);
    }
  }, [lensApi, props.attributes, props.overrides]);

  useEffect(() => {
    if (syncColors != null && settings.syncColors$.getValue() !== syncColors) {
      settings.syncColors$.next(syncColors);
    }
    if (syncCursor != null && settings.syncCursor$.getValue() !== syncCursor) {
      settings.syncCursor$.next(syncCursor);
    }
    if (syncTooltips != null && settings.syncTooltips$.getValue() !== syncTooltips) {
      settings.syncTooltips$.next(syncTooltips);
    }
  }, [settings, syncColors, syncCursor, syncTooltips]);

  const panelProps: PanelProps = useMemo(() => {
    return {
      hideInspector: !showInspector,
      showNotifications: false,
      showShadow: false,
      showBadges: false,
      getActions: async (triggerId, context) => {
        const actions = withDefaultActions
          ? await lensApi?.getTriggerCompatibleActions(triggerId, context)
          : [];

        return (extraActions ?? []).concat(actions || []);
      },
    };
  }, [showInspector, withDefaultActions, extraActions, lensApi]);

  return (
    <EmbeddableRenderer<LensSerializedState, LensApi>
      type={LENS_EMBEDDABLE_TYPE}
      maybeId={id}
      getParentApi={() => ({
        // forward the Lens components to the embeddable
        ...props,
        // forward the unified search context
        ...searchApi,
        searchSessionId$,
        disabledActionIds$,
        setDisabledActionIds: (ids: string[] | undefined) => disabledActionIds$.next(ids),
        viewMode$,
        // pass the sync* settings with the unified settings interface
        settings,
        // make sure to provide the initial state (useful for the comparison check)
        getSerializedStateForChild: () => ({ rawState: initialStateRef.current, references: [] }),
        // update the runtime state on changes
        getRuntimeStateForChild: () => ({
          ...initialStateRef.current,
          attributes: props.attributes,
        }),
        forceDSL,
        hideTitle$,
        reload$, // trigger a reload (replacement for deprepcated searchSessionId)
      })}
      onApiAvailable={setLensApi}
      hidePanelChrome={!showPanelChrome}
      panelProps={panelProps}
    />
  );
}

export type EmbeddableComponent = React.ComponentType<LensRendererProps>;
