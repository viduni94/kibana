/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { run } from '@kbn/dev-cli-runner';
import type { ToolingLog } from '@kbn/tooling-log';
import { Client } from '@elastic/elasticsearch';
import moment from 'moment';
import { GCS_BUCKET, BASELINE_WAIT_MS, FAILURE_WAIT_MS, SCENARIOS } from './lib/constants';
import { getConnectionConfig, type ConnectionConfig } from './lib/get_connection_config';
import { createSnapshot, generateGcsBasePath, registerGcsRepository } from './lib/gcs';
import { sleep } from './lib/sleep';
import {
  cleanupSigEventsExtractedFeaturesData,
  configureSigEventsConnector,
  enableSignificantEvents,
  enableStreams,
  logSigEventsExtractedFeatures,
  persistSigEventsExtractedFeaturesForSnapshot,
  triggerSigEventsFeatureExtraction,
  waitForSigEventsFeatureExtraction,
} from './lib/significant_events_workflow';
import {
  ensureMinikube,
  deployOtelDemo,
  patchScenario,
  teardownOtelDemo,
  waitForPodsReady,
} from './lib/otel_demo';

run(
  async ({ log, flags, addCleanupTask }) => {
    const config = await getConnectionConfig(flags, log);
    const esClient = new Client({
      node: config.esUrl,
      auth: { username: config.username, password: config.password },
    });

    const connectorId = String(flags['connector-id'] || '');
    const runId = String(flags['run-id'] || moment().format('YYYY-MM-DD'));

    const scenariosToRun = flags.scenario
      ? (Array.isArray(flags.scenario) ? flags.scenario : [flags.scenario]).map(String)
      : [];

    const dryRun = Boolean(flags['dry-run']);

    if (!connectorId) {
      throw new Error(
        'Required: --connector-id <id>\n' +
          'Provide the ID of an LLM connector for feature extraction ' +
          '(e.g.: "bedrock-opus-46").\n' +
          'This connector must be preconfigured in your kibana.dev.yml.'
      );
    }

    const controller = new AbortController();
    addCleanupTask(() => controller.abort());

    const selectedScenarios =
      scenariosToRun.length > 0
        ? SCENARIOS.filter((s) => scenariosToRun.includes(s.id))
        : [...SCENARIOS];

    if (selectedScenarios.length === 0) {
      throw new Error(`No matching scenarios. Available: ${SCENARIOS.map((s) => s.id).join(', ')}`);
    }

    const basePath = generateGcsBasePath({ runId });
    log.info(`Creating ${selectedScenarios.length} snapshot(s) → GCS ${GCS_BUCKET}/${basePath}`);
    log.info(`Run ID: ${runId}`);
    log.info(`LLM connector: ${connectorId}`);
    log.info(`Elasticsearch: ${config.esUrl} | Kibana: ${config.kibanaUrl}`);

    if (dryRun) {
      log.info('');
      log.info('DRY RUN - would process these scenarios:');
      for (const s of selectedScenarios) {
        log.info(`  - gs://${GCS_BUCKET}/${basePath}/ → ${s.id}`);
      }
      return;
    }

    log.info('');
    log.info('Checking minikube...');
    await ensureMinikube(log);

    log.info('');
    log.info('Registering GCS snapshot repository...');
    await registerGcsRepository(esClient, log, runId);

    for (const scenario of selectedScenarios) {
      await processScenario(scenario, config, connectorId, runId, esClient, log);
    }

    log.info('');
    log.info('='.repeat(70));
    log.info('ALL SNAPSHOTS CREATED SUCCESSFULLY');
    log.info('='.repeat(70));
    log.info('');
    log.info(`Run ID: ${runId}`);
    log.info(`GCS path: gs://${GCS_BUCKET}/${basePath}/`);
    log.info('');
    log.info('Snapshots:');
    for (const s of selectedScenarios) {
      log.info(`  ${s.id}`);
    }
    log.info('');
    log.info('Each snapshot contains:');
    log.info('  logs*                        - OTel Demo log data');
    log.info('  sigevents-streams-features-* - Extracted features (inferred + computed)');
    log.info('');
    log.info(`To use in evals, update SIGEVENTS_SNAPSHOT_RUN in replay.ts to "${runId}"`);
  },
  {
    description: `
      Automates creation of OTel Demo snapshots for Significant Events evaluations.

      For each scenario the script:
        1. Deploys the OTel Demo on minikube
        2. Waits for pods and baseline traffic (~5 min)
        3. Optionally patches a failure scenario and waits (~10 min)
        4. Enables streams and triggers LLM feature extraction
        5. Snapshots logs + extracted features to GCS
        6. Cleans up and tears down the demo

      Prerequisites:
        - minikube running  (minikube start --cpus=4 --memory=8g)
        - Local Elasticsearch with GCS credentials in keystore:
            yarn es snapshot --license trial \\
              --secure-files gcs.client.default.credentials_file=/path/to/creds.json
        - Local Kibana running with a preconfigured LLM connector

      Example:
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --scenario healthy-baseline
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --run-id 2026-02-19
        node scripts/capture_sigevents_otel_demo_snapshots.js --connector-id bedrock-opus-46 --dry-run
    `,
    flags: {
      string: [
        'es-url',
        'kibana-url',
        'es-username',
        'es-password',
        'connector-id',
        'scenario',
        'run-id',
      ],
      boolean: ['dry-run'],
      help: `
        --connector-id     (required) LLM connector ID for feature extraction (e.g.: bedrock-opus-46)
        --run-id           Run identifier used as GCS subfolder (default: today's date in format YYYY-MM-DD)
        --scenario         Process only specific scenario(s) - can be repeated. Omit for all 7.
        --dry-run          Print what would happen without executing
        --es-url           Elasticsearch URL (default: from kibana.dev.yml)
        --kibana-url       Kibana URL (default: from kibana.dev.yml, with basePath)
        --es-username      ES username (default: from kibana.dev.yml)
        --es-password      ES password (default: from kibana.dev.yml)
      `,
    },
  }
);

