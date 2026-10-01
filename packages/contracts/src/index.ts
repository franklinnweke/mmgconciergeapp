import { z } from 'zod';

export const accountTypeSchema = z.enum(['renter', 'owner']);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const emailAddressSchema = z.string().trim().max(254, 'Email address is too long.').email('Enter a valid email address.').transform((email) => email.toLowerCase());
export const passwordSchema = z.string().min(8, 'Use at least 8 characters.').max(128, 'Password is too long.');
export const emailPasswordSignInSchema = z.object({ email: emailAddressSchema, password: passwordSchema });
export const emailPasswordRegistrationSchema = emailPasswordSignInSchema.extend({ displayName: z.string().trim().min(2, 'Enter your full name.').max(80, 'Name is too long.') });

export const accountProfileSchema = z.object({
  uid: z.string().trim().min(1).max(128),
  accountType: accountTypeSchema,
  displayName: z.string().trim().min(2).max(80),
  email: emailAddressSchema,
}).strict();
export type AccountProfile = z.infer<typeof accountProfileSchema>;

export type EmailPasswordSignIn = z.infer<typeof emailPasswordSignInSchema>;
export type EmailPasswordRegistration = z.infer<typeof emailPasswordRegistrationSchema>;

export type SessionUser = { uid: string; accountType: AccountType; displayName: string };
export type SessionState = { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };
export interface AuthGateway { getCurrentSession(): Promise<SessionState>; }

export type VehicleCategory = 'executive_suv' | 'executive_sedan';

export type VehicleSummaryImageKey = 'hero-suv' | 'pearl-suv' | 'prado-graphite' | 'graphite-sedan';

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
  imageKey?: VehicleSummaryImageKey;
  imageUrl?: string;
  imageUrls?: readonly string[];
  primaryImageUrl?: string;
  description?: string;
  year?: number;
  make?: string;
  model?: string;
};
export type VehicleSearchCriteria = {
  areaLabel?: string;
  category?: VehicleCategory;
  query?: string;
  startDate?: string;
  endDate?: string;
  minSeats?: number;
  minDailyRateKobo?: number;
  maxDailyRateKobo?: number;
  features?: readonly string[];
  originLat?: number;
  originLng?: number;
  radiusKm?: number;
};

export interface DiscoveryGateway {
  getFeaturedVehicles(): Promise<readonly VehicleSummary[]>;
  searchVehicles(criteria: VehicleSearchCriteria): Promise<readonly VehicleSummary[]>;
  getVehicleById(vehicleId: string): Promise<VehicleSummary | null>;
  resolveSearchPlace?(query: string): Promise<{
    placeId: string;
    areaLabel: string;
    displayName: string;
    approxLatitude: number;
    approxLongitude: number;
    withinLagos: boolean;
  }>;
  searchPickupPlaces?(input: { query: string; sessionToken?: string }): Promise<{
    suggestions: readonly {
      placeId: string;
      primaryText: string;
      secondaryText?: string;
    }[];
  }>;
  resolvePickupPlace?(input: { placeId: string; sessionToken?: string }): Promise<{
    placeId: string;
    displayName: string;
    formattedAddress: string;
    latitude: number;
    longitude: number;
    serviceAreaLabel: LagosAreaLabel;
  }>;
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
  'INVALID_STATE_TRANSITION',
  'PROFILE_INCOMPLETE',
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

export const safeKoboSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
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
  'completion_pending',
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
  imageKey: z.enum(['hero-suv', 'pearl-suv', 'prado-graphite', 'graphite-sedan']).optional(),
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

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const boundedIdSchema = z.string().trim().min(1).max(128);

export const availabilityBlockReasonSchema = z.enum([
  'maintenance',
  'owner_use',
  'offline',
  'other',
]);
export type AvailabilityBlockReason = z.infer<typeof availabilityBlockReasonSchema>;

export const setVehicleAvailabilityBlockDataSchema = z.object({
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  reason: availabilityBlockReasonSchema,
  notes: z.string().trim().min(1).max(500).optional(),
  expectedAvailabilityVersion: z.number().int().nonnegative(),
}).strict();
export type SetVehicleAvailabilityBlockData = z.infer<typeof setVehicleAvailabilityBlockDataSchema>;

export const setVehicleAvailabilityBlockCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: setVehicleAvailabilityBlockDataSchema,
}).strict();
export type SetVehicleAvailabilityBlockCommand = z.infer<typeof setVehicleAvailabilityBlockCommandSchema>;

export const ownerAvailabilityBlockSchema = z.object({
  blockId: boundedIdSchema,
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  reason: availabilityBlockReasonSchema,
  notes: z.string().max(500).nullable(),
  version: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();
export type OwnerAvailabilityBlock = z.infer<typeof ownerAvailabilityBlockSchema>;

export const setVehicleAvailabilityBlockResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    block: ownerAvailabilityBlockSchema,
    availabilityVersion: z.number().int().positive(),
  }).strict(),
}).strict();
export type SetVehicleAvailabilityBlockResult = z.infer<typeof setVehicleAvailabilityBlockResultSchema>;

export const removeVehicleAvailabilityBlockDataSchema = z.object({
  vehicleId: boundedIdSchema,
  blockId: boundedIdSchema,
  expectedBlockVersion: z.number().int().positive(),
  expectedAvailabilityVersion: z.number().int().nonnegative(),
}).strict();
export type RemoveVehicleAvailabilityBlockData = z.infer<typeof removeVehicleAvailabilityBlockDataSchema>;

export const removeVehicleAvailabilityBlockCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: removeVehicleAvailabilityBlockDataSchema,
}).strict();
export type RemoveVehicleAvailabilityBlockCommand = z.infer<typeof removeVehicleAvailabilityBlockCommandSchema>;

export const removeVehicleAvailabilityBlockResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    vehicleId: boundedIdSchema,
    blockId: boundedIdSchema,
    removed: z.literal(true),
    availabilityVersion: z.number().int().positive(),
  }).strict(),
}).strict();
export type RemoveVehicleAvailabilityBlockResult = z.infer<typeof removeVehicleAvailabilityBlockResultSchema>;

export const getVehicleCalendarDataSchema = z.object({
  vehicleId: boundedIdSchema,
  windowStartDate: dateOnlySchema,
  windowEndDate: dateOnlySchema,
}).strict();
export type GetVehicleCalendarData = z.infer<typeof getVehicleCalendarDataSchema>;

export const getVehicleCalendarCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  data: getVehicleCalendarDataSchema,
}).strict();
export type GetVehicleCalendarCommand = z.infer<typeof getVehicleCalendarCommandSchema>;

export const renterVehicleCalendarDaySchema = z.object({
  date: dateOnlySchema,
  available: z.boolean(),
}).strict();
export type RenterVehicleCalendarDay = z.infer<typeof renterVehicleCalendarDaySchema>;

export const getVehicleCalendarResultSchema = z.object({
  vehicleId: boundedIdSchema,
  windowStartDate: dateOnlySchema,
  windowEndDate: dateOnlySchema,
  days: z.array(renterVehicleCalendarDaySchema).max(365),
}).strict();
export type GetVehicleCalendarResult = z.infer<typeof getVehicleCalendarResultSchema>;

export const ownerVehicleCalendarDaySchema = z.object({
  date: dateOnlySchema,
  status: z.enum(['available', 'owner_block', 'reserved']),
  ownerBlockId: boundedIdSchema.optional(),
  reason: availabilityBlockReasonSchema.optional(),
}).strict().superRefine((day, context) => {
  if (day.status === 'owner_block' && (!day.ownerBlockId || !day.reason)) {
    context.addIssue({ code: 'custom', message: 'Owner-blocked days require block details.' });
  }
  if (day.status !== 'owner_block' && (day.ownerBlockId || day.reason)) {
    context.addIssue({ code: 'custom', message: 'Only owner-blocked days expose block details.' });
  }
});
export type OwnerVehicleCalendarDay = z.infer<typeof ownerVehicleCalendarDaySchema>;

export const getOwnerVehicleCalendarResultSchema = z.object({
  vehicleId: boundedIdSchema,
  windowStartDate: dateOnlySchema,
  windowEndDate: dateOnlySchema,
  availabilityVersion: z.number().int().nonnegative(),
  days: z.array(ownerVehicleCalendarDaySchema).max(365),
  ownerBlocks: z.array(ownerAvailabilityBlockSchema).max(365),
}).strict();
export type GetOwnerVehicleCalendarResult = z.infer<typeof getOwnerVehicleCalendarResultSchema>;

export const confirmBookingDataSchema = z.object({
  bookingId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();
export type ConfirmBookingData = z.infer<typeof confirmBookingDataSchema>;

export const confirmBookingCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: confirmBookingDataSchema,
}).strict();
export type ConfirmBookingCommand = z.infer<typeof confirmBookingCommandSchema>;

export const confirmBookingResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    bookingId: boundedIdSchema,
    fromState: z.literal('paid_pending_owner'),
    toState: z.literal('confirmed'),
    decidedAt: isoDateTimeSchema,
    version: z.number().int().positive(),
  }).strict(),
}).strict();
export type ConfirmBookingResult = z.infer<typeof confirmBookingResultSchema>;

export const rejectBookingDataSchema = z.object({
  bookingId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(500),
}).strict();
export type RejectBookingData = z.infer<typeof rejectBookingDataSchema>;

export const rejectBookingCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: rejectBookingDataSchema,
}).strict();
export type RejectBookingCommand = z.infer<typeof rejectBookingCommandSchema>;

export const rejectBookingResultSchema = z.object({
  requestId: boundedIdSchema,
  result: z.object({
    bookingId: boundedIdSchema,
    caseId: boundedIdSchema,
    fromState: z.literal('paid_pending_owner'),
    toState: z.literal('intervention_required'),
    decidedAt: isoDateTimeSchema,
    version: z.number().int().positive(),
  }).strict(),
}).strict();
export type RejectBookingResult = z.infer<typeof rejectBookingResultSchema>;

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

/**
 * Owner booking projections intentionally omit renter identity, payment/provider
 * references, private addresses, and availability block identifiers. These are
 * the only booking fields the owner client needs for operations.
 */
export const ownerBookingPriceSnapshotSchema = z.object({
  currency: z.literal('NGN'),
  ownerDailyRateKobo: safeKoboSchema,
  baseRentalKobo: safeKoboSchema,
  ownerCommissionBps: basisPointsSchema,
  ownerEarningsKobo: safeKoboSchema,
}).strict();
export type OwnerBookingPriceSnapshot = z.infer<typeof ownerBookingPriceSnapshotSchema>;

export const ownerVisibleBookingSchema = z.object({
  id: boundedIdSchema,
  vehicleId: boundedIdSchema,
  startDate: dateOnlySchema,
  endDate: dateOnlySchema,
  state: paidBookingStateSchema,
  version: z.number().int().positive(),
  vehicleSnapshot: renterVehicleSnapshotSchema,
  priceSnapshot: ownerBookingPriceSnapshotSchema,
}).strict();
export type OwnerVisibleBooking = z.infer<typeof ownerVisibleBookingSchema>;

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

export const CURRENT_OWNER_TERMS_VERSION = 'owner-terms-2026-09-16';
export const CURRENT_COMMISSION_TERMS_VERSION = 'owner-commission-2026-09-16';
export const CURRENT_PRIVACY_NOTICE_VERSION = 'privacy-notice-2026-09-16';

export const OWNER_VERIFICATION_STATES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
  'revoked',
] as const;

