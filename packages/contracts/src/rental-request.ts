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
} from '@mmg/contracts';

export const RENTAL_REQUEST_STATES = [
  'requested',
  'approved',
  'ready_for_payment',
  'cancellation_requested',
  'cancelled_by_renter',
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

/**
 * Approximate rectangular operational service envelope for Lagos metropolitan rentals.
 * Note: This bounding box is an approximate service envelope for operational feasibility,
 * not an exact administrative polygon of Lagos State.
 */
export const LAGOS_SERVICE_ENVELOPE = {
  minLatitude: 6.30,
  maxLatitude: 6.75,
  minLongitude: 2.70,
  maxLongitude: 4.30,
} as const;

export const pickupLatitudeSchema = z
  .number()
  .min(LAGOS_SERVICE_ENVELOPE.minLatitude, 'Pickup latitude is outside the Lagos service envelope.')
  .max(LAGOS_SERVICE_ENVELOPE.maxLatitude, 'Pickup latitude is outside the Lagos service envelope.');

export const pickupLongitudeSchema = z
  .number()
  .min(LAGOS_SERVICE_ENVELOPE.minLongitude, 'Pickup longitude is outside the Lagos service envelope.')
  .max(LAGOS_SERVICE_ENVELOPE.maxLongitude, 'Pickup longitude is outside the Lagos service envelope.');

export const pickupLocationSnapshotSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  formattedAddress: z.string().trim().min(1).max(300),
  latitude: pickupLatitudeSchema,
  longitude: pickupLongitudeSchema,
  placeId: z.string().trim().min(1).max(200).optional(),
  serviceAreaLabel: rentalRequestServiceAreaSchema,
}).strict();
export type PickupLocationSnapshot = z.infer<typeof pickupLocationSnapshotSchema>;

export const createRentalRequestDataSchema = z.object({
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  contactPhone: rentalRequestContactPhoneSchema,
  serviceAreaLabel: rentalRequestServiceAreaSchema,
  pickupLocation: pickupLocationSnapshotSchema.optional(),
}).strict().superRefine((data, ctx) => {
  if (data.pickupLocation && data.pickupLocation.serviceAreaLabel !== data.serviceAreaLabel) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pickup location service area must match rental request service area.',
      path: ['pickupLocation', 'serviceAreaLabel'],
    });
  }
});
export type CreateRentalRequestData = z.infer<typeof createRentalRequestDataSchema>;

export const createRentalRequestCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: createRentalRequestDataSchema,
}).strict();
export type CreateRentalRequestCommand = z.infer<typeof createRentalRequestCommandSchema>;

// Deliberately contains no renterId, ownerId, staff IDs, contact data, precise
// address, decline reason, internal notes, or audit metadata. Mobile request
// views are server projections rather than raw Firestore documents.
const clientProjectionShape = {
  requestId: boundedIdSchema,
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
  cancellationRequestedAt: isoDateTimeSchema.optional(),
  cancelledAt: isoDateTimeSchema.optional(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
} as const;

function addProjectionRules(value: Record<string, unknown>, context: z.RefinementCtx): void {
  if (value.state === 'ready_for_payment') {
    if (!value.intentId || !value.holdExpiresAt || !value.authoritativePriceSnapshot) {
      context.addIssue({ code: 'custom', message: 'Ready-for-payment requests require intent, expiry and authoritative price.' });
    }
  }
  if (value.state === 'cancellation_requested' && !value.intentId) {
    context.addIssue({ code: 'custom', message: 'In-flight cancellation requests require an intentId.' });
  }
  if (value.state === 'cancelled_by_renter' && !value.cancelledAt) {
    context.addIssue({ code: 'custom', message: 'Cancelled requests require cancelledAt.' });
  }
  if (value.state === 'confirmed' && !value.bookingId) {
    context.addIssue({ code: 'custom', message: 'Confirmed requests require a bookingId.' });
  }
}

export const ownerVisibleRentalRequestSchema = z
  .object(clientProjectionShape)
  .strict()
  .superRefine(addProjectionRules);
export type OwnerVisibleRentalRequest = z.infer<typeof ownerVisibleRentalRequestSchema>;

export const renterVisibleRentalRequestSchema = z
  .object({
    ...clientProjectionShape,
    pickupLocation: pickupLocationSnapshotSchema.optional(),
  })
  .strict()
  .superRefine(addProjectionRules);
export type RenterVisibleRentalRequest = z.infer<typeof renterVisibleRentalRequestSchema>;

export const listOwnerRentalRequestsCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
}).strict();
export type ListOwnerRentalRequestsCommand = z.infer<typeof listOwnerRentalRequestsCommandSchema>;

export const listOwnerRentalRequestsResultSchema = z.object({
  requests: z.array(ownerVisibleRentalRequestSchema).max(200),
}).strict();
export type ListOwnerRentalRequestsResult = z.infer<typeof listOwnerRentalRequestsResultSchema>;

export const listRenterRentalRequestsCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
}).strict();
export type ListRenterRentalRequestsCommand = z.infer<typeof listRenterRentalRequestsCommandSchema>;

export const listRenterRentalRequestsResultSchema = z.object({
  requests: z.array(renterVisibleRentalRequestSchema).max(200),
}).strict();
export type ListRenterRentalRequestsResult = z.infer<typeof listRenterRentalRequestsResultSchema>;

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
    pickupLocation: pickupLocationSnapshotSchema.optional(),
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
    state: z.literal('approved'),
    version: z.number().int().positive(),
    approvedAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type ApproveRentalRequestResult = z.infer<typeof approveRentalRequestResultSchema>;

export const openRentalRequestPaymentWindowDataSchema = z.object({
  requestId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();
export const openRentalRequestPaymentWindowCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: openRentalRequestPaymentWindowDataSchema,
}).strict();
export type OpenRentalRequestPaymentWindowCommand = z.infer<typeof openRentalRequestPaymentWindowCommandSchema>;

export const openRentalRequestPaymentWindowResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    requestId: boundedIdSchema,
    state: z.literal('ready_for_payment'),
    version: z.number().int().positive(),
    intentId: boundedIdSchema,
    holdExpiresAt: isoDateTimeSchema,
    authoritativePriceSnapshot: priceSnapshotSchema,
    openedAt: isoDateTimeSchema,
  }).strict(),
}).strict();
export type OpenRentalRequestPaymentWindowResult = z.infer<typeof openRentalRequestPaymentWindowResultSchema>;

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

export const releaseRentalRequestPaymentHoldDataSchema = z.object({ requestId: boundedIdSchema }).strict();
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
