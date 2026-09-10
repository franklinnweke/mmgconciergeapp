import { z } from 'zod';

import {
  boundedIdSchema,
  dateOnlySchema,
  idempotencyKeySchema,
  isoDateTimeSchema,
  schemaVersionSchema,
} from '@mmg/contracts';

export const cancellationFinancialOutcomeSchema = z.literal('manual_review_required');
export type CancellationFinancialOutcome = z.infer<typeof cancellationFinancialOutcomeSchema>;

export const cancelRentalRequestDataSchema = z.object({
  requestId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();
export type CancelRentalRequestData = z.infer<typeof cancelRentalRequestDataSchema>;

export const cancelRentalRequestCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: cancelRentalRequestDataSchema,
}).strict();
export type CancelRentalRequestCommand = z.infer<typeof cancelRentalRequestCommandSchema>;

export const cancelRentalRequestResultSchema = z.discriminatedUnion('state', [
  z.object({
    requestId: boundedIdSchema,
    state: z.literal('cancelled_by_renter'),
    version: z.number().int().positive(),
    cancelledAt: isoDateTimeSchema,
    inventoryReleased: z.boolean(),
  }).strict(),
  z.object({
    requestId: boundedIdSchema,
    state: z.literal('cancellation_requested'),
    version: z.number().int().positive(),
    cancellationRequestedAt: isoDateTimeSchema,
    inventoryReleased: z.literal(false),
  }).strict(),
]);
export type CancelRentalRequestResult = z.infer<typeof cancelRentalRequestResultSchema>;

export const quoteBookingCancellationDataSchema = z.object({
  bookingId: boundedIdSchema,
}).strict();
export type QuoteBookingCancellationData = z.infer<typeof quoteBookingCancellationDataSchema>;

export const quoteBookingCancellationCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  data: quoteBookingCancellationDataSchema,
}).strict();
export type QuoteBookingCancellationCommand = z.infer<typeof quoteBookingCancellationCommandSchema>;

export const bookingCancellationQuoteSchema = z.object({
  bookingId: boundedIdSchema,
  bookingState: z.enum(['paid_pending_owner', 'confirmed', 'intervention_required', 'in_progress']),
  startDate: dateOnlySchema,
  amountPaidKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.literal('NGN'),
  cancellationPolicyVersion: z.string().trim().min(1).max(64),
  financialOutcome: cancellationFinancialOutcomeSchema,
  estimatedRefundKobo: z.null(),
  estimatedCancellationFeeKobo: z.null(),
  selfServiceAllowed: z.boolean(),
  inventoryAction: z.enum(['release_on_confirmation', 'manual_review']),
  consequenceText: z.string().trim().min(1).max(500),
}).strict();
export type BookingCancellationQuote = z.infer<typeof bookingCancellationQuoteSchema>;

export const quoteBookingCancellationResultSchema = z.object({
  quote: bookingCancellationQuoteSchema,
}).strict();
export type QuoteBookingCancellationResult = z.infer<typeof quoteBookingCancellationResultSchema>;

export const cancelBookingDataSchema = z.object({
  bookingId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();
export type CancelBookingData = z.infer<typeof cancelBookingDataSchema>;

export const cancelBookingCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: cancelBookingDataSchema,
}).strict();
export type CancelBookingCommand = z.infer<typeof cancelBookingCommandSchema>;

export const cancelBookingResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    bookingId: boundedIdSchema,
    state: z.enum(['refund_pending', 'intervention_required']),
    version: z.number().int().positive(),
    caseId: boundedIdSchema,
    cancelledAt: isoDateTimeSchema,
    cancellationPolicyVersion: z.string().trim().min(1).max(64),
    amountPaidKobo: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    financialOutcome: cancellationFinancialOutcomeSchema,
    inventoryReleased: z.boolean(),
  }).strict(),
}).strict();
export type CancelBookingResult = z.infer<typeof cancelBookingResultSchema>;