export const LAGOS_AREA_LABELS = [
  'Ikoyi',
  'Victoria Island',
  'Lekki',
  'Lekki Phase 1',
  'Lagos Island',
  'Banana Island',
  'Oniru',
  'Ikeja',
  'Maryland',
  'Ajah',
  'Yaba',
  'Surulere',
] as const;

export const GOVERNMENT_ID_KINDS = [
  'national_id',
  'international_passport',
  'drivers_licence',
  'voters_card',
  'residence_permit',
] as const;

export const OWNER_REVIEW_DECISIONS = [
  'start_review',
  'approve',
  'reject',
  'suspend',
  'restore',
  'revoke',
] as const;

export const OWNER_REVIEW_CHECKLIST_KEYS = [
  'identity_matches_id',
  'document_legible',
  'lagos_address_plausible',
  'current_terms_accepted',
  'no_fraud_indicators',
] as const;

export const STAFF_ROLE_KEYS = [
  'support',
  'vehicle_admin',
  'verification_admin',
  'finance_admin',
  'privacy_admin',
  'super_admin',
] as const;

export const ownerVerificationStatusSchema = z.enum(OWNER_VERIFICATION_STATES);
export type OwnerVerificationStatus = z.infer<typeof ownerVerificationStatusSchema>;
export type OwnerVerificationState = OwnerVerificationStatus;

export const lagosAreaLabelSchema = z.enum(LAGOS_AREA_LABELS);
export type LagosAreaLabel = z.infer<typeof lagosAreaLabelSchema>;

export const governmentIdKindSchema = z.enum(GOVERNMENT_ID_KINDS);
export type GovernmentIdKind = z.infer<typeof governmentIdKindSchema>;

export const ownerReviewDecisionSchema = z.enum(OWNER_REVIEW_DECISIONS);
export type OwnerReviewDecision = z.infer<typeof ownerReviewDecisionSchema>;

export type OwnerReviewChecklistKey = (typeof OWNER_REVIEW_CHECKLIST_KEYS)[number];

export const staffRoleKeySchema = z.enum(STAFF_ROLE_KEYS);
export type StaffRoleKey = z.infer<typeof staffRoleKeySchema>;

export const commandSafeReasonSchema = z.enum([
  'email_unverified',
  'phone_unverified',
  'not_owner',
  'not_staff',
  'upload_invalid',
  'terms_stale',
  'stale_version',
  'not_approved_owner',
  'not_vehicle_owner',
  'listing_incomplete',
  'image_limit',
  'image_dimensions',
  'dates_overlap',
  'not_paid',
]);
export type CommandSafeReason = z.infer<typeof commandSafeReasonSchema>;

// ── Cursor pagination contracts ──

export const cursorSchema = z.string().trim().min(1).max(256);
export type Cursor = z.infer<typeof cursorSchema>;

export const pageSizeSchema = z.number().int().min(1).max(100);

export const paginatedRequestSchema = z.object({
  cursor: cursorSchema.optional(),
  pageSize: pageSizeSchema.optional().default(20),
}).strict();
export type PaginatedRequest = z.infer<typeof paginatedRequestSchema>;

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: cursorSchema.nullable(),
    hasMore: z.boolean(),
    totalCount: z.number().int().nonnegative().optional(),
  }).strict();

/**
 * Maximum batch size for scheduled cleanup jobs (e.g., Storage upload expiry).
 * Bounded to prevent timeout overruns.
 */
export const MAX_CLEANUP_BATCH_SIZE = 500;
export const cleanupBatchSizeSchema = z.number().int().min(1).max(MAX_CLEANUP_BATCH_SIZE);

// ── Vehicle inventory constants ──

export const ownerAddressSchema = z
  .object({
    areaLabel: lagosAreaLabelSchema,
    line1: z.string().trim().min(8, 'Enter a written address.').max(160),
    line2: z.string().trim().max(160).optional(),
    city: z.literal('Lagos'),
    country: z.literal('NG'),
    placeId: z.string().trim().min(1).max(256).optional(),
  })
  .strict();
export type OwnerAddress = z.infer<typeof ownerAddressSchema>;

export const VEHICLE_MODERATION_STATES = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'suspended',
] as const;

export const VEHICLE_VISIBILITY_STATES = ['paused', 'active', 'deleted'] as const;

export const VEHICLE_REVIEW_DECISIONS = [
  'start_review',
  'approve',
  'reject',
  'suspend',
  'restore',
] as const;

export const VEHICLE_REVIEW_CHECKLIST_KEYS = [
  'images_complete_and_legible',
  'specs_match_images',
  'plate_matches_documents',
  'lagos_base_plausible',
  'rate_plausible',
  'chauffeur_delivery_included',
  'no_fraud_indicators',
] as const;

export const VEHICLE_CATEGORIES = ['executive_suv', 'executive_sedan'] as const;

export const VEHICLE_TRANSMISSIONS = ['automatic', 'manual'] as const;

export const VEHICLE_FUEL_TYPES = ['petrol', 'diesel', 'hybrid'] as const;

export const VEHICLE_FEATURE_KEYS = [
  'leather',
  'panoramic_roof',
  'apple_carplay',
  'android_auto',
  'climate_control',
  'third_row',
  'wifi',
  'privacy_glass',
] as const;

export const VEHICLE_IMAGE_VARIANTS = ['thumb', 'card', 'detail'] as const;

export const VEHICLE_UPLOAD_PURPOSES = ['listing_image', 'vehicle_document'] as const;
export type VehicleUploadPurpose = typeof VEHICLE_UPLOAD_PURPOSES[number];

export const VEHICLE_DOCUMENT_KINDS = ['insurance', 'other'] as const;
export type VehicleDocumentKind = typeof VEHICLE_DOCUMENT_KINDS[number];

export const BOOKING_BLOCK_STATES = ['held', 'paid', 'confirmed', 'owner_block'] as const;
export type BookingBlockState = typeof BOOKING_BLOCK_STATES[number];

