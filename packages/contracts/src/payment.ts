import { z } from 'zod';

import {
  boundedIdSchema,
  emailAddressSchema,
  idempotencyKeySchema,
  isoDateTimeSchema,
  schemaVersionSchema,
} from '@mmg/contracts';

/**
 * Paystack transaction reference contract.
 *
 * Paystack accepts only ASCII alphanumeric characters plus `-`, `.`, and `=`.
 * Keep this exported and canonical so the server-side generator, adapter,
 * persisted payment record, webhook payload parser, and reconciliation path
 * cannot drift onto different reference alphabets.
 */
export const paymentReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9.=-]+$/, 'Payment reference contains characters Paystack does not support.');
export type PaymentReference = z.infer<typeof paymentReferenceSchema>;

const paymentAmountKoboSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const currencyCodeSchema = z.string().trim().length(3).transform((value) => value.toUpperCase());

export const paymentProviderSchema = z.literal('paystack');
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const paymentEnvironmentSchema = z.enum(['test', 'live']);
export type PaymentEnvironment = z.infer<typeof paymentEnvironmentSchema>;

export const paymentStateSchema = z.enum([
  'initialized',
  'pending',
  'succeeded',
  'refund_pending',
  'refunded',
  'failed',
  'abandoned',
  'refund_failed',
]);
export type PaymentState = z.infer<typeof paymentStateSchema>;

export const paystackTransactionStatusSchema = z.enum([
  'abandoned',
  'failed',
  'ongoing',
  'pending',
  'processing',
  'queued',
  'reversed',
  'success',
]);
export type PaystackTransactionStatus = z.infer<typeof paystackTransactionStatusSchema>;

export const paymentVerificationOutcomeSchema = z.enum([
  'verified_success',
  'not_succeeded',
  'rejected',
]);
export type PaymentVerificationOutcome = z.infer<typeof paymentVerificationOutcomeSchema>;

/**
 * R4 consumes only durable R3 `verified_success` evidence. New request-first
 * bookings are already availability-approved before payment and therefore move
 * directly to `confirmed`. Historical pay-first intents retain
 * `paid_pending_owner` compatibility. Unsafe late-payment collisions remain
 * `paid_conflict` and require concierge intervention.
 */
export const paymentValueDeliveryOutcomeSchema = z.enum([
  'confirmed',
  'paid_pending_owner',
  'paid_conflict',
]);
export type PaymentValueDeliveryOutcome = z.infer<typeof paymentValueDeliveryOutcomeSchema>;

const deliveredBookingResultShape = {
  eventId: boundedIdSchema,
  paymentId: boundedIdSchema,
  intentId: boundedIdSchema,
  paymentState: z.literal('succeeded'),
  intentState: z.literal('paid'),
  bookingId: boundedIdSchema,
} as const;

export const trustedPaymentValueDeliveryResultSchema = z.discriminatedUnion('outcome', [
  z.object({
    ...deliveredBookingResultShape,
    outcome: z.literal('confirmed'),
  }).strict(),
  z.object({
    ...deliveredBookingResultShape,
    outcome: z.literal('paid_pending_owner'),
  }).strict(),
  z.object({
    eventId: boundedIdSchema,
    paymentId: boundedIdSchema,
    intentId: boundedIdSchema,
    outcome: z.literal('paid_conflict'),
    paymentState: z.literal('succeeded'),
    intentState: z.literal('paid_conflict'),
    caseId: boundedIdSchema,
  }).strict(),
]);
export type TrustedPaymentValueDeliveryResult = z.infer<typeof trustedPaymentValueDeliveryResultSchema>;

export const initializeBookingPaymentDataSchema = z.object({
  intentId: boundedIdSchema,
}).strict();
export type InitializeBookingPaymentData = z.infer<typeof initializeBookingPaymentDataSchema>;

export const initializeBookingPaymentCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: initializeBookingPaymentDataSchema,
}).strict();
export type InitializeBookingPaymentCommand = z.infer<typeof initializeBookingPaymentCommandSchema>;

export const initializeBookingPaymentResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    intentId: boundedIdSchema,
    paymentId: boundedIdSchema,
    provider: paymentProviderSchema,
    reference: paymentReferenceSchema,
    authorizationUrl: z.string().url().max(2_048),
    accessCode: z.string().trim().min(1).max(256),
    environment: paymentEnvironmentSchema,
    currency: z.literal('NGN'),
    amountKobo: paymentAmountKoboSchema,
    state: z.literal('pending'),
    holdExpiresAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type InitializeBookingPaymentResult = z.infer<typeof initializeBookingPaymentResultSchema>;

export const reconcilePaymentDataSchema = z.object({
  intentId: boundedIdSchema,
}).strict();
export type ReconcilePaymentData = z.infer<typeof reconcilePaymentDataSchema>;

export const reconcilePaymentCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: reconcilePaymentDataSchema,
}).strict();
export type ReconcilePaymentCommand = z.infer<typeof reconcilePaymentCommandSchema>;

export const reconcilePaymentResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    eventId: boundedIdSchema,
    intentId: boundedIdSchema,
    paymentId: boundedIdSchema,
    paymentState: z.enum(['pending', 'succeeded']),
    providerStatus: paystackTransactionStatusSchema,
    verification: paymentVerificationOutcomeSchema,
    valueDeliveryOutcome: paymentValueDeliveryOutcomeSchema.optional(),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (!value.result.valueDeliveryOutcome) return;
  if (
    value.result.paymentState !== 'succeeded' ||
    value.result.providerStatus !== 'success' ||
    value.result.verification !== 'verified_success'
  ) {
    context.addIssue({
      code: 'custom',
      path: ['result', 'valueDeliveryOutcome'],
      message: 'Value delivery requires a verified successful payment.',
    });
  }
});
export type ReconcilePaymentResult = z.infer<typeof reconcilePaymentResultSchema>;

export const paymentGatewayInitializeInputSchema = z.object({
  reference: paymentReferenceSchema,
  email: emailAddressSchema,
  amountKobo: paymentAmountKoboSchema,
  currency: z.literal('NGN'),
  callbackUrl: z.string().url().max(2_048).optional(),
  metadata: z.object({
    intentId: boundedIdSchema,
  }).strict(),
}).strict();
export type PaymentGatewayInitializeInput = z.infer<typeof paymentGatewayInitializeInputSchema>;

export const paymentGatewayInitializeResultSchema = z.object({
  provider: paymentProviderSchema,
  reference: paymentReferenceSchema,
  authorizationUrl: z.string().url().max(2_048),
  accessCode: z.string().trim().min(1).max(256),
  environment: paymentEnvironmentSchema,
}).strict();
export type PaymentGatewayInitializeResult = z.infer<typeof paymentGatewayInitializeResultSchema>;

export const paymentGatewayVerifyInputSchema = z.object({
  reference: paymentReferenceSchema,
}).strict();
export type PaymentGatewayVerifyInput = z.infer<typeof paymentGatewayVerifyInputSchema>;

export const paymentGatewayVerifyResultSchema = z.object({
  provider: paymentProviderSchema,
  reference: paymentReferenceSchema,
  providerStatus: paystackTransactionStatusSchema,
  environment: paymentEnvironmentSchema,
  amountKobo: paymentAmountKoboSchema,
  currency: currencyCodeSchema,
  paidAtIso: isoDateTimeSchema.optional(),
  gatewayResponse: z.string().trim().max(500).optional(),
}).strict();
export type PaymentGatewayVerifyResult = z.infer<typeof paymentGatewayVerifyResultSchema>;
