import { z } from 'zod';

import {
  boundedIdSchema,
  dateOnlySchema,
  idempotencyKeySchema,
  isoDateTimeSchema,
  safeKoboSchema,
  schemaVersionSchema,
} from '@mmg/contracts';

export const ownerEarningStateSchema = z.enum([
  'pending',
  'available',
  'review_required',
]);
export type OwnerEarningState = z.infer<typeof ownerEarningStateSchema>;

export const ownerEarningVehicleSnapshotSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
}).strict();
export type OwnerEarningVehicleSnapshot = z.infer<typeof ownerEarningVehicleSnapshotSchema>;

export const ownerEarningSchema = z.object({
  bookingId: boundedIdSchema,
  ownerId: boundedIdSchema,
  vehicleId: boundedIdSchema,
  amountKobo: safeKoboSchema,
  currency: z.literal('NGN'),
  state: ownerEarningStateSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  vehicleSnapshot: ownerEarningVehicleSnapshotSchema,
  createdAt: isoDateTimeSchema,
  availableAt: isoDateTimeSchema.optional().nullable(),
  reviewReason: z.string().max(256).optional().nullable(),
  updatedAt: isoDateTimeSchema,
  version: z.number().int().positive(),
}).strict();
export type OwnerEarning = z.infer<typeof ownerEarningSchema>;

export const ownerSettlementStateSchema = z.object({
  ownerId: boundedIdSchema,
  pendingKobo: safeKoboSchema,
  availableKobo: safeKoboSchema,
  reservedKobo: safeKoboSchema,
  activePayoutId: boundedIdSchema.nullable(),
  settlementHold: z.boolean(),
  holdReason: z.string().max(256).optional().nullable(),
  version: z.number().int().positive(),
  updatedAt: isoDateTimeSchema,
}).strict();
export type OwnerSettlementState = z.infer<typeof ownerSettlementStateSchema>;

export const reportTripEndedDataSchema = z.object({
  bookingId: boundedIdSchema,
}).strict();
export type ReportTripEndedData = z.infer<typeof reportTripEndedDataSchema>;

export const reportTripEndedCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: reportTripEndedDataSchema,
}).strict();
export type ReportTripEndedCommand = z.infer<typeof reportTripEndedCommandSchema>;

export const reportTripEndedResultSchema = z.object({
  bookingId: boundedIdSchema,
  state: z.literal('completion_pending'),
  version: z.number().int().positive(),
}).strict();
export type ReportTripEndedResult = z.infer<typeof reportTripEndedResultSchema>;

export const confirmBookingCompletionDataSchema = z.object({
  bookingId: boundedIdSchema,
}).strict();
export type ConfirmBookingCompletionData = z.infer<typeof confirmBookingCompletionDataSchema>;

export const confirmBookingCompletionCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: confirmBookingCompletionDataSchema,
}).strict();
export type ConfirmBookingCompletionCommand = z.infer<typeof confirmBookingCompletionCommandSchema>;

export const confirmBookingCompletionResultSchema = z.object({
  bookingId: boundedIdSchema,
  bookingState: z.literal('completed'),
  earningState: z.enum(['available', 'review_required']),
  amountKobo: safeKoboSchema,
  version: z.number().int().positive(),
}).strict();
export type ConfirmBookingCompletionResult = z.infer<typeof confirmBookingCompletionResultSchema>;

export const setOwnerSettlementHoldDataSchema = z.object({
  ownerId: boundedIdSchema,
  hold: z.boolean(),
  reason: z.string().max(256).optional(),
}).strict();
export type SetOwnerSettlementHoldData = z.infer<typeof setOwnerSettlementHoldDataSchema>;

export const setOwnerSettlementHoldCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: setOwnerSettlementHoldDataSchema,
}).strict();
export type SetOwnerSettlementHoldCommand = z.infer<typeof setOwnerSettlementHoldCommandSchema>;

export const setOwnerSettlementHoldResultSchema = z.object({
  ownerId: boundedIdSchema,
  settlementHold: z.boolean(),
  version: z.number().int().positive(),
}).strict();
export type SetOwnerSettlementHoldResult = z.infer<typeof setOwnerSettlementHoldResultSchema>;

export const reportTripEndedEnvelopeSchema = z.object({
  requestId: boundedIdSchema,
  result: reportTripEndedResultSchema,
}).strict();
export type ReportTripEndedEnvelope = z.infer<typeof reportTripEndedEnvelopeSchema>;
export const reportTripEndedResultEnvelopeSchema = reportTripEndedEnvelopeSchema;
export type ReportTripEndedResultEnvelope = ReportTripEndedEnvelope;

export const confirmBookingCompletionEnvelopeSchema = z.object({
  requestId: boundedIdSchema,
  result: confirmBookingCompletionResultSchema,
}).strict();
export type ConfirmBookingCompletionEnvelope = z.infer<typeof confirmBookingCompletionEnvelopeSchema>;
export const confirmBookingCompletionResultEnvelopeSchema = confirmBookingCompletionEnvelopeSchema;
export type ConfirmBookingCompletionResultEnvelope = ConfirmBookingCompletionEnvelope;

export const setOwnerSettlementHoldEnvelopeSchema = z.object({
  requestId: boundedIdSchema,
  result: setOwnerSettlementHoldResultSchema,
}).strict();
export type SetOwnerSettlementHoldEnvelope = z.infer<typeof setOwnerSettlementHoldEnvelopeSchema>;
export const setOwnerSettlementHoldResultEnvelopeSchema = setOwnerSettlementHoldEnvelopeSchema;
export type SetOwnerSettlementHoldResultEnvelope = SetOwnerSettlementHoldEnvelope;
