/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  getAgentName,
  hasOpenTelemetryPrefix,
  isAndroidAgentName,
  isAWSLambdaAgentName,
  isAzureFunctionsAgentName,
  isElasticAgentName,
  isEDOTAgentName,
  isIosAgentName,
  isJavaAgentName,
  isJRubyAgentName,
  isMobileAgentName,
  isOpenTelemetryAgentName,
  isRumAgentName,
  isRumOrMobileAgentName,
  isServerlessAgentName,
} from './agent_guards';

describe('Agents guards', () => {
  it('hasOpenTelemetryPrefix should guard if the passed agent has an OpenTelemetry prefix.', () => {
    expect(hasOpenTelemetryPrefix('otlp')).toBe(false);
    expect(hasOpenTelemetryPrefix('otlp/nodejs')).toBe(true);
    expect(hasOpenTelemetryPrefix('otlp/nodejs/elastic')).toBe(true);
    expect(hasOpenTelemetryPrefix('opentelemetry')).toBe(false);
    expect(hasOpenTelemetryPrefix('opentelemetry/nodejs')).toBe(true);
    expect(hasOpenTelemetryPrefix('opentelemetry/nodejs/elastic')).toBe(true);
    expect(hasOpenTelemetryPrefix('not-an-agent')).toBe(false);
  });

  it('isOpenTelemetryAgentName should guard if the passed agent is an OpenTelemetry one.', () => {
    expect(isOpenTelemetryAgentName('otlp')).toBe(true);
    expect(isOpenTelemetryAgentName('otlp/nodejs')).toBe(true);
    expect(isOpenTelemetryAgentName('otlp/nodejs/elastic')).toBe(true);
    expect(isOpenTelemetryAgentName('opentelemetry')).toBe(true);
    expect(isOpenTelemetryAgentName('opentelemetry/nodejs')).toBe(true);
    expect(isOpenTelemetryAgentName('opentelemetry/nodejs/elastic')).toBe(true);
    expect(isOpenTelemetryAgentName('not-an-agent')).toBe(false);
  });

  it('isElasticAgentName should guard if the passed agent is an APM agent one.', () => {
    expect(isElasticAgentName('nodejs')).toBe(true);
    expect(isElasticAgentName('iOS/swift')).toBe(true);
    expect(isElasticAgentName('java')).toBe(true);
    expect(isElasticAgentName('rum-js')).toBe(true);
    expect(isElasticAgentName('android/java')).toBe(true);
    expect(isElasticAgentName('node-js')).toBe(false);
    expect(isElasticAgentName('opentelemetry/nodejs/elastic')).toBe(false);
    expect(isElasticAgentName('not-an-agent')).toBe(false);
  });

  it('isEDOTAgentName should guard if the passed agent is an EDOT SDK one.', () => {
    expect(isEDOTAgentName('opentelemetry/java/elastic')).toBe(true);
    expect(isEDOTAgentName('opentelemetry/java/opentelemetry-java-instrumentation')).toBe(false);
    expect(isEDOTAgentName('opentelemetry/java')).toBe(false);
  });

  it('isJavaAgentName should guard if the passed agent is an Java one.', () => {
    expect(isJavaAgentName('java')).toBe(true);
    expect(isJavaAgentName('otlp/java')).toBe(true);
    expect(isJavaAgentName('otlp/java/opentelemetry-java-instrumentation')).toBe(true);
    expect(isJavaAgentName('opentelemetry/java')).toBe(true);
    expect(isJavaAgentName('opentelemetry/java/opentelemetry-java-instrumentation')).toBe(true);
    expect(isJavaAgentName('not-an-agent')).toBe(false);
  });

  it('isRumAgentName should guard if the passed agent is an Rum one.', () => {
    expect(isRumAgentName('otlp/webjs')).toBe(true);
    expect(isRumAgentName('otlp/webjs/elastic')).toBe(true);
    expect(isRumAgentName('otlp/fail')).toBe(false);
    expect(isRumAgentName('opentelemetry/webjs')).toBe(true);
    expect(isRumAgentName('opentelemetry/webjs/elastic')).toBe(true);
    expect(isRumAgentName('opentelemetry/fail')).toBe(false);
    expect(isRumAgentName('rum-js')).toBe(true);
    expect(isRumAgentName('not-an-agent')).toBe(false);
  });

  it('isMobileAgentName should guard if the passed agent is an Mobile one.', () => {
    expect(isMobileAgentName('ios/swift')).toBe(true);
    expect(isMobileAgentName('android/java')).toBe(true);
    expect(isMobileAgentName('not-an-agent')).toBe(false);
  });

  it('isRumOrMobileAgentName should guard if the passed agent is an RumOrMobile one.', () => {
    expect(isRumOrMobileAgentName('ios/swift')).toBe(true);
    expect(isRumOrMobileAgentName('android/java')).toBe(true);
    expect(isRumOrMobileAgentName('rum-js')).toBe(true);
    expect(isRumOrMobileAgentName('not-an-agent')).toBe(false);
  });

  it('isIosAgentName should guard if the passed agent is an Ios one.', () => {
    expect(isIosAgentName('otlp/swift/elastic')).toBe(true);
    expect(isIosAgentName('otlp/swift')).toBe(true);
    expect(isIosAgentName('otlp/fail')).toBe(false);
    expect(isIosAgentName('opentelemetry/swift/elastic')).toBe(true);
    expect(isIosAgentName('opentelemetry/swift')).toBe(true);
    expect(isIosAgentName('opentelemetry/fail')).toBe(false);
    expect(isIosAgentName('ios/swift')).toBe(true);
    expect(isIosAgentName('not-an-agent')).toBe(false);
  });

  it('isAndroidAgentName should guard if the passed agent is an Android one.', () => {
    expect(isAndroidAgentName('otlp/android/elastic')).toBe(true);
    expect(isAndroidAgentName('otlp/android')).toBe(true);
    expect(isAndroidAgentName('otlp/fail')).toBe(false);
    expect(isAndroidAgentName('opentelemetry/android/elastic')).toBe(true);
    expect(isAndroidAgentName('opentelemetry/android')).toBe(true);
    expect(isAndroidAgentName('opentelemetry/fail')).toBe(false);
    expect(isAndroidAgentName('android/java')).toBe(true);
    expect(isAndroidAgentName('not-an-agent')).toBe(false);
  });

  it('isJRubyAgentName should guard if the passed agent is an JRuby one.', () => {
    expect(isJRubyAgentName('ruby', 'jruby')).toBe(true);
    expect(isJRubyAgentName('ruby')).toBe(false);
    expect(isJRubyAgentName('not-an-agent')).toBe(false);
  });

  it('isServerlessAgentName should guard if the passed agent is an Serverless one.', () => {
    expect(isServerlessAgentName('aws.lambda')).toBe(true);
    expect(isServerlessAgentName('azure.functions')).toBe(true);
    expect(isServerlessAgentName('not-an-agent')).toBe(false);
  });

  it('isAWSLambdaAgentName should guard if the passed agent is an AWSLambda one.', () => {
    expect(isAWSLambdaAgentName('aws.lambda')).toBe(true);
    expect(isAWSLambdaAgentName('not-an-agent')).toBe(false);
  });

  it('isAzureFunctionsAgentName should guard if the passed agent is an AzureFunctions one.', () => {
    expect(isAzureFunctionsAgentName('azure.functions')).toBe(true);
    expect(isAzureFunctionsAgentName('not-an-agent')).toBe(false);
  });

  it('getAgentName returns agent name by default', () => {
    expect(getAgentName('nodejs', 'go', 'otlp')).toBe('nodejs');
  });

  it('getAgentName returns telemetry sdk name and telemetry agent name if agent name is not defined', () => {
    expect(getAgentName(null, 'go', 'otlp')).toBe('otlp/go');
  });

  it('getAgentName returns telemetry agent name if agent name and telemetry sdk are not defined', () => {
    expect(getAgentName(null, 'go', null)).toBe('go');
  });
});
