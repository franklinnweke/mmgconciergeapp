import { describe, expect, it } from 'vitest';

import {
  DEV_PROJECT_ID,
  PAYSTACK_SECRET_FUNCTIONS,
  assertMainRevision,
  assertPaystackSecretBindings,
  assertRemoteIndexesAdditive,
  assertSafeDeployTarget,
  deployOnlyFilter,
  runLocalPreflight,
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
    const remote = { indexes: [{ collectionGroup: 'legacy', queryScope: 'COLLECTION', fields: [{ fieldPath: 'state', order: 'ASCENDING' }] }], fieldOverrides: [] };
    expect(() => assertRemoteIndexesAdditive({ localIndexes: { indexes: [], fieldOverrides: [] }, remoteIndexes: remote })).toThrow(/remove/);
    expect(assertRemoteIndexesAdditive({ localIndexes: remote, remoteIndexes: remote }).remoteIndexCount).toBe(1);
  });

  it('passes the checked-in source preflight without contacting Firebase', async () => {
    const result = await runLocalPreflight({ root: process.cwd() });
    expect(result.projectId).toBe(DEV_PROJECT_ID);
    expect(result.functions).toContain('expireRentalRequestPaymentWindows');
  });
});
