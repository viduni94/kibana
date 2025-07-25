/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { APP_ID as SECURITY_SOLUTION_APP_ID } from '@kbn/security-solution-plugin/common/constants';
import { deleteAllCaseItems } from '@kbn/test-suites-xpack-platform/cases_api_integration/common/lib/api';
import { suggestUserProfiles } from '@kbn/test-suites-xpack-platform/cases_api_integration/common/lib/api/user_profiles';
import {
  secAllCasesNoneUser,
  secAllCasesReadUser,
  secAllUser,
} from '@kbn/test-suites-xpack-platform/api_integration/apis/cases/common/users';
import type { FtrProviderContext } from '../../ftr_provider_context';

export default ({ getService }: FtrProviderContext): void => {
  describe('suggest_user_profiles', () => {
    const es = getService('es');
    const supertestWithoutAuth = getService('supertestWithoutAuth');

    afterEach(async () => {
      await deleteAllCaseItems(es);
    });

    for (const { user, searchTerm, owner } of [
      { user: secAllUser, searchTerm: secAllUser.username, owner: SECURITY_SOLUTION_APP_ID },
      {
        user: secAllCasesReadUser,
        searchTerm: secAllUser.username,
        owner: SECURITY_SOLUTION_APP_ID,
      },
    ]) {
      it(`User ${
        user.username
      } with roles(s) ${user.roles.join()} can retrieve user profile suggestions`, async () => {
        const profiles = await suggestUserProfiles({
          supertest: supertestWithoutAuth,
          req: { name: searchTerm, owners: [owner], size: 1 },
          auth: { user, space: null },
        });

        expect(profiles.length).to.be(1);
        expect(profiles[0].user.username).to.eql(searchTerm);
      });
    }

    for (const { user, owner } of [
      { user: secAllCasesNoneUser, owner: SECURITY_SOLUTION_APP_ID },
    ]) {
      it(`User ${
        user.username
      } with role(s) ${user.roles.join()} cannot retrieve user profile suggestions because they lack privileges`, async () => {
        await suggestUserProfiles({
          supertest: supertestWithoutAuth,
          req: { name: user.username, owners: [owner] },
          auth: { user, space: null },
          expectedHttpCode: 403,
        });
      });
    }
  });
};
