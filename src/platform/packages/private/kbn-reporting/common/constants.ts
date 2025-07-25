/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  DISCOVER_APP_LOCATOR,
  CANVAS_APP_LOCATOR,
  DASHBOARD_APP_LOCATOR,
  LENS_APP_LOCATOR,
  VISUALIZE_APP_LOCATOR,
} from '@kbn/deeplinks-analytics';
import { LicenseType } from '@kbn/licensing-plugin/common/types';

export const ALLOWED_JOB_CONTENT_TYPES = [
  'application/json',
  'application/pdf',
  'text/csv',
  'image/png',
  'text/plain',
];

/*
 * UI Settings
 */

export const UI_SETTINGS_SEARCH_INCLUDE_FROZEN = 'search:includeFrozen';
export const UI_SETTINGS_CUSTOM_PDF_LOGO = 'xpackReporting:customPdfLogo';
export const UI_SETTINGS_DATEFORMAT_TZ = 'dateFormat:tz';

/*
 * Licenses
 */

export const LICENSE_TYPE_TRIAL = 'trial' as const;
export const LICENSE_TYPE_BASIC = 'basic' as const;
export const LICENSE_TYPE_CLOUD_STANDARD = 'standard' as const;
export const LICENSE_TYPE_GOLD = 'gold' as const;
export const LICENSE_TYPE_PLATINUM = 'platinum' as const;
export const LICENSE_TYPE_ENTERPRISE = 'enterprise' as const;
export const SCHEDULED_REPORT_VALID_LICENSES: LicenseType[] = [
  LICENSE_TYPE_TRIAL,
  LICENSE_TYPE_CLOUD_STANDARD,
  LICENSE_TYPE_GOLD,
  LICENSE_TYPE_PLATINUM,
  LICENSE_TYPE_ENTERPRISE,
];

/*
 * Notifications
 */

export const JOB_COMPLETION_NOTIFICATIONS_SESSION_KEY =
  'xpack.reporting.jobCompletionNotifications';

/*
 * Client-side paths
 */

// Allowed locator types for reporting: the "reportable" analytical apps we expect to redirect to during screenshotting
export const REPORTING_REDIRECT_ALLOWED_LOCATOR_TYPES = [
  DISCOVER_APP_LOCATOR,
  CANVAS_APP_LOCATOR,
  DASHBOARD_APP_LOCATOR,
  LENS_APP_LOCATOR,
  VISUALIZE_APP_LOCATOR,
];

// Redirection URL used to load app state for screenshotting
export const REPORTING_REDIRECT_APP = '/app/reportingRedirect';
export const REPORTING_REDIRECT_LOCATOR_STORE_KEY = '__REPORTING_REDIRECT_LOCATOR_STORE_KEY__';

// Management UI route
export const REPORTING_MANAGEMENT_HOME = '/app/management/insightsAndAlerting/reporting';
export const REPORTING_MANAGEMENT_SCHEDULES =
  '/app/management/insightsAndAlerting/reporting/schedules';

/*
 * ILM
 */

// The ILM policy manages stored reports only in stateful deployments.
export const ILM_POLICY_NAME = 'kibana-reporting';

/*
 * JobStatus:
 *  - Begins as 'pending'
 *  - Changes to 'processing` when the job is claimed
 *  - Then 'completed' | 'failed' when execution is done
 * If the job needs a retry, it reverts back to 'pending'.
 */
export enum JOB_STATUS {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WARNINGS = 'completed_with_warnings',
}

/*
 * Test Subjects
 */

// Management app subjects
export const REPORT_TABLE_ID = 'reportJobListing';
export const REPORT_TABLE_ROW_ID = 'reportJobRow';
