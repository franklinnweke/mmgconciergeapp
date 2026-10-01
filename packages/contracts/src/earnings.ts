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
  idempotencyKey: idempotencyKeySchema.optional(),
  data: reportTripEndedDataSchema,
}).strict();
export type ReportTripEndedCommand = z.infer<typeof reportTripEndedCommandSchema>;

export const confirmBookingCompletionDataSchema = z.object({
  bookingId: boundedIdSchema,
}).strict();
export type ConfirmBookingCompletionData = z.infer<typeof confirmBookingCompletionDataSchema>;

export const confirmBookingCompletionCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema.optional(),
  data: confirmBookingCompletionDataSchema,
}).strict();
export type ConfirmBookingCompletionCommand = z.infer<typeof confirmBookingCompletionCommandSchema>;

export const setOwnerSettlementHoldDataSchema = z.object({
  ownerId: boundedIdSchema,
  hold: z.boolean(),
  reason: z.string().max(256).optional(),
}).strict();
export type SetOwnerSettlementHoldData = z.infer<typeof setOwnerSettlementHoldDataSchema>;

export const setOwnerSettlementHoldCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema.optional(),
  data: setOwnerSettlementHoldDataSchema,
}).strict();
export type SetOwnerSettlementHoldCommand = z.infer<typeof setOwnerSettlementHoldCommandSchema>;