export type VehicleFeatureKey = typeof VEHICLE_FEATURE_KEYS[number];
export type VehicleFuelType = typeof VEHICLE_FUEL_TYPES[number];
export type VehicleTransmission = typeof VEHICLE_TRANSMISSIONS[number];

export const MIN_OWNER_DAILY_RATE_KOBO = 5_000_000;
export const MAX_OWNER_DAILY_RATE_KOBO = 1_000_000_000;
export const MIN_VEHICLE_YEAR = 2010;
export const MAX_VEHICLE_IMAGES = 20;
export const MAX_VEHICLE_DOCUMENTS = 5;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_WIDTH = 1280;
export const MIN_IMAGE_HEIGHT = 720;
export const MAX_IMAGE_EDGE = 8000;

export const LAGOS_BBOX = {
  minLatitude: 6.30,
  maxLatitude: 6.75,
  minLongitude: 2.70,
  maxLongitude: 4.30,
} as const;

export const LAGOS_SERVICE_ENVELOPE = LAGOS_BBOX;

// ── Vehicle Zod schemas ──

export const vehicleModerationStatusSchema = z.enum(VEHICLE_MODERATION_STATES);
export type VehicleModerationStatus = z.infer<typeof vehicleModerationStatusSchema>;

export const vehicleVisibilitySchema = z.enum(VEHICLE_VISIBILITY_STATES);
export type VehicleVisibility = z.infer<typeof vehicleVisibilitySchema>;

export const vehicleReviewDecisionSchema = z.enum(VEHICLE_REVIEW_DECISIONS);
export type VehicleReviewDecision = z.infer<typeof vehicleReviewDecisionSchema>;

export const vehicleCategorySchema = z.enum(VEHICLE_CATEGORIES);
export const vehicleTransmissionSchema = z.enum(VEHICLE_TRANSMISSIONS);
export const vehicleFuelTypeSchema = z.enum(VEHICLE_FUEL_TYPES);
export const vehicleFeatureKeySchema = z.enum(VEHICLE_FEATURE_KEYS);
export const vehicleImageVariantSchema = z.enum(VEHICLE_IMAGE_VARIANTS);
export const bookingBlockStateSchema = z.enum(BOOKING_BLOCK_STATES);

/**
 * The variant ladder as a type. Exported so image processing and the storage
 * path builders key their records off the contract rather than re-declaring the
 * union and drifting from `VEHICLE_IMAGE_VARIANTS`.
 */
export type VehicleImageVariant = z.infer<typeof vehicleImageVariantSchema>;

export const ownerDailyRateKoboSchema = z.number().int().min(MIN_OWNER_DAILY_RATE_KOBO).max(MAX_OWNER_DAILY_RATE_KOBO);
export const vehicleYearSchema = z.number().int().min(MIN_VEHICLE_YEAR).max(2035);
export const vehicleSeatsSchema = z.number().int().min(2).max(8);
export const vehicleMakeModelSchema = z.string().trim().min(1).max(40);
export const vehicleColourSchema = z.string().trim().min(2).max(40);
export const vehicleDescriptionSchema = z.string().trim().min(40).max(2000);

export const nigerianPlateSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}-?\d{2,3}[A-Z]{2,3}$/, 'Enter a Nigerian registration plate.');

export const lagosLatitudeSchema = z.number().gte(LAGOS_BBOX.minLatitude).lte(LAGOS_BBOX.maxLatitude);
export const lagosLongitudeSchema = z.number().gte(LAGOS_BBOX.minLongitude).lte(LAGOS_BBOX.maxLongitude);

export const exactLagosPointSchema = z.object({
  latitude: lagosLatitudeSchema,
  longitude: lagosLongitudeSchema,
  placeId: z.string().trim().min(1).max(256).optional(),
}).strict();

export const vehicleSpecsSchema = z.object({
  make: vehicleMakeModelSchema,
  model: vehicleMakeModelSchema,
  year: vehicleYearSchema,
  colour: vehicleColourSchema,
  category: vehicleCategorySchema,
  seats: vehicleSeatsSchema,
  transmission: vehicleTransmissionSchema.optional(),
  fuelType: vehicleFuelTypeSchema.optional(),
  mileageKm: z.number().int().min(0).max(1_000_000).optional(),
  description: vehicleDescriptionSchema,
  features: z.array(vehicleFeatureKeySchema).max(16).optional(),
}).strict();

export const vehicleReviewChecklistSchema = z.object({
  images_complete_and_legible: z.literal(true),
  specs_match_images: z.literal(true),
  plate_matches_documents: z.literal(true),
  lagos_base_plausible: z.literal(true),
  rate_plausible: z.literal(true),
  chauffeur_delivery_included: z.literal(true),
  no_fraud_indicators: z.literal(true),
}).strict();

// ── Vehicle command schemas ──

export const createVehicleDraftDataSchema = z.object({
  specs: vehicleSpecsSchema.partial().extend({
    make: vehicleMakeModelSchema.optional(),
    model: vehicleMakeModelSchema.optional(),
    year: vehicleYearSchema.optional(),
    colour: vehicleColourSchema.optional(),
    category: vehicleCategorySchema.optional(),
    seats: vehicleSeatsSchema.optional(),
    description: z.string().trim().min(1).max(2000).optional(),
  }).strict().optional(),
  ownerDailyRateKobo: ownerDailyRateKoboSchema.optional(),
  areaLabel: lagosAreaLabelSchema.optional(),
  baseAddress: ownerAddressSchema.optional(),
  exactBase: exactLagosPointSchema.optional(),
  plate: nigerianPlateSchema.optional(),
}).strict();

export const createVehicleDraftCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: createVehicleDraftDataSchema,
}).strict();

