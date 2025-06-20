/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';

import {
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFilterButton,
  EuiFilterButtonProps,
  EuiFilterGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInputPopover,
} from '@elastic/eui';
import { getFieldTypeName } from '@kbn/field-utils';
import { FormattedMessage } from '@kbn/i18n-react';
import { FieldIcon } from '@kbn/react-field';

export interface Props {
  onFieldTypesChange: (value: string[]) => void;
  buttonProps?: Partial<EuiFilterButtonProps>;
  setFocusToSearch: () => void;
  availableFieldTypes: string[];
  fieldTypesValue: string[];
}

export function FieldTypeFilter({
  availableFieldTypes,
  onFieldTypesChange,
  setFocusToSearch,
  fieldTypesValue,
  buttonProps,
}: Props) {
  const [isPopoverOpen, setPopoverOpen] = useState(false);

  const handleFilterButtonClicked = () => {
    setPopoverOpen(!isPopoverOpen);
  };

  const buttonContent = (
    <EuiFilterButton
      {...buttonProps}
      data-test-subj="toggleFieldFilterButton"
      iconType="arrowDown"
      isSelected={isPopoverOpen}
      numFilters={0}
      hasActiveFilters={fieldTypesValue.length > 0}
      numActiveFilters={fieldTypesValue.length}
      onClick={handleFilterButtonClicked}
    >
      <FormattedMessage
        id="presentationUtil.fieldSearch.fieldFilterButtonLabel"
        defaultMessage="Filter by type"
      />
    </EuiFilterButton>
  );

  return (
    <EuiFilterGroup compressed fullWidth>
      <EuiInputPopover
        panelPaddingSize="none"
        display="block"
        isOpen={isPopoverOpen}
        closePopover={() => {
          setPopoverOpen(false);
        }}
        fullWidth
        input={buttonContent}
        focusTrapProps={{
          returnFocus: false, // we will be manually returning the focus to the search
          onDeactivation: setFocusToSearch,
        }}
      >
        <EuiContextMenuPanel
          items={(availableFieldTypes as string[]).map((type) => (
            <EuiContextMenuItem
              key={type}
              icon={fieldTypesValue.includes(type) ? 'check' : 'empty'}
              data-test-subj={`typeFilter-${type}`}
              onClick={() => {
                if (fieldTypesValue.includes(type)) {
                  onFieldTypesChange(fieldTypesValue.filter((f) => f !== type));
                } else {
                  onFieldTypesChange([...fieldTypesValue, type]);
                }
              }}
            >
              <EuiFlexGroup gutterSize="xs" responsive={false}>
                <EuiFlexItem grow={false}>
                  <FieldIcon type={type} label={type} />
                </EuiFlexItem>
                <EuiFlexItem>{getFieldTypeName(type)}</EuiFlexItem>
              </EuiFlexGroup>
            </EuiContextMenuItem>
          ))}
        />
      </EuiInputPopover>
    </EuiFilterGroup>
  );
}
