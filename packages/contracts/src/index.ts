import { z } from 'zod';

export type AccountType = 'renter' | 'owner';

export const emailAddressSchema = z.string().trim().max(254, 'Email address is too long.').email('Enter a valid email address.').transform((email) => email.toLowerCase());
export const passwordSchema = z.string().min(8, 'Use at least 8 characters.').max(128, 'Password is too long.');
export const emailPasswordSignInSchema = z.object({ email: emailAddressSchema, password: passwordSchema });
export const emailPasswordRegistrationSchema = emailPasswordSignInSchema.extend({ displayName: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name is too long.') });

export type EmailPasswordSignIn = z.infer<typeof emailPasswordSignInSchema>;
export type EmailPasswordRegistration = z.infer<typeof emailPasswordRegistrationSchema>;

export type SessionUser = { uid: string; accountType: AccountType; displayName: string };
export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };
export interface AuthGateway { getCurrentSession(): Promise<SessionState>; }

export type VehicleCategory = 'executive_suv' | 'executive_sedan';
export type VehicleSummary = {
  id: string;
  displayName: string;
  category: VehicleCategory;
  areaLabel: string;
  seats: number;
  dailyRateKobo: number;
  distanceKm: number;
  chauffeurPolicy: 'included';
  deliveryPolicy: 'included';
  imageKey: 'hero-suv' | 'pearl-suv' | 'graphite-sedan';
};
export type VehicleSearchCriteria = { areaLabel?: string; category?: VehicleCategory; query?: string };
export interface DiscoveryGateway {
  getFeaturedVehicles(): Promise<readonly VehicleSummary[]>;
  searchVehicles(criteria: VehicleSearchCriteria): Promise<readonly VehicleSummary[]>;
}

export const schemaVersionSchema = z.literal(1);
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(16, 'Idempotency key is too short.')
  .max(128, 'Idempotency key is too long.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Idempotency key contains unsupported characters.');

export const canonicalErrorCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'FAILED_PRECONDITION',
  'ALREADY_EXISTS',
  'IDEMPOTENCY_CONFLICT',
  'VEHICLE_UNAVAILABLE',
  'CONFIGURATION_UNAVAILABLE',
  'INTERNAL',
]);
export type CanonicalErrorCode = z.infer<typeof canonicalErrorCodeSchema>;

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD calendar date.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day;
  }, 'Enter a real calendar date.');

const safeKoboSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const basisPointsSchema = z.number().int().min(0).max(10_000);

export const bookingIntentStateSchema = z.enum([
  'intent_created',
  'checkout_pending',
  'paid',
  'expired',
  'failed',
  'invalid',
  'paid_conflict',
]);
export type BookingIntentState = z.infer<typeof bookingIntentStateSchema>;

export const paidBookingStateSchema = z.enum([
  'paid_pending_owner',
  'confirmed',
  'intervention_required',
  'cancelled',
  'refund_pending',
  'refunded',
  'in_progress',
  'completed',
]);
export type PaidBookingState = z.infer<typeof paidBookingStateSchema>;

export const priceSnapshotSchema = z.object({
  currency: z.literal('NGN'),
  chargedDays: z.number().int().min(1).max(365),
  ownerDailyRateKobo: safeKoboSchema,
  baseRentalKobo: safeKoboSchema,
  deliveryFeeKobo: safeKoboSchema,
  serviceFeeBps: basisPointsSchema,
  serviceFeeFixedKobo: safeKoboSchema,
  serviceFeeKobo: safeKoboSchema,
  ownerCommissionBps: basisPointsSchema,
  ownerCommissionKobo: safeKoboSchema,
  ownerEarningsKobo: safeKoboSchema,
  renterTotalKobo: safeKoboSchema,
  configVersion: z.string().trim().min(1).max(64),
  termsVersion: z.string().trim().min(1).max(64),
  cancellationPolicyVersion: z.string().trim().min(1).max(64),
}).strict();
export type PriceSnapshot = z.infer<typeof priceSnapshotSchema>;

export const renterVehicleSnapshotSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  areaLabel: z.string().trim().min(1).max(120),
  categoryLabel: z.string().trim().min(1).max(80),
  imageKey: z.enum(['hero-suv', 'pearl-suv', 'graphite-sedan']).optional(),
  imageUrl: z.string().url().max(2_048).optional(),
}).strict();
export type RenterVehicleSnapshot = z.infer<typeof renterVehicleSnapshotSchema>;

export const createBookingIntentDataSchema = z.object({
  vehicleId: z.string().trim().min(1).max(128),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
}).strict();
export type CreateBookingIntentData = z.infer<typeof createBookingIntentDataSchema>;

export const createBookingIntentCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: createBookingIntentDataSchema,
}).strict();
export type CreateBookingIntentCommand = z.infer<typeof createBookingIntentCommandSchema>;

export const createBookingIntentResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    intentId: z.string().min(1).max(128),
    state: z.literal('intent_created'),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    expiresAt: z.string().datetime({ offset: true }),
    priceSnapshot: priceSnapshotSchema,
    vehicleSnapshot: renterVehicleSnapshotSchema,
  }).strict(),
}).strict();
export type CreateBookingIntentResult = z.infer<typeof createBookingIntentResultSchema>;

export const bookingTimelineEventSchema = z.object({
  id: z.string().min(1).max(128),
  actorType: z.enum(['system', 'renter', 'owner', 'admin', 'provider']),
  eventType: z.string().trim().min(1).max(80),
  occurredAt: z.string().datetime({ offset: true }),
  fromState: z.string().max(80).nullable(),
  toState: z.string().max(80),
}).strict();
export type BookingTimelineEvent = z.infer<typeof bookingTimelineEventSchema>;

const isoDateTimeSchema = z.string().datetime({ offset: true });
const boundedIdSchema = z.string().trim().min(1).max(128);

export const renterVisibleBookingIntentSchema = z.object({
  id: boundedIdSchema,
  renterId: boundedIdSchema,
  ownerId: boundedIdSchema,
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: bookingIntentStateSchema,
  priceSnapshot: priceSnapshotSchema,
  vehicleSnapshot: renterVehicleSnapshotSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema,
});
export type RenterVisibleBookingIntent = z.infer<typeof renterVisibleBookingIntentSchema>;

export const renterVisibleBookingSchema = z.object({
  id: boundedIdSchema,
  intentId: boundedIdSchema.optional(),
  renterId: boundedIdSchema,
  ownerId: boundedIdSchema,
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: paidBookingStateSchema,
  priceSnapshot: priceSnapshotSchema,
  vehicleSnapshot: renterVehicleSnapshotSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type RenterVisibleBooking = z.infer<typeof renterVisibleBookingSchema>;

export type BookingRequestStatus =
  | 'availability_requested'
  | 'confirmed'
  | 'payment_required'
  | 'booked';
export type BookingRequest = {
  id: string;
  userId: string;
  vehicleId: string;
  durationDays: number;
  pickupAt: string;
  returnAt: string;
  dailyRateKobo: number;
  totalKobo: number;
  status: BookingRequestStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateBookingRequestInput = Omit<
  BookingRequest,
  'createdAt' | 'id' | 'status' | 'updatedAt' | 'userId'
>;
