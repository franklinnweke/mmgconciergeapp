import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { BookingCommandError } from './errors.js';
import {
  ingestPaystackWebhook,
  MAX_PAYSTACK_WEBHOOK_BYTES,
  verifyPaystackWebhookSignature,
  type PaystackWebhookEventRepository,
} from './paystack-webhook-service.js';

const secretKey = 'sk_test_mmg_webhook_unit';

function bodyFor(overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    event: 'charge.success',
    data: {
      domain: 'test',
      status: 'success',
      reference: 'mmg-abc123',
      amount: 12_500_000,
      currency: 'NGN',
      paid_at: '2026-09-01T02:00:00.000Z',
      ...overrides,
    },
  }));
}

function signatureFor(body: Buffer): string {
  return createHmac('sha512', secretKey).update(body).digest('hex');
}

function repository(outcome: 'created' | 'duplicate' = 'created') {
  const createWebhookEvent = vi.fn(async () => outcome);
  return { createWebhookEvent } satisfies PaystackWebhookEventRepository;
}

describe('verifyPaystackWebhookSignature', () => {
  it('verifies the raw body HMAC and rejects missing/invalid signatures', () => {
    const body = bodyFor();
    expect(verifyPaystackWebhookSignature(body, signatureFor(body), secretKey)).toBe(true);
    expect(verifyPaystackWebhookSignature(body, undefined, secretKey)).toBe(false);
    expect(verifyPaystackWebhookSignature(body, 'a'.repeat(128), secretKey)).toBe(false);
  });
});

describe('ingestPaystackWebhook', () => {
  it('authenticates before parsing and stores only normalized charge.success facts', async () => {
    const body = bodyFor();
    const repo = repository();

    const result = await ingestPaystackWebhook(body, signatureFor(body), secretKey, repo, {
      now: () => new Date('2026-09-01T02:00:01.000Z'),
    });

    expect(result).toMatchObject({ status: 'stored', eventId: expect.stringMatching(/^paystack-event-/) });
    expect(repo.createWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({
      source: 'webhook',
      eventType: 'charge.success',
      reference: 'mmg-abc123',
      providerStatus: 'success',
      environment: 'test',
      amountKobo: 12_500_000,
      currency: 'NGN',
      paidAtIso: '2026-09-01T02:00:00.000Z',
      bodySha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }));
    const stored = repo.createWebhookEvent.mock.calls[0]![0] as Record<string, unknown>;
    expect(stored).not.toHaveProperty('rawBody');
    expect(stored).not.toHaveProperty('signature');
  });

  it('deduplicates an identical signed event by stable semantic event id', async () => {
    const body = bodyFor();
    const repo = repository('duplicate');
    const first = await ingestPaystackWebhook(body, signatureFor(body), secretKey, repo);
    const second = await ingestPaystackWebhook(body, signatureFor(body), secretKey, repo);
    expect(first).toEqual(second);
    expect(first.status).toBe('duplicate');
  });

  it('rejects invalid signatures before attempting JSON parsing', async () => {
    const repo = repository();
    const invalidJson = Buffer.from('{ definitely-not-json');

    await expect(
      ingestPaystackWebhook(invalidJson, 'a'.repeat(128), secretKey, repo),
    ).rejects.toMatchObject<Partial<BookingCommandError>>({ code: 'FORBIDDEN' });
    expect(repo.createWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects malformed charge.success events and oversized bodies', async () => {
    const malformed = bodyFor({ reference: 'invalid_reference' });
    await expect(
      ingestPaystackWebhook(malformed, signatureFor(malformed), secretKey, repository()),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });

    const oversized = Buffer.alloc(MAX_PAYSTACK_WEBHOOK_BYTES + 1, 1);
    await expect(
      ingestPaystackWebhook(oversized, signatureFor(oversized), secretKey, repository()),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('acknowledges unrelated signed Paystack events without persisting them', async () => {
    const body = Buffer.from(JSON.stringify({ event: 'transfer.success', data: { reference: 'transfer-1' } }));
    const repo = repository();
    await expect(ingestPaystackWebhook(body, signatureFor(body), secretKey, repo)).resolves.toEqual({
      status: 'ignored',
    });
    expect(repo.createWebhookEvent).not.toHaveBeenCalled();
  });

  it('rejects live credentials in the development webhook runtime before processing', async () => {
    const body = bodyFor({ domain: 'live' });
    const liveSecret = 'sk_live_mmg_webhook_unit';
    const signature = createHmac('sha512', liveSecret).update(body).digest('hex');
    await expect(
      ingestPaystackWebhook(body, signature, liveSecret, repository()),
    ).rejects.toMatchObject({ code: 'CONFIGURATION_UNAVAILABLE' });
  });
});
