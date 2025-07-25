/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { FunctionComponent } from 'react';
import {
  EuiCodeBlock,
  EuiTabbedContent,
  EuiTitle,
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { Links } from '../../links';

interface Props {
  onClose: any;
  requestBody: string;
  links: Links;
  response?: string;
}

export const RequestFlyout: FunctionComponent<Props> = ({
  onClose,
  requestBody,
  response,
  links,
}) => {
  const flyoutTitleId = useGeneratedHtmlId();

  return (
    <EuiFlyout onClose={onClose} maxWidth={640} aria-labelledby={flyoutTitleId}>
      <EuiFlyoutHeader>
        <EuiFlexGroup gutterSize="xs" alignItems="flexEnd">
          <EuiFlexItem>
            {/* We need an extra div to get out of flex grow */}
            <div>
              <EuiTitle size="m" data-test-subj="painlessLabRequestFlyoutHeader">
                <h2 id={flyoutTitleId}>
                  {i18n.translate('xpack.painlessLab.flyoutTitle', {
                    defaultMessage: 'API request',
                  })}
                </h2>
              </EuiTitle>
            </div>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              flush="right"
              href={links.painlessExecuteAPI}
              target="_blank"
              iconType="question"
            >
              {i18n.translate('xpack.painlessLab.flyoutDocLink', {
                defaultMessage: 'API documentation',
              })}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutHeader>

      <EuiFlyoutBody>
        <EuiTabbedContent
          size="s"
          tabs={[
            {
              id: 'request',
              name: 'Request',
              content: (
                <EuiCodeBlock
                  language="json"
                  paddingSize="s"
                  data-test-subj="painlessLabFlyoutRequest"
                  isCopyable
                >
                  {'POST _scripts/painless/_execute\n'}
                  {requestBody}
                </EuiCodeBlock>
              ),
            },
            {
              id: 'response',
              name: 'Response',
              content: (
                <EuiCodeBlock
                  language="json"
                  paddingSize="s"
                  data-test-subj="painlessLabFlyoutResponse"
                  isCopyable
                >
                  {response}
                </EuiCodeBlock>
              ),
            },
          ]}
        />
      </EuiFlyoutBody>
    </EuiFlyout>
  );
};
