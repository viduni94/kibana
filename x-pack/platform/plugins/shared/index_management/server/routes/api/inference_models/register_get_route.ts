/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { InferenceAPIConfigResponse } from '@kbn/ml-trained-models-utils';
import { addBasePath } from '..';
import { RouteDependencies } from '../../../types';

export function registerGetAllRoute({ router, lib: { handleEsError } }: RouteDependencies) {
  // Get all inference models
  router.get(
    {
      path: addBasePath('/inference/all'),
      security: {
        authz: {
          enabled: false,
          reason: 'Relies on es client for authorization',
        },
      },
      validate: {},
    },
    async (context, request, response) => {
      const { client } = (await context.core).elasticsearch;

      // TODO: Use the client's built-in function rather than the transport when it's available
      try {
        const { endpoints } = await client.asCurrentUser.transport.request<{
          endpoints: InferenceAPIConfigResponse[];
        }>({
          method: 'GET',
          path: `/_inference/_all`,
        });

        return response.ok({
          body: endpoints,
        });
      } catch (error) {
        return handleEsError({ error, response });
      }
    }
  );
}