export const createVehicleDraftResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    vehicleId: boundedIdSchema,
    moderationStatus: z.literal('draft'),
    visibility: z.literal('paused'),
    version: z.number().int().positive(),
  }).strict(),
}).strict();

export const createVehicleUploadSessionDataSchema = z.object({
  vehicleId: boundedIdSchema,
  purpose: z.enum(VEHICLE_UPLOAD_PURPOSES),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  byteSize: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  originalFileName: z.string().trim().min(1).max(120),
  documentKind: z.enum(VEHICLE_DOCUMENT_KINDS).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.purpose === 'listing_image' && value.contentType === 'application/pdf') {
    ctx.addIssue({ code: 'custom', path: ['contentType'], message: 'Listing images cannot be PDF.' });
  }
  if (value.purpose === 'vehicle_document' && !value.documentKind) {
    ctx.addIssue({ code: 'custom', path: ['documentKind'], message: 'Document kind is required.' });
  }
});

export const createVehicleUploadSessionCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: createVehicleUploadSessionDataSchema,
}).strict();

export const createVehicleUploadSessionResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    uploadId: boundedIdSchema,
    storagePath: z.string().min(1).max(512),
    purpose: z.enum(VEHICLE_UPLOAD_PURPOSES),
    maxBytes: z.literal(MAX_UPLOAD_BYTES),
  }).strict(),
}).strict();

export const finalizeVehicleImageDataSchema = z.object({
  vehicleId: boundedIdSchema,
  uploadId: boundedIdSchema,
  order: z.number().int().min(0).max(19),
}).strict();

export const finalizeVehicleImageCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: finalizeVehicleImageDataSchema,
}).strict();

export const finalizeVehicleImageResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    imageId: boundedIdSchema,
    order: z.number().int().min(0).max(19),
    status: z.enum(['processed', 'rejected']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }).strict(),
}).strict();

export const submitVehicleForReviewDataSchema = z.object({
  vehicleId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
}).strict();

export const submitVehicleForReviewCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: submitVehicleForReviewDataSchema,
}).strict();

export const submitVehicleForReviewResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    vehicleId: boundedIdSchema,
    moderationStatus: z.literal('pending_review'),
    submittedAt: isoDateTimeSchema,
    version: z.number().int().positive(),
  }).strict(),
}).strict();

export const reviewVehicleDataSchema = z.object({
  vehicleId: boundedIdSchema,
  revisionId: boundedIdSchema.optional(),
  expectedVersion: z.number().int().positive(),
  decision: vehicleReviewDecisionSchema,
  reason: z.string().trim().min(10).max(500).optional(),
  checklist: vehicleReviewChecklistSchema.optional(),
  exactBaseOverride: exactLagosPointSchema.optional(),
}).strict().superRefine((value, ctx) => {
  if (['reject', 'suspend'].includes(value.decision) && !value.reason) {
    ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required.' });
  }
  if (value.decision === 'approve' && !vehicleReviewChecklistSchema.safeParse(value.checklist).success) {
    ctx.addIssue({ code: 'custom', path: ['checklist'], message: 'Complete the approval checklist.' });
  }
});

export const reviewVehicleCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: reviewVehicleDataSchema,
}).strict();

export const reviewVehicleResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    vehicleId: boundedIdSchema,
    revisionId: boundedIdSchema.nullable(),
    fromStatus: vehicleModerationStatusSchema,
    toStatus: vehicleModerationStatusSchema,
    visibility: vehicleVisibilitySchema,
    decidedAt: isoDateTimeSchema,
    version: z.number().int().positive(),
  }).strict(),
}).strict();

export const setVehicleVisibilityDataSchema = z.object({
  vehicleId: boundedIdSchema,
  expectedVersion: z.number().int().positive(),
  visibility: z.enum(['paused', 'active', 'deleted']),
}).strict();

export const setVehicleVisibilityCommandSchema = z.object({
  schemaVersion: schemaVersionSchema,
  idempotencyKey: idempotencyKeySchema,
  data: setVehicleVisibilityDataSchema,
}).strict();

export const setVehicleVisibilityResultSchema = z.object({
  requestId: z.string().min(1).max(128),
  result: z.object({
    vehicleId: boundedIdSchema,
    visibility: vehicleVisibilitySchema,
    discoverable: z.boolean(),
    version: z.number().int().positive(),
  }).strict(),
}).strict();

// ── Vehicle visible documents ──

export const ownerVisibleVehicleSchema = z.object({
  vehicleId: boundedIdSchema,
  ownerId: boundedIdSchema,
  displayName: z.string().min(1).max(120),
  make: vehicleMakeModelSchema.nullable(),
  model: vehicleMakeModelSchema.nullable(),
  year: vehicleYearSchema.nullable(),
  colour: vehicleColourSchema.nullable(),
  category: vehicleCategorySchema.nullable(),
  seats: vehicleSeatsSchema.nullable(),
  transmission: vehicleTransmissionSchema.nullable(),
  fuelType: vehicleFuelTypeSchema.nullable(),
  mileageKm: z.number().int().min(0).max(1_000_000).nullable(),
  description: z.string().min(1).max(2000).nullable(),
  features: z.array(vehicleFeatureKeySchema),
  ownerDailyRateKobo: ownerDailyRateKoboSchema.nullable(),
  chauffeurPolicy: z.literal('included'),
  deliveryPolicy: z.literal('included'),
  areaLabel: lagosAreaLabelSchema.nullable(),
  approxLatitude: z.number().nullable(),
  approxLongitude: z.number().nullable(),
  moderationStatus: vehicleModerationStatusSchema,
  visibility: vehicleVisibilitySchema,
  discoverable: z.boolean(),
  lastDecisionReason: z.string().min(1).max(500).nullable(),
  pendingRevisionId: boundedIdSchema.nullable(),
  imageCount: z.number().int().min(0).max(20),
  primaryImagePath: z.string().max(512).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  version: z.number().int().positive(),
}).strict();

