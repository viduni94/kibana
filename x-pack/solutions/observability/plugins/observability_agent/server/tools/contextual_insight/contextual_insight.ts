/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { MessageRole } from '@kbn/inference-common';
import { ToolType } from '@kbn/onechat-common';
import { ToolResultType } from '@kbn/onechat-common/tools/tool_result';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/onechat-server';
import type { CoreSetup, Logger } from '@kbn/core/server';
import type {
  ObservabilityAgentPluginStart,
  ObservabilityAgentPluginStartDependencies,
} from '../../types';
import { OBSERVABILITY_CONTEXTUAL_INSIGHT_TOOL_ID } from '../../../common/constants';

const contextualInsightSchema = z.object({
  instructions: z
    .string()
    .min(1)
    .describe(
      'Natural language instructions and contextual information describing the error and desired summary.'
    ),
});

export const createContextualInsightTool = ({
  core,
  logger,
}: {
  core: CoreSetup<ObservabilityAgentPluginStartDependencies, ObservabilityAgentPluginStart>;
  logger: Logger;
}): StaticToolRegistration<typeof contextualInsightSchema> => {
  const toolDefinition: BuiltinToolDefinition<typeof contextualInsightSchema> = {
    id: OBSERVABILITY_CONTEXTUAL_INSIGHT_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Generate a concise summary explaining an Observability error, based on provided context. Uses the default inference connector and does not invoke any agents.',
    schema: contextualInsightSchema,
    tags: ['observability', 'summary', 'contextual_insight'],
    handler: async ({ instructions }, handlerInfo) => {
      try {
        const { inferenceClient } = await handlerInfo.modelProvider.getDefaultModel();

        const response = await inferenceClient.chatComplete({
          messages: [
            {
              role: MessageRole.User,
              content: instructions,
            },
          ],
          functionCalling: 'auto',
        });

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                content: response.content,
              },
            },
          ],
        };
      } catch (error) {
        logger.error(`Error generating contextual insight: ${error.message}`);
        logger.debug(error);
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to generate contextual insight: ${error.message}`,
                stack: error.stack,
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
};
