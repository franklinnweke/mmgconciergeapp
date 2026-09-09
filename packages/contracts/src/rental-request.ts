import { z } from 'zod';

import {
  LAGOS_AREA_LABELS,
  boundedIdSchema,
  dateOnlySchema,
  idempotencyKeySchema,
  isoDateTimeSchema,
  priceSnapshotSchema,
  renterVehicleSnapshotSchema,
  schemaVersionSchema,
} from './index.js';

export const RENTAL_REQUEST_STATES = [
  'requested',
  'ready_for_payment',
  'declined',
  'payment_window_expired',
  'confirmed',
  'needs_attention',
] as const;

export const rentalRequestStateSchema = z.enum(RENTAL_REQUEST_STATES);
export type RentalRequestState = z.infer<typeof rentalRequestStateSchema>;

export const rentalRequestContactPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+234\d{10}$/, 'Enter a valid Nigerian mobile number.');

export const rentalRequestServiceAreaSchema = z.enum(LAGOS_AREA_LABELS);

export const createRentalRequestDataSchema = z.object({
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  contactPhone: rentalRequestContactPhoneSchema,
  serviceAreaLabel: rentalRequestServiceAreaSchema,
}).strict();
export type CreateRentalRequestData = z.infer<typeof createRentalRequestDataSchema>;

export const createRentalRequestCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: createRentalRequestDataSchema,
}).strict();
export type CreateRentalRequestCommand = z.infer<typeof createRentalRequestCommandSchema>;

const rentalRequestProjectionBase = z.object({
  requestId: boundedIdSchema,
  ownerId: boundedIdSchema,
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  serviceAreaLabel: rentalRequestServiceAreaSchema,
  state: rentalRequestStateSchema,
  version: z.number().int().positive(),
  estimatedPriceSnapshot: priceSnapshotSchema,
  authoritativePriceSnapshot: priceSnapshotSchema.optional(),
  vehicleSnapshot: renterVehicleSnapshotSchema,
  intentId: boundedIdSchema.optional(),
  holdExpiresAt: isoDateTimeSchema.optional(),
  bookingId: boundedIdSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).superRefine((value, context) => {
  if (value.state === 'ready_for_payment') {
    if (!value.intentId || !value.holdExpiresAt || !value.authoritativePriceSnapshot) {
      context.addIssue({
        code: 'custom',
        message: 'Ready-for-payment requests require a linked intent, expiry, and authoritative price.',
      });
    }
  }
  if (value.state === 'confirmed' && !value.bookingId) {
    context.addIssue({ code: 'custom', message: 'Confirmed requests require a bookingId.' });
  }
});

export const renterVisibleRentalRequestSchema = rentalRequestProjectionBase.extend({
  renterId: boundedIdSchema,
});
export type RenterVisibleRentalRequest = z.infer<typeof renterVisibleRentalRequestSchema>;

// Deliberately omits renterId and all contact fields. Zod strips unknown keys,
// so owners receive only the operational request projection.
export const ownerVisibleRentalRequestSchema = rentalRequestProjectionBase;
export type OwnerVisibleRentalRequest = z.infer<typeof ownerVisibleRentalRequestSchema>;

export const createRentalRequestResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    requestId: boundedIdSchema,
    state: z.literal('requested'),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    serviceAreaLabel: rentalRequestServiceAreaSchema,
    estimatedPriceSnapshot: priceSnapshotSchema,
    vehicleSnapshot: renterVehicleSnapshotSchema,
    version: z.literal(1),
    createdAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type CreateRentalRequestResult = z.infer<typeof createRentalRequestResultSchema>;

export const approveRentalRequestDataSchema = z.object({
  requestId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();
export const approveRentalRequestCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: approveRentalRequestDataSchema,
}).strict();
export type ApproveRentalRequestCommand = z.infer<typeof approveRentalRequestCommandSchema>;

export const approveRentalRequestResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    requestId: boundedIdSchema,
    state: z.literal('ready_for_payment'),
    version: z.number().int().positive(),
    intentId: boundedIdSchema,
    holdExpiresAt: isoDateTimeSchema,
    authoritativePriceSnapshot: priceSnapshotSchema,
    approvedAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type ApproveRentalRequestResult = z.infer<typeof approveRentalRequestResultSchema>;

export const declineRentalRequestDataSchema = z.object({
  requestId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();
export const declineRentalRequestCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: declineRentalRequestDataSchema,
}).strict();
export type DeclineRentalRequestCommand = z.infer<typeof declineRentalRequestCommandSchema>;

export const declineRentalRequestResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    requestId: boundedIdSchema,
    state: z.literal('declined'),
    version: z.number().int().positive(),
    declinedAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type DeclineRentalRequestResult = z.infer<typeof declineRentalRequestResultSchema>;

export const releaseRentalRequestPaymentHoldDataSchema = z.object({
  requestId: boundedIdSchema,
}).strict();
export const releaseRentalRequestPaymentHoldCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: releaseRentalRequestPaymentHoldDataSchema,
}).strict();
export type ReleaseRentalRequestPaymentHoldCommand = z.infer<typeof releaseRentalRequestPaymentHoldCommandSchema>;

export const releaseRentalRequestPaymentHoldResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    requestId: boundedIdSchema,
    state: z.literal('payment_window_expired'),
    version: z.number().int().positive(),
    releasedAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type ReleaseRentalRequestPaymentHoldResult = z.infer<typeof releaseRentalRequestPaymentHoldResultSchema>;