export const renterVisibleVehicleSchema = z.object({
  vehicleId: boundedIdSchema,
  ownerId: boundedIdSchema,
  displayName: z.string().min(1).max(120),
  category: vehicleCategorySchema,
  seats: z.number().int().min(2).max(8),
  areaLabel: z.string().min(1).max(120),
  approxLatitude: z.number(),
  approxLongitude: z.number(),
  ownerDailyRateKobo: ownerDailyRateKoboSchema,
  chauffeurPolicy: z.literal('included'),
  deliveryPolicy: z.literal('included'),
  imageUrls: z.array(z.string().url().max(2048)).min(1).max(20),
  primaryImageUrl: z.string().url().max(2048),
  description: vehicleDescriptionSchema,
  features: z.array(vehicleFeatureKeySchema),
  year: vehicleYearSchema,
  make: vehicleMakeModelSchema,
  model: vehicleMakeModelSchema,
}).strict();

export type CreateVehicleDraftData = z.infer<typeof createVehicleDraftDataSchema>;
export type CreateVehicleDraftCommand = z.infer<typeof createVehicleDraftCommandSchema>;
export type CreateVehicleDraftResult = z.infer<typeof createVehicleDraftResultSchema>;
export type CreateVehicleUploadSessionData = z.infer<typeof createVehicleUploadSessionDataSchema>;
export type CreateVehicleUploadSessionCommand = z.infer<typeof createVehicleUploadSessionCommandSchema>;
export type CreateVehicleUploadSessionResult = z.infer<typeof createVehicleUploadSessionResultSchema>;
export type FinalizeVehicleImageData = z.infer<typeof finalizeVehicleImageDataSchema>;
export type FinalizeVehicleImageCommand = z.infer<typeof finalizeVehicleImageCommandSchema>;
export type FinalizeVehicleImageResult = z.infer<typeof finalizeVehicleImageResultSchema>;
export type SubmitVehicleForReviewData = z.infer<typeof submitVehicleForReviewDataSchema>;
export type SubmitVehicleForReviewCommand = z.infer<typeof submitVehicleForReviewCommandSchema>;
export type SubmitVehicleForReviewResult = z.infer<typeof submitVehicleForReviewResultSchema>;
export type ReviewVehicleData = z.infer<typeof reviewVehicleDataSchema>;
export type ReviewVehicleCommand = z.infer<typeof reviewVehicleCommandSchema>;
export type ReviewVehicleResult = z.infer<typeof reviewVehicleResultSchema>;
export type SetVehicleVisibilityData = z.infer<typeof setVehicleVisibilityDataSchema>;
export type SetVehicleVisibilityCommand = z.infer<typeof setVehicleVisibilityCommandSchema>;
export type SetVehicleVisibilityResult = z.infer<typeof setVehicleVisibilityResultSchema>;
export type OwnerVisibleVehicle = z.infer<typeof ownerVisibleVehicleSchema>;
export type RenterVisibleVehicle = z.infer<typeof renterVisibleVehicleSchema>;

export type ExactLagosPoint = z.infer<typeof exactLagosPointSchema>;
export type VehicleSpecs = z.infer<typeof vehicleSpecsSchema>;
export type VehicleReviewChecklist = z.infer<typeof vehicleReviewChecklistSchema>;
export type VehicleReviewChecklistKey = keyof VehicleReviewChecklist;

export function renterVisibleVehicleToSummary(
  vehicle: RenterVisibleVehicle,
  distanceKm = 0,
): VehicleSummary {
  return {
    id: vehicle.vehicleId,
    displayName: vehicle.displayName,
    category: vehicle.category,
    areaLabel: vehicle.areaLabel,
    seats: vehicle.seats,
    dailyRateKobo: vehicle.ownerDailyRateKobo,
    distanceKm,
    chauffeurPolicy: vehicle.chauffeurPolicy,
    deliveryPolicy: vehicle.deliveryPolicy,
    imageUrl: vehicle.primaryImageUrl,
    primaryImageUrl: vehicle.primaryImageUrl,
    imageUrls: vehicle.imageUrls,
    description: vehicle.description,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
  };
}


// ── Error reason extensions ──

export const nigerianE164Schema = z
  .string()
  .regex(/^\+234[789]\d{9}$/, 'Enter a Nigerian mobile number.');

export const ownerLegalNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your legal or business name.')
  .max(120, 'Name is too long.')
  .regex(/^[\p{L}0-9][\p{L}0-9 .,'&/-]{1,119}$/u, 'Enter a valid legal or business name.');

export const termsVersionSchema = z.string().trim().min(1).max(64);

export const ownerTermsAcceptanceSchema = z
  .object({
    ownerTermsVersion: termsVersionSchema,
    commissionTermsVersion: termsVersionSchema,
    privacyNoticeVersion: termsVersionSchema,
  })
  .strict();
export type OwnerTermsAcceptance = z.infer<typeof ownerTermsAcceptanceSchema>;

export const ownerReviewChecklistSchema = z
  .object({
    identity_matches_id: z.literal(true),
    document_legible: z.literal(true),
    lagos_address_plausible: z.literal(true),
    current_terms_accepted: z.literal(true),
    no_fraud_indicators: z.literal(true),
  })
  .strict();
export type OwnerReviewChecklist = z.infer<typeof ownerReviewChecklistSchema>;

export const completeOwnerProfileDataSchema = z
  .object({
    legalName: ownerLegalNameSchema,
    address: ownerAddressSchema,
    acceptedOwnerTermsVersion: termsVersionSchema,
    acceptedCommissionTermsVersion: termsVersionSchema,
    acceptedPrivacyNoticeVersion: termsVersionSchema,
  })
  .strict();
export type CompleteOwnerProfileData = z.infer<typeof completeOwnerProfileDataSchema>;

export const completeOwnerProfileCommandSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    data: completeOwnerProfileDataSchema,
  })
  .strict();
