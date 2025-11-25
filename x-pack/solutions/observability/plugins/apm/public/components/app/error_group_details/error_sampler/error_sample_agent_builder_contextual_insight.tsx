/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useMemo, useState, useCallback } from 'react';
import {
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiSkeletonText,
  EuiButtonEmpty,
  EuiMarkdownFormat,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { AT_TIMESTAMP } from '@kbn/apm-types';
import { OBSERVABILITY_CONTEXTUAL_INSIGHT_TOOL_ID } from '../../../../../common/observability_agent/agent_tool_ids';
import type { APMError } from '../../../../../typings/es_schemas/ui/apm_error';
import { useApmPluginContext } from '../../../../context/apm_plugin/use_apm_plugin_context';
import { useKibana } from '../../../../context/kibana_context/use_kibana';
import { ErrorSampleDetailTabContent } from './error_sample_detail';
import { exceptionStacktraceTab, logStacktraceTab } from './error_tabs';
import { useLocalStorage } from '../../../../utils/use_local_storage';

export function ErrorSampleAgentBuilderContextualInsight({
  error,
  transaction,
}: {
  error: {
    [AT_TIMESTAMP]: string;
    error: Pick<APMError['error'], 'log' | 'exception' | 'id'>;
    service: {
      name: string;
      environment?: string;
      language?: {
        name?: string;
      };
      runtime?: {
        name?: string;
        version?: string;
      };
    };
  };
  transaction?: {
    transaction: {
      name: string;
    };
  };
}) {
  const { core, onechat } = useApmPluginContext();

  const [logStacktrace, setLogStacktrace] = useState('');
  const [exceptionStacktrace, setExceptionStacktrace] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [lastUsedConnectorId] = useLocalStorage('agentBuilder.lastUsedConnector', '');

  const instructions = useMemo(() => {
    const serviceName = error.service.name;
    const languageName = error.service.language?.name ?? '';
    const runtimeName = error.service.runtime?.name ?? '';
    const runtimeVersion = error.service.runtime?.version ?? '';
    const transactionName = transaction?.transaction.name ?? '';

    return `I'm an SRE. I am looking at an exception and trying to understand what it means.

Your task is to describe what the error means and what it could be caused by.

The error occurred on a service called ${serviceName}, which is a ${runtimeName} service written in ${languageName}. The
runtime version is ${runtimeVersion}.

The request it occurred for is called ${transactionName}.

${logStacktrace ? `The log stacktrace:\n${logStacktrace}` : ''}

${exceptionStacktrace ? `The exception stacktrace:\n${exceptionStacktrace}` : ''}`;
  }, [error, transaction, logStacktrace, exceptionStacktrace]);

  const fetchSummary = useCallback(async () => {
    let aborted = false;
    try {
      setLoading(true);
      setErrorMessage(null);
      setSummary(null);
      const res = await core.http.post<{ results: Array<{ type: string; data: any }> }>(
        '/api/agent_builder/tools/_execute',
        {
          body: JSON.stringify({
            tool_id: OBSERVABILITY_CONTEXTUAL_INSIGHT_TOOL_ID,
            tool_params: {
              instructions,
            },
            connector_id: lastUsedConnectorId,
          }),
        }
      );

      console.log('res', res);

      if (aborted) return;

      const content =
        res.results.find((r) => r.type !== 'error')?.data?.content ??
        res.results[0]?.data?.content ??
        null;

      setSummary(content);
    } catch (e) {
      if (aborted) return;
      setErrorMessage(e?.body?.message || e.message || 'Unknown error');
    } finally {
      if (!aborted) {
        setLoading(false);
      }
    }
    return () => {
      aborted = true;
    };
  }, [core.http, instructions, lastUsedConnectorId]);

  return (
    <>
      <EuiFlexItem>
        <EuiPanel hasBorder={true}>
          <EuiTitle size="xs">
            <h4>
              <EuiButtonEmpty
                size="s"
                iconType={isOpen ? 'arrowDown' : 'arrowRight'}
                onClick={async () => {
                  const nextOpen = !isOpen;
                  setIsOpen(nextOpen);
                  if (nextOpen && !summary && !loading) {
                    await fetchSummary();
                  }
                }}
                data-test-subj="apmAgentBuilderContextualInsightToggle"
              >
                {i18n.translate('xpack.apm.errorGroupContextualInsightOnechat.explainErrorTitle', {
                  defaultMessage: "What's this error?",
                })}
              </EuiButtonEmpty>
            </h4>
          </EuiTitle>
          {isOpen ? (
            <>
              <EuiSpacer size="s" />
              {loading ? (
                <EuiSkeletonText lines={3} />
              ) : errorMessage ? (
                <EuiSkeletonText lines={1} />
              ) : summary ? (
                <EuiMarkdownFormat textSize="s">{summary}</EuiMarkdownFormat>
              ) : null}
              <EuiSpacer size="s" />
              <EuiButtonEmpty
                size="s"
                iconType="comment"
                data-test-subj="apmAgentBuilderContextualInsightStartConversation"
                onClick={() => {
                  onechat?.openConversationFlyout({
                    newConversation: true,
                    sessionTag: 'apm-error-detail',
                    initialMessage: i18n.translate(
                      'xpack.apm.errorGroupContextualInsightOnechat.initialMessage',
                      {
                        defaultMessage:
                          "I'm looking at an exception and trying to understand what it means",
                      }
                    ),
                    attachments: [
                      {
                        id: 'apm.error.context',
                        type: 'text',
                        getContent: async () => ({ content: instructions }),
                      },
                    ],
                  });
                }}
              >
                {i18n.translate('xpack.apm.errorGroupContextualInsightOnechat.startConversation', {
                  defaultMessage: 'Start conversation',
                })}
              </EuiButtonEmpty>
            </>
          ) : null}
        </EuiPanel>
      </EuiFlexItem>
      <EuiSpacer size="s" />
      <div
        ref={(next) => {
          setLogStacktrace(next?.innerText ?? '');
        }}
        style={{ display: 'none' }}
      >
        {error.error.log?.message && (
          <ErrorSampleDetailTabContent error={error} currentTab={logStacktraceTab} />
        )}
      </div>
      <div
        ref={(next) => {
          setExceptionStacktrace(next?.innerText ?? '');
        }}
        style={{ display: 'none' }}
      >
        {error.error.exception?.length && (
          <ErrorSampleDetailTabContent error={error} currentTab={exceptionStacktraceTab} />
        )}
      </div>
    </>
  );
}