async function processScenario(
  scenario: (typeof SCENARIOS)[number],
  config: ConnectionConfig,
  connectorId: string,
  runId: string,
  esClient: Client,
  log: ToolingLog
): Promise<void> {
  log.info('');
  log.info('='.repeat(70));
  log.info(`SCENARIO: ${scenario.id}${scenario.isFailure ? ' (failure)' : ' (baseline)'}`);
  log.info('='.repeat(70));

  // Step 1 — Enable the `logs` ES native stream first so Kibana's enableStreams
  // detects it and creates the wired definition (without this, enableStreams
  // skips `logs` as a legacy root when both Kibana def and ES stream are missing).
  log.info('[1/8] Enabling Streams and significant events...');
  await enableLogsNativeStream(esClient, log);
  await enableStreams(config, log);
  await enableSignificantEvents(config, log);
  await configureSigEventsConnector(config, log, connectorId);

  // Step 2 — Deploy OTel Demo (data now flows into properly-mapped `logs`)
  log.info('[2/8] Deploying OTel Demo...');
  const { child, deployedPromise } = deployOtelDemo(log);

  try {
    // Step 3 — Wait for the Otel Demo to finish deploying, then verify pods
    log.info('[3/8] Waiting for OTel Demo deployment...');
    await deployedPromise;
    log.info('[3/8] Verifying that the pods are ready...');
    await waitForPodsReady(log);

    // Step 4 — Accumulate baseline traffic
    log.info('[4/8] Accumulating baseline traffic...');
    await sleep(BASELINE_WAIT_MS, log, 'baseline traffic');

    // Step 5 — Apply failure (if applicable)
    if (scenario.isFailure) {
      log.info(`[5/8] Applying failure scenario "${scenario.id}"...`);
      await patchScenario(log, scenario.id);

      log.info('[5/8] Accumulating failure data...');
      await sleep(FAILURE_WAIT_MS, log, 'failure data');
    } else {
      log.info('[5/8] Skipped (healthy baseline)');
    }

    // Step 6 — Run feature extraction (the task generates both inferred and computed features)
    log.info('[6/8] Running feature extraction...');
    await triggerSigEventsFeatureExtraction(config, log);
    await waitForSigEventsFeatureExtraction(config, log);
    await logSigEventsExtractedFeatures(config, log);
    await persistSigEventsExtractedFeaturesForSnapshot(config, esClient, log, scenario.id);

    // Step 7 — Create a snapshot of the logs and extracted features
    log.info('[7/8] Creating GCS snapshot...');
    await createSnapshot({ esClient, log, snapshotName: scenario.id, runId });
  } finally {
    // Kill the Otel Demo background process (log streamer)
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  // Step 8 — Cleanup (delete data and tear down demo, but keep Streams enabled
  // so the wired templates persist for the next scenario)
  log.info('[8/8] Cleaning up...');
  await cleanupSigEventsExtractedFeaturesData(esClient, log);
  await teardownOtelDemo(log);

  log.info(`Scenario "${scenario.id}" — done`);
}

async function enableLogsNativeStream(esClient: Client, log: ToolingLog): Promise<void> {
  try {
    await esClient.transport.request({ method: 'POST', path: '_streams/logs/_enable' });
    log.info('ES native "logs" stream enabled');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('already enabled') || message.includes('resource_already_exists')) {
      log.info('ES native "logs" stream already enabled');
      return;
    }
    throw err;
  }
}