export type CompleteOwnerProfileCommand = z.infer<typeof completeOwnerProfileCommandSchema>;

export const completeOwnerProfileResultSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    result: z
      .object({
        ownerId: boundedIdSchema,
        verificationStatus: z.enum(['draft', 'rejected']),
        profileVersion: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();
export type CompleteOwnerProfileResult = z.infer<typeof completeOwnerProfileResultSchema>;

export const submitOwnerVerificationDataSchema = z
  .object({
    uploadId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
    documentKind: governmentIdKindSchema,
    originalFileName: z.string().trim().min(1).max(120),
  })
  .strict();
export type SubmitOwnerVerificationData = z.infer<typeof submitOwnerVerificationDataSchema>;

export const submitOwnerVerificationCommandSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    data: submitOwnerVerificationDataSchema,
  })
  .strict();
export type SubmitOwnerVerificationCommand = z.infer<typeof submitOwnerVerificationCommandSchema>;

export const submitOwnerVerificationResultSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    result: z
      .object({
        ownerId: boundedIdSchema,
        verificationStatus: z.literal('submitted'),
        submittedAt: isoDateTimeSchema,
        receiptId: boundedIdSchema,
      })
      .strict(),
  })
  .strict();
export type SubmitOwnerVerificationResult = z.infer<typeof submitOwnerVerificationResultSchema>;

export const reviewOwnerVerificationDataSchema = z
  .object({
    ownerId: boundedIdSchema,
    expectedVersion: z.number().int().positive(),
    decision: ownerReviewDecisionSchema,
    reason: z.string().trim().min(10).max(500).optional(),
    checklist: z
      .object({
        identity_matches_id: z.boolean(),
        document_legible: z.boolean(),
        lagos_address_plausible: z.boolean(),
        current_terms_accepted: z.boolean(),
        no_fraud_indicators: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (['reject', 'suspend', 'revoke'].includes(value.decision) && !value.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required.' });
    }
    if (value.decision === 'approve') {
      const parsed = ownerReviewChecklistSchema.safeParse(value.checklist);
      if (!parsed.success) {
        ctx.addIssue({ code: 'custom', path: ['checklist'], message: 'Complete the approval checklist.' });
      }
    }
  });
export type ReviewOwnerVerificationData = z.infer<typeof reviewOwnerVerificationDataSchema>;

export const reviewOwnerVerificationCommandSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    data: reviewOwnerVerificationDataSchema,
  })
  .strict();
export type ReviewOwnerVerificationCommand = z.infer<typeof reviewOwnerVerificationCommandSchema>;

export const reviewOwnerVerificationResultSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    result: z
      .object({
        ownerId: boundedIdSchema,
        fromStatus: ownerVerificationStatusSchema,
        toStatus: ownerVerificationStatusSchema,
        decidedAt: isoDateTimeSchema,
      })
      .strict(),
  })
  .strict();
export type ReviewOwnerVerificationResult = z.infer<typeof reviewOwnerVerificationResultSchema>;

export const ownerVisibleProfileSchema = z
  .object({
    ownerId: boundedIdSchema,
    legalName: ownerLegalNameSchema,
    displayName: ownerLegalNameSchema,
    address: ownerAddressSchema,
    verificationStatus: ownerVerificationStatusSchema,
    verificationUpdatedAt: isoDateTimeSchema,
    lastDecisionReason: z.string().min(1).max(500).nullable(),
    ownerTermsVersion: z.string().min(1).max(64),
    commissionTermsVersion: z.string().min(1).max(64),
    privacyNoticeVersion: z.string().min(1).max(64),
    termsAcceptedAt: isoDateTimeSchema,
    governmentId: z
      .object({
        uploadId: boundedIdSchema,
        documentKind: governmentIdKindSchema,
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
        byteSize: z.number().int().positive().max(10 * 1024 * 1024),
        uploadedAt: isoDateTimeSchema,
        status: z.enum(['uploaded', 'submitted', 'cleared']),
      })
      .strict()
      .nullable(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    version: z.number().int().positive(),
  })
  .strict();
export type OwnerVisibleProfile = z.infer<typeof ownerVisibleProfileSchema>;

export const adminVisibleOwnerVerificationSchema = z
  .object({
    ownerId: boundedIdSchema,
    status: ownerVerificationStatusSchema,
    legalName: ownerLegalNameSchema,
    emailMasked: z.string().min(3).max(254),
    phoneMasked: z.string().min(4).max(20).nullable(),
    address: ownerAddressSchema,
    governmentId: z
      .object({
        uploadId: boundedIdSchema,
        documentKind: governmentIdKindSchema,
        contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
        byteSize: z.number().int().positive(),
        originalFileName: z.string().min(1).max(120),
        uploadedAt: isoDateTimeSchema,
        bytesState: z.enum(['present', 'deletion_pending', 'cleared']),
      })
      .strict()
      .nullable(),
    checklist: z.record(z.string(), z.boolean()).nullable(),
    lastDecision: ownerReviewDecisionSchema.nullable(),
    lastDecisionReason: z.string().min(1).max(500).nullable(),
    reviewerUid: boundedIdSchema.nullable(),
    submittedAt: isoDateTimeSchema.nullable(),
    reviewedAt: isoDateTimeSchema.nullable(),
    terms: ownerTermsAcceptanceSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    version: z.number().int().positive(),
    documentPreviewUrl: z.string().url().max(2048).nullable(),
  })
  .strict();
export type AdminVisibleOwnerVerification = z.infer<typeof adminVisibleOwnerVerificationSchema>;

export const storageDeletionOutboxRecordSchema = z
  .object({
    id: z.string().min(1).max(256).optional(),
    ownerId: boundedIdSchema,
    storagePath: z.string().min(1).max(512),
    uploadId: boundedIdSchema,
    attempts: z.number().int().positive(),
    lastAttemptAt: isoDateTimeSchema,
    nextAttemptAt: isoDateTimeSchema.optional(),
    completedAt: isoDateTimeSchema.optional(),
    error: z.string().min(1).max(1024),
    status: z.enum(['pending', 'completed', 'failed']),
  })
  .strict();
export type StorageDeletionOutboxRecord = z.infer<typeof storageDeletionOutboxRecordSchema>;

/**
 * Alias of the canonical `nigerianE164Schema`, not a second definition. Owner
 * auth (`owner/callable-auth.ts`) validates phone numbers against that one and
 * the contract tests assert it rejects non-mobile prefixes like
 * `+234601234567`. A looser renter-side regex would make the same number valid
 * for a renter and invalid for an owner.
 */
export const nigerianE164PhoneSchema = z.string().trim().pipe(nigerianE164Schema);
export type NigerianE164Phone = z.infer<typeof nigerianE164PhoneSchema>;

export const lagosDeliveryAddressSchema = z
  .object({
    streetAddress: z.string().trim().min(5, 'Street address must be at least 5 characters.').max(200),
    areaLabel: lagosAreaLabelSchema,
    buildingNumber: z.string().trim().max(50).nullable().optional(),
    landmark: z.string().trim().max(100).nullable().optional(),
    placeId: z.string().trim().max(128).nullable().optional(),
    approxLatitude: z.number().nullable().optional(),
    approxLongitude: z.number().nullable().optional(),
  })
  .strict();
export type LagosDeliveryAddress = z.infer<typeof lagosDeliveryAddressSchema>;

export const renterProfileStatusSchema = z.enum([
  'active',
  'suspended',
  'deletion_requested',
  'deleted',
]);
export type RenterProfileStatus = z.infer<typeof renterProfileStatusSchema>;

export const completeRenterProfileDataSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name must be at least 2 characters.').max(120),
    phone: nigerianE164PhoneSchema,
    defaultDeliveryAddress: lagosDeliveryAddressSchema,
    acceptedRenterTermsVersion: termsVersionSchema,
    acceptedPrivacyNoticeVersion: termsVersionSchema,
  })
  .strict();
