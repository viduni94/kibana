/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RoleCredentials } from '@kbn/ftr-common-functional-services';
import { MonitorFields } from '@kbn/synthetics-plugin/common/runtime_types';
import { SYNTHETICS_API_URLS } from '@kbn/synthetics-plugin/common/constants';
import expect from '@kbn/expect';
import { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import { getFixtureJson } from './helpers/get_fixture_json';
import { SyntheticsMonitorTestService } from '../../services/synthetics_monitor';

export const LOCAL_LOCATION = {
  id: 'dev',
  label: 'Dev Service',
  geo: {
    lat: 0,
    lon: 0,
  },
  isServiceManaged: true,
};

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  describe('RunTestManually', function () {
    this.tags(['skipMKI', 'skipCloud']);

    const supertest = getService('supertestWithoutAuth');
    const kibanaServer = getService('kibanaServer');
    const samlAuth = getService('samlAuth');

    const monitorTestService = new SyntheticsMonitorTestService(getService);

    let newMonitor: MonitorFields;
    let editorUser: RoleCredentials;

    before(async () => {
      await kibanaServer.savedObjects.cleanStandardList();
      editorUser = await samlAuth.createM2mApiKeyWithRoleScope('editor');
      await supertest
        .put(SYNTHETICS_API_URLS.SYNTHETICS_ENABLEMENT)
        .set(editorUser.apiKeyHeader)
        .set(samlAuth.getInternalRequestHeader())
        .expect(200);
      newMonitor = getFixtureJson('http_monitor');
    });

    it('runs test manually', async () => {
      const resp = await monitorTestService.addMonitor(newMonitor, editorUser);

      const res = await supertest
        .post(SYNTHETICS_API_URLS.TEST_NOW_MONITOR + `/${resp.id}`)
        .set(editorUser.apiKeyHeader)
        .set(samlAuth.getInternalRequestHeader())
        .expect(200);

      const result = res.body;
      expect(typeof result.testRunId).to.eql('string');
    });

    it('works in non default space', async () => {
      const { SPACE_ID } = await monitorTestService.addNewSpace();

      const resp = await supertest
        .post(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.SYNTHETICS_MONITORS}`)
        .set(editorUser.apiKeyHeader)
        .set(samlAuth.getInternalRequestHeader())
        .send({ ...newMonitor, spaces: [] });

      expect(resp.status).to.eql(200, JSON.stringify(resp.body));

      const res = await supertest
        .post(`/s/${SPACE_ID}${SYNTHETICS_API_URLS.TEST_NOW_MONITOR}/${resp.body.id}`)
        .set(editorUser.apiKeyHeader)
        .set(samlAuth.getInternalRequestHeader())
        .expect(200);

      const result = res.body;
      expect(typeof result.testRunId).to.eql('string');
    });
  });
}
