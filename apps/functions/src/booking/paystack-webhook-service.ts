import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import {
  paymentEnvironmentSchema,
  paymentReferenceSchema,
  type PaymentEnvironment,
  type PaymentReference,
} from '@mmg/contracts/payment';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';

export const MAX_PAYSTACK_WEBHOOK_BYTES = 256 * 1024;

const webhookEnvelopeSchema = z.object({
  event: z.string().trim().min(1).max(100),
  data: z.unknown(),
}).passthrough();

const chargeSuccessDataSchema = z.object({
  domain: paymentEnvironmentSchema,
  status: z.literal('success'),
  reference: paymentReferenceSchema,
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  paid_at: z.string().trim().min(1).max(64).nullable().optional(),
}).passthrough();

export type StoredPaystackWebhookEvent = {
  eventId: string;
  source: 'webhook';
  eventType: 'charge.success';
  reference: PaymentReference;
  providerStatus: 'success';
  environment: PaymentEnvironment;
  amountKobo: number;
  currency: string;
  paidAtIso?: string;
  bodySha256: string;
  receivedAt: Date;
};

export interface PaystackWebhookEventRepository {
  createWebhookEvent(event: StoredPaystackWebhookEvent): Promise<'created' | 'duplicate'>;
}

export type PaystackWebhookIngestResult =
  | { status: 'stored'; eventId: string }
  | { status: 'duplicate'; eventId: string }
  | { status: 'ignored' };

function hashHex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function buildEventId(event: {
  eventType: string;
  reference: string;
  providerStatus: string;
  environment: string;
  amountKobo: number;
  currency: string;
  paidAtIso?: string;
}): string {
  const digest = hashHex(JSON.stringify({
    eventType: event.eventType,
    reference: event.reference,
    providerStatus: event.providerStatus,
    environment: event.environment,
    amountKobo: event.amountKobo,
    currency: event.currency,
    paidAtIso: event.paidAtIso ?? null,
  }));
  return `paystack-event-${digest.slice(0, 48)}`;
}

export function verifyPaystackWebhookSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secretKey: string,
): boolean {
  if (!signature || !/^[a-fA-F0-9]{128}$/.test(signature)) return false;
  if (!secretKey) return false;

  const expected = createHmac('sha512', secretKey).update(rawBody).digest('hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  const actualBytes = Buffer.from(signature.toLowerCase(), 'hex');
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export async function ingestPaystackWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  secretKey: string,
  repository: PaystackWebhookEventRepository,
  options: {
    now?: () => Date;
    requiredEnvironment?: PaymentEnvironment;
  } = {},
): Promise<PaystackWebhookIngestResult> {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > MAX_PAYSTACK_WEBHOOK_BYTES) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Paystack webhook body is invalid.');
  }

  const requiredEnvironment = options.requiredEnvironment ?? 'test';
  const configuredEnvironment = secretKey.startsWith('sk_test_')
    ? 'test'
    : secretKey.startsWith('sk_live_')
      ? 'live'
      : null;
  if (!configuredEnvironment || configuredEnvironment !== requiredEnvironment) {
    throw new BookingCommandError(
      'CONFIGURATION_UNAVAILABLE',
      `Paystack ${configuredEnvironment ?? 'unknown'} credentials are not permitted in this runtime.`,
    );
  }

  if (!verifyPaystackWebhookSignature(rawBody, signature, secretKey)) {
    throw new BookingCommandError('FORBIDDEN', 'Paystack webhook signature is invalid.');
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Paystack webhook body is not valid JSON.');
  }

  const envelope = webhookEnvelopeSchema.safeParse(parsedJson);
  if (!envelope.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Paystack webhook event shape is invalid.');
  }

  if (envelope.data.event !== 'charge.success') {
    return { status: 'ignored' };
  }

  const charge = chargeSuccessDataSchema.safeParse(envelope.data.data);
  if (!charge.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Paystack charge.success event shape is invalid.');
  }

  const eventFacts = {
    eventType: 'charge.success' as const,
    reference: charge.data.reference,
    providerStatus: 'success' as const,
    environment: charge.data.domain,
    amountKobo: charge.data.amount,
    currency: charge.data.currency,
    ...(charge.data.paid_at ? { paidAtIso: charge.data.paid_at } : {}),
  };
  const eventId = buildEventId(eventFacts);
  const outcome = await repository.createWebhookEvent({
    eventId,
    source: 'webhook',
    ...eventFacts,
    bodySha256: hashHex(rawBody),
    receivedAt: (options.now ?? (() => new Date()))(),
  });

  return outcome === 'created'
    ? { status: 'stored', eventId }
    : { status: 'duplicate', eventId };
}