export type CompleteRenterProfileData = z.infer<typeof completeRenterProfileDataSchema>;

export const completeRenterProfileCommandSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    data: completeRenterProfileDataSchema,
  })
  .strict();
export type CompleteRenterProfileCommand = z.infer<typeof completeRenterProfileCommandSchema>;

export const completeRenterProfileResultSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    result: z
      .object({
        renterId: boundedIdSchema,
        fullName: z.string().min(2).max(120),
        email: z.string().email(),
        phone: nigerianE164PhoneSchema,
        defaultDeliveryAddress: lagosDeliveryAddressSchema,
        accountStatus: renterProfileStatusSchema,
        profileVersion: z.number().int().positive(),
        updatedAt: isoDateTimeSchema,
      })
      .strict(),
  })
  .strict();
export type CompleteRenterProfileResult = z.infer<typeof completeRenterProfileResultSchema>;

export const renterProfileRecordSchema = z
  .object({
    renterId: boundedIdSchema,
    fullName: z.string().min(2).max(120),
    email: z.string().email(),
    phone: nigerianE164PhoneSchema,
    defaultDeliveryAddress: lagosDeliveryAddressSchema,
    acceptedRenterTermsVersion: termsVersionSchema,
    acceptedPrivacyNoticeVersion: termsVersionSchema,
    accountStatus: renterProfileStatusSchema,
    deletionReason: z.string().max(500).nullable().optional(),
    deletionRequestedAt: isoDateTimeSchema.nullable().optional(),
    profileVersion: z.number().int().positive(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .strict();
export type RenterProfileRecord = z.infer<typeof renterProfileRecordSchema>;

export const requestAccountDeletionDataSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    confirmation: z.literal(true, {
      message: 'You must confirm account deletion.',
    }),
  })
  .strict();
export type RequestAccountDeletionData = z.infer<typeof requestAccountDeletionDataSchema>;

export const requestAccountDeletionCommandSchema = z
  .object({
    schemaVersion: schemaVersionSchema,
    idempotencyKey: idempotencyKeySchema,
    data: requestAccountDeletionDataSchema,
  })
  .strict();
export type RequestAccountDeletionCommand = z.infer<typeof requestAccountDeletionCommandSchema>;

export const requestAccountDeletionResultSchema = z
  .object({
    requestId: z.string().min(1).max(128),
    result: z
      .object({
        renterId: boundedIdSchema,
        accountStatus: z.literal('deletion_requested'),
        requestedAt: isoDateTimeSchema,
      })
      .strict(),
  })
  .strict();
export type RequestAccountDeletionResult = z.infer<typeof requestAccountDeletionResultSchema>;

export class CommandError extends Error {
  constructor(
    public readonly code: CanonicalErrorCode,
    message: string,
    public readonly safeDetails?: Readonly<{ reason?: CommandSafeReason } & Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

export class BookingCommandError extends CommandError {
  constructor(
    code: CanonicalErrorCode,
    message: string,
    safeDetails?: Readonly<Record<string, unknown>>,
  ) {
    super(code, message, safeDetails as Readonly<{ reason?: CommandSafeReason } & Record<string, unknown>>);
    this.name = 'BookingCommandError';
  }
}

/** @deprecated Use maskEmail from @mmg/domain instead. */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

/** @deprecated Use maskPhoneE164 from @mmg/domain instead. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const clean = phone.trim();
  if (clean.length <= 5) return '***';
  if (clean.startsWith('+234') && clean.length >= 10) {
    const last4 = clean.slice(-4);
    return `+234****${last4}`;
  }
  const prefix = clean.slice(0, 3);
  const suffix = clean.slice(-3);
  return `${prefix}****${suffix}`;
}
