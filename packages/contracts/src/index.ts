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

export const isoDateTimeSchema = z.string().datetime({ offset: true });
export const boundedIdSchema = z.string().trim().min(1).max(128);

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

export const CURRENT_OWNER_TERMS_VERSION = 'owner-terms-2026-08-01';
export const CURRENT_COMMISSION_TERMS_VERSION = 'owner-commission-2026-08-01';
export const CURRENT_PRIVACY_NOTICE_VERSION = 'privacy-notice-2026-08-01';

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
]);
export type CommandSafeReason = z.infer<typeof commandSafeReasonSchema>;

export const nigerianE164Schema = z
  .string()
  .regex(/^\+234[789]\d{9}$/, 'Enter a Nigerian mobile number.');

export const ownerLegalNameSchema = z
  .string()
  .trim()
  .min(2, 'Enter your legal or business name.')
  .max(120, 'Name is too long.')
  .regex(/^[\p{L}0-9][\p{L}0-9 .,'&/-]{1,119}$/u, 'Enter a valid legal or business name.');

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

export const ownerTermsAcceptanceSchema = z
  .object({
    ownerTermsVersion: z.literal(CURRENT_OWNER_TERMS_VERSION),
    commissionTermsVersion: z.literal(CURRENT_COMMISSION_TERMS_VERSION),
    privacyNoticeVersion: z.literal(CURRENT_PRIVACY_NOTICE_VERSION),
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
    acceptedOwnerTermsVersion: z.literal(CURRENT_OWNER_TERMS_VERSION),
    acceptedCommissionTermsVersion: z.literal(CURRENT_COMMISSION_TERMS_VERSION),
    acceptedPrivacyNoticeVersion: z.literal(CURRENT_PRIVACY_NOTICE_VERSION),
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
        bytesState: z.enum(['present', 'cleared']),
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

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.charAt(0)}***${local.charAt(local.length - 1)}@${domain}`;
}

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
