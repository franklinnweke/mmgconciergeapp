import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DEV_PROJECT_ID,
  PAYSTACK_SECRET_FUNCTIONS,
  assertMainRevision,
  assertPaystackSecretBindings,
  assertRemoteIndexesAdditive,
  assertSafeDeployTarget,
  assertFunctionSecretMetadata,
  assertSchedulerHealth,
  assertSecretMetadata,
  deployOnlyFilter,
  hasNigeriaSmsAccess,
  normalizeIndexConfig,
  requiredIndexesReady,
  runLocalPreflight,
  waitForRentalRequestIndexes,
} from './firebase-release-hardening.mjs';

describe('Firebase development release hardening', () => {
  it('builds an exact request-first deployment filter without the legacy createBookingIntent', () => {
    const filter = deployOnlyFilter();
    expect(filter).toContain('firestore:rules');
    expect(filter).toContain('firestore:indexes');
    expect(filter).toContain('functions:createRentalRequest');
    expect(filter).toContain('functions:requestAccountDeletion');
    expect(filter).not.toContain('functions:createBookingIntent');
  });

  it('rejects production or missing deployment targets', () => {
    expect(() => assertSafeDeployTarget('mmg-concierge')).toThrow(/only mmg-concierge-dev/);
    expect(() => assertSafeDeployTarget('')).toThrow(/only mmg-concierge-dev/);
    expect(() => assertSafeDeployTarget(DEV_PROJECT_ID)).not.toThrow();
  });

  it('requires a clean exact main revision', () => {
    expect(() => assertMainRevision({
      branch: 'codex/dev-deploy-hardening',
      headSha: 'abc',
      mainSha: 'abc',
      remoteMainSha: 'abc',
      dirty: '',
    })).toThrow(/main/);
    expect(() => assertMainRevision({
      branch: 'main',
      headSha: 'abc',
      mainSha: 'abc',
      remoteMainSha: 'def',
      dirty: '',
    })).toThrow(/origin\/main/);
    expect(assertMainRevision({
      branch: 'main',
      headSha: 'abc',
      mainSha: 'abc',
      remoteMainSha: 'abc',
      dirty: '',
    })).toBe('abc');
  });

  it('detects ambient secret access and unintended secret bindings', () => {
    const validSources = {
      'apps/functions/src/booking/paystack-secret.ts': "export const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');",
      'apps/functions/src/booking/payment-callables.ts': PAYSTACK_SECRET_FUNCTIONS.slice(1).map((name) =>
        `export const ${name} = onCall({ secrets: [paystackSecret] }, async () => ({}));`,
      ).join('\n'),
      'apps/functions/src/booking/rental-request-callables.ts':
        `export const ${PAYSTACK_SECRET_FUNCTIONS[0]} = onCall({ secrets: [paystackSecret] }, async () => ({}));`,
    };
    expect(assertPaystackSecretBindings(validSources)).toEqual([...PAYSTACK_SECRET_FUNCTIONS].sort());
    expect(() => assertPaystackSecretBindings({
      ...validSources,
      'apps/functions/src/booking/legacy.ts': 'const key = process.env.PAYSTACK_SECRET_KEY;',
    })).toThrow(/ambient/i);
    expect(() => assertPaystackSecretBindings({
      ...validSources,
      'apps/functions/src/booking/unrelated-callable.ts':
        'export const unrelatedCallable = onCall({ secrets: [paystackSecret] }, async () => ({}));',
    })).toThrow(/Unexpected Paystack secret bindings/);
  });

  it('rejects remote indexes that would be removed by the local config', () => {
    const local = JSON.parse(readFileSync(resolve(process.cwd(), 'firebase/firestore.indexes.json'), 'utf8'));
    const rentalRequestIndexes = local.indexes.filter((index) => index.collectionGroup === 'rentalRequests');
    const otherIndexes = local.indexes.filter((index) => index.collectionGroup !== 'rentalRequests').slice(0, 4);
    const sevenCurrentIndexes = [...otherIndexes, ...rentalRequestIndexes];
    const remote = {
      status: 'OK',
      result: {
        indexes: sevenCurrentIndexes.map((index) => ({
          ...index,
          state: 'READY',
          fields: [...index.fields, { fieldPath: '__name__', order: 'ASCENDING' }],
        })),
        fieldOverrides: local.fieldOverrides,
      },
    };
    expect(normalizeIndexConfig(remote).indexes).toHaveLength(7);
    expect(assertRemoteIndexesAdditive({ localIndexes: local, remoteIndexes: remote }).remoteIndexCount).toBe(7);
    const remoteOnly = {
      result: {
        indexes: [...remote.result.indexes, { collectionGroup: 'legacy', queryScope: 'COLLECTION', fields: [{ fieldPath: 'state', order: 'ASCENDING' }] }],
        fieldOverrides: [],
      },
    };
    expect(() => assertRemoteIndexesAdditive({ localIndexes: local, remoteIndexes: remoteOnly })).toThrow(/remove/);
  });

  it('handles real Identity Toolkit phone-region shapes without assuming NG access', () => {
    expect(hasNigeriaSmsAccess({ signIn: { phoneNumber: { enabled: true } }, smsRegionConfig: { allowlistOnly: { allowedRegions: ['NG', 'US'] } } })).toBe(true);
    expect(hasNigeriaSmsAccess({ signIn: { phoneNumber: { enabled: true } }, smsRegionConfig: { allowlistOnly: { allowedRegions: ['US'] } } })).toBe(false);
    expect(hasNigeriaSmsAccess({ signIn: { phoneNumber: { enabled: true } }, smsRegionConfig: { allowlistOnly: false } })).toBe(true);
    expect(hasNigeriaSmsAccess({ signIn: { phoneNumber: { enabled: false } } })).toBe(false);
  });

  it('requires an enabled Secret Manager version and separates pre/post scheduler checks', () => {
    const metadata = { name: 'projects/mmg-concierge-dev/secrets/PAYSTACK_SECRET_KEY', replication: { automatic: {} } };
    expect(() => assertSecretMetadata(metadata, [{ state: 'DISABLED' }])).toThrow(/ENABLED/);
    expect(() => assertSecretMetadata(metadata, [{ state: 'ENABLED' }])).not.toThrow();
    expect(assertSchedulerHealth([], { required: false })[0]).toMatch(/not present yet/);
    expect(() => assertSchedulerHealth([], { required: true })).toThrow(/scheduler/);
  });

  it('warns on unrelated legacy bindings but fails targeted invariants', () => {
    const unrelatedWarning = assertFunctionSecretMetadata([
      { name: 'projects/p/locations/africa-south1/functions/legacy', serviceConfig: { environmentVariables: { PAYSTACK_SECRET_KEY: 'redacted' } } },
    ], { phase: 'predeploy' });
    expect(unrelatedWarning[0]).toMatch(/Legacy unrelated/);
    expect(() => assertFunctionSecretMetadata([
      { name: 'projects/p/locations/africa-south1/functions/createRentalRequest', serviceConfig: { secretEnvironmentVariables: [{ key: 'PAYSTACK_SECRET_KEY' }] } },
    ], { phase: 'postdeploy' })).toThrow(/Target Function/);
  });

  it('polls bounded index readiness before Functions deployment', async () => {
    const local = JSON.parse(readFileSync(resolve(process.cwd(), 'firebase/firestore.indexes.json'), 'utf8'));
    const rentalRequestIndexes = local.indexes.filter((index) => index.collectionGroup === 'rentalRequests');
    const otherIndexes = local.indexes.filter((index) => index.collectionGroup !== 'rentalRequests').slice(0, 4);
    const sevenCurrentIndexes = [...otherIndexes, ...rentalRequestIndexes];
    const pending = { result: { indexes: sevenCurrentIndexes.map((index) => ({ ...index, state: 'CREATING' })) } };
    const ready = { result: { indexes: sevenCurrentIndexes.map((index) => ({ ...index, state: 'READY', fields: [...index.fields, { fieldPath: '__name__', order: 'ASCENDING' }] })) } };
    let reads = 0;
    const result = await waitForRentalRequestIndexes({ readRemoteIndexes: async () => (++reads === 1 ? pending : ready), sleep: async () => {} });
    expect(result.attempts).toBe(2);
    expect(requiredIndexesReady(ready)).toBe(true);
  });

  it('passes the checked-in source preflight without contacting Firebase', async () => {
    const result = await runLocalPreflight({ root: process.cwd() });
    expect(result.projectId).toBe(DEV_PROJECT_ID);
    expect(result.functions).toContain('expireRentalRequestPaymentWindows');
  });
});
