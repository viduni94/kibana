/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { ToolType, platformCoreTools } from '@kbn/onechat-common';
import { ToolResultType } from '@kbn/onechat-common/tools/tool_result';
import type { BuiltinToolDefinition } from '@kbn/onechat-server';

export const guidedKqlSchema = z.object({
  prompt: z.string().describe('Natural language intent for the query'),
  execute: z.boolean().default(false),
  index: z.string().optional(),
});

export const guidedKqlBuilderTool = (): BuiltinToolDefinition<typeof guidedKqlSchema> => ({
  id: 'solution.observability.guided_kql_builder',
  type: ToolType.builtin,
  description: 'Propose and optionally execute KQL/ES|QL via Onechat ES|QL tools.',
  tags: ['observability', 'query'],
  schema: guidedKqlSchema,
  handler: async ({ prompt, execute, index }, { runner, toolProvider, request }) => {
    // Use generate_esql to synthesize a query
    const gen = await toolProvider.get({ toolId: platformCoreTools.generateEsql, request });
    const genResult = await runner.runTool({
      toolId: gen.id,
      toolParams: { query: prompt, index, context: 'observability' },
      onEvent: () => {},
    });
    const maybeQuery = genResult.results.find((r) => r.type === ToolResultType.query) as
      | { data?: { esql?: string } }
      | undefined;
    if (!execute || !maybeQuery?.data?.esql) {
      return {
        results: [{ type: ToolResultType.query, data: { esql: maybeQuery?.data?.esql ?? '' } }],
      };
    }

    const exe = await toolProvider.get({ toolId: platformCoreTools.executeEsql, request });
    const exeResult = await runner.runTool({
      toolId: exe.id,
      toolParams: { esql: maybeQuery.data.esql as string, index },
      onEvent: () => {},
    });

    return {
      results: exeResult.results,
    };
  },
});
