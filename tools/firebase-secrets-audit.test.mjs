import { describe, expect, it } from 'vitest';

import { PAYSTACK_SECRET_FUNCTIONS, auditPaystackBindings, runAudit } from './firebase-secrets-audit.mjs';

const validSources = {
  'apps/functions/src/booking/paystack-secret.ts': "export const paystackSecret = defineSecret('PAYSTACK_SECRET_KEY');",
  'apps/functions/src/booking/payment-callables.ts': PAYSTACK_SECRET_FUNCTIONS.slice(1)
    .map((name) => `export const ${name} = onCall({ secrets: [paystackSecret] }, async () => new PaystackPaymentAdapter({ secretKey: paystackSecret.value() }));`)
    .join('\n'),
  'apps/functions/src/booking/rental-request-callables.ts':
    `export const ${PAYSTACK_SECRET_FUNCTIONS[0]} = onCall({ secrets: [paystackSecret] }, async () => new PaystackPaymentAdapter({ secretKey: paystackSecret.value() }));`,
};

describe('Paystack source audit', () => {
  it('accepts exactly the five explicit secret bindings and adapter call sites', () => {
    expect(auditPaystackBindings(validSources)).toEqual([...PAYSTACK_SECRET_FUNCTIONS].sort());
  });

  it('rejects ambient access, missing adapter secretKey, and extra bindings', () => {
    expect(() => auditPaystackBindings({ ...validSources, 'legacy.ts': 'process.env.PAYSTACK_SECRET_KEY' })).toThrow(/Ambient/);
    expect(() => auditPaystackBindings({ ...validSources, 'legacy.ts': 'new PaystackPaymentAdapter({})' })).toThrow(/secretKey/);
    expect(() => auditPaystackBindings({
      ...validSources,
      'extra.ts': 'export const unrelated = onCall({ secrets: [paystackSecret] }, async () => ({}));',
    })).toThrow(/Unexpected/);
  });

  it('audits the checked-in Functions source without Firebase or GCP access', async () => {
    await expect(runAudit(process.cwd())).resolves.toEqual([...PAYSTACK_SECRET_FUNCTIONS].sort());
  });
});
