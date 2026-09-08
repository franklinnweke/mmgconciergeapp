import { afterEach, describe, expect, it } from 'vitest';

import { isProductionAppCheck } from './app-check-env.js';

const ENV_KEYS = [
  'MMG_ENFORCE_APP_CHECK',
  'GCLOUD_PROJECT',
  'GOOGLE_CLOUD_PROJECT',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CONFIG',
] as const;

const originalEnvironment = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]]),
) as Record<(typeof ENV_KEYS)[number], string | undefined>;

function clearRelevantEnvironment() {
  for (const key of ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  clearRelevantEnvironment();
  for (const key of ENV_KEYS) {
    const value = originalEnvironment[key];
    if (value !== undefined) process.env[key] = value;
  }
});

describe('isProductionAppCheck', () => {
  it('cannot be disabled in production by an environment override', () => {
    clearRelevantEnvironment();
    process.env.GCLOUD_PROJECT = 'mmg-concierge';
    process.env.MMG_ENFORCE_APP_CHECK = 'false';

    expect(isProductionAppCheck()).toBe(true);
  });

  it('keeps the temporary development bypass', () => {
    clearRelevantEnvironment();
    process.env.GCLOUD_PROJECT = 'mmg-concierge-dev';
    process.env.MMG_ENFORCE_APP_CHECK = 'false';

    expect(isProductionAppCheck()).toBe(false);
  });

  it('allows development to opt into enforcement', () => {
    clearRelevantEnvironment();
    process.env.GCLOUD_PROJECT = 'mmg-concierge-dev';
    process.env.MMG_ENFORCE_APP_CHECK = 'true';

    expect(isProductionAppCheck()).toBe(true);
  });

  it('uses the development default when no override is supplied', () => {
    clearRelevantEnvironment();
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'mmg-concierge-dev' });

    expect(isProductionAppCheck()).toBe(false);
  });

  it('fails closed when project configuration is missing', () => {
    clearRelevantEnvironment();
    process.env.MMG_ENFORCE_APP_CHECK = 'false';

    expect(isProductionAppCheck()).toBe(true);
  });

  it('fails closed when FIREBASE_CONFIG is malformed', () => {
    clearRelevantEnvironment();
    process.env.FIREBASE_CONFIG = '{not-json';

    expect(isProductionAppCheck()).toBe(true);
  });
});
