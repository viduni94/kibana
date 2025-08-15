/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defer, identity } from 'rxjs';
import { eventSourceStreamIntoObservable } from '../../../util/event_source_stream_into_observable';
import type { InferenceConnectorAdapter } from '../../types';
import {
  parseInlineFunctionCalls,
  wrapWithSimulatedFunctionCalling,
} from '../../simulated_function_calling';
import { isNativeFunctionCallingSupported, handleConnectorResponse } from '../../utils';
import type { OpenAIRequest } from './types';
import { OpenAiProviderType } from './types';
import { messagesToOpenAI, toolsToOpenAI, toolChoiceToOpenAI } from './to_openai';
import { processOpenAIStream } from './process_openai_stream';
import { emitTokenCountEstimateIfMissing } from './emit_token_count_if_missing';
import { getTemperatureIfValid } from '../../utils/get_temperature';

export const openAIAdapter: InferenceConnectorAdapter = {
  chatComplete: ({
    executor,
    system,
    messages,
    toolChoice,
    tools,
    temperature = 0,
    functionCalling = 'auto',
    modelName: modelName,
    logger,
    abortSignal,
    metadata,
  }) => {
    const connector = executor.getConnector();
    // const useSimulatedFunctionCalling =
    //   functionCalling === 'auto'
    //     ? !isNativeFunctionCallingSupported(executor.getConnector())
    //     : functionCalling === 'simulated';

    const useSimulatedFunctionCalling = false; // TODO: remove temporary hardcoded value

    let request: OpenAIRequest;

    if (useSimulatedFunctionCalling) {
      const wrapped = wrapWithSimulatedFunctionCalling({
        system,
        messages,
        toolChoice,
        tools,
      });
      request = {
        stream: true,
        ...getTemperatureIfValid(temperature, { connector, modelName }),
        model: modelName,
        messages: messagesToOpenAI({ system: wrapped.system, messages: wrapped.messages }),
      };
    } else {
      // Map named tool_choice to a string 'required' for "Other" providers that
      // only accept string tool_choice values, but only when there is exactly one tool
      // and the requested function matches it (preserves intent and compatibility
      // with providers like LM Studio).
      const apiProvider = (connector.config?.apiProvider as OpenAiProviderType) ?? undefined;
      const isOtherProvider = apiProvider === OpenAiProviderType.Other;
      const useNativeToolCalling = true;
      const toolNames = tools ? Object.keys(tools) : [];
      const isSingleTool = toolNames.length === 1;
      const isNamedChoice = typeof toolChoice !== 'string' && !!toolChoice;
      const namedChoiceMatchesSingleTool =
        isNamedChoice && isSingleTool && toolNames[0] === (toolChoice as any).function;

      request = {
        stream: true,
        ...getTemperatureIfValid(temperature, { connector, modelName }),
        model: modelName,
        messages: messagesToOpenAI({ system, messages }),
        tool_choice:
          useNativeToolCalling && isOtherProvider && namedChoiceMatchesSingleTool
            ? 'required'
            : toolChoiceToOpenAI(toolChoice),
        tools: toolsToOpenAI(tools),
      };
    }

    return defer(() => {
      return executor.invoke({
        subAction: 'stream',
        subActionParams: {
          body: JSON.stringify(request),
          signal: abortSignal,
          stream: true,
          ...(metadata?.connectorTelemetry
            ? { telemetryMetadata: metadata.connectorTelemetry }
            : {}),
        },
      });
    }).pipe(
      handleConnectorResponse({ processStream: eventSourceStreamIntoObservable }),
      processOpenAIStream(),
      emitTokenCountEstimateIfMissing({ request }),
      useSimulatedFunctionCalling ? parseInlineFunctionCalls({ logger }) : identity
    );
  },
};
