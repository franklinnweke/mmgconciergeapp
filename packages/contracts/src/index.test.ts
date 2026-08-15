import { describe, expect, it } from 'vitest';

import {
  CURRENT_COMMISSION_TERMS_VERSION,
  CURRENT_OWNER_TERMS_VERSION,
  CURRENT_PRIVACY_NOTICE_VERSION,
  GOVERNMENT_ID_KINDS,
  LAGOS_AREA_LABELS,
  OWNER_REVIEW_CHECKLIST_KEYS,
  OWNER_REVIEW_DECISIONS,
  OWNER_VERIFICATION_STATES,
  STAFF_ROLE_KEYS,
  accountProfileSchema,
  accountTypeSchema,
  adminVisibleOwnerVerificationSchema,
  canonicalErrorCodeSchema,
  commandSafeReasonSchema,
  completeOwnerProfileCommandSchema,
  completeOwnerProfileResultSchema,
  createBookingIntentCommandSchema,
  dateOnlySchema,
  emailPasswordRegistrationSchema,
  emailPasswordSignInSchema,
  nigerianE164Schema,
  ownerAddressSchema,
  ownerLegalNameSchema,
  ownerTermsAcceptanceSchema,
  ownerVisibleProfileSchema,
  priceSnapshotSchema,
  renterVisibleBookingIntentSchema,
  renterVisibleBookingSchema,
  reviewOwnerVerificationCommandSchema,
  reviewOwnerVerificationResultSchema,
  submitOwnerVerificationCommandSchema,
  submitOwnerVerificationResultSchema,
} from './index';

describe('authentication contracts', () => {
  it('accepts only public renter and owner account types', () => {
    expect(accountTypeSchema.parse('renter')).toBe('renter');
    expect(accountTypeSchema.parse('owner')).toBe('owner');
    expect(accountTypeSchema.safeParse('admin').success).toBe(false);
  });

  it('validates a strict account profile without privilege fields', () => {
    const profile = {
      uid: 'renter-one',
      accountType: 'renter',
      displayName: 'Ada Okafor',
      email: 'ADA@example.com',
    };
    expect(accountProfileSchema.parse(profile).email).toBe('ada@example.com');
    expect(accountProfileSchema.safeParse({ ...profile, isAdmin: true }).success).toBe(false);
  });

  it('normalizes a valid email/password sign-in request', () => {
    expect(
      emailPasswordSignInSchema.parse({
        email: '  RENTER@Example.com ',
        password: 'private-passphrase',
      }),
    ).toEqual({
      email: 'renter@example.com',
      password: 'private-passphrase',
    });
  });

  it('rejects weak credentials and oversized names', () => {
    expect(() =>
      emailPasswordRegistrationSchema.parse({
        displayName: 'A'.repeat(81),
        email: 'not-an-email',
        password: 'short',
      }),
    ).toThrow();
  });
});
describe('booking command contracts', () => {
  it('accepts a strict versioned date-only booking command', () => {
    expect(createBookingIntentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'booking_01JABCDEFGHIJK',
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
      },
    })).toMatchObject({ schemaVersion: 1 });
  });

  it('rejects impossible dates, extra client fields, and short idempotency keys', () => {
    expect(dateOnlySchema.safeParse('2026-02-29').success).toBe(false);
    expect(createBookingIntentCommandSchema.safeParse({
      schemaVersion: 1,
      idempotencyKey: 'short',
      data: {
        vehicleId: 'vehicle-one',
        startDate: '2026-09-01',
        endDate: '2026-09-04',
        totalKobo: 1,
      },
    }).success).toBe(false);
  });

  it('requires integer-kobo snapshots and bounded basis points', () => {
    expect(priceSnapshotSchema.safeParse({
      currency: 'NGN',
      chargedDays: 1,
      ownerDailyRateKobo: 10.5,
      baseRentalKobo: 10,
      deliveryFeeKobo: 0,
      serviceFeeBps: 10_001,
      serviceFeeFixedKobo: 0,
      serviceFeeKobo: 0,
      ownerCommissionBps: 0,
      ownerCommissionKobo: 0,
      ownerEarningsKobo: 10,
      renterTotalKobo: 10,
      configVersion: 'v1',
      termsVersion: 'v1',
      cancellationPolicyVersion: 'v1',
    }).success).toBe(false);
  });
});

const validPriceSnapshot = {
  currency: 'NGN',
  chargedDays: 3,
  ownerDailyRateKobo: 38_500_000,
  baseRentalKobo: 115_500_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 9_240_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 17_325_000,
  ownerEarningsKobo: 98_175_000,
  renterTotalKobo: 124_740_000,
  configVersion: 'pricing-2026-08',
  termsVersion: 'terms-2026-08',
  cancellationPolicyVersion: 'cancellation-2026-08',
};

const validVehicleSnapshot = {
  displayName: 'Pearl Executive SUV',
  areaLabel: 'Victoria Island',
  categoryLabel: 'Executive SUV',
  imageKey: 'pearl-suv',
};

describe('renter-visible trusted records', () => {
  it('accepts a normalized booking-intent document and ignores extra server fields', () => {
    expect(renterVisibleBookingIntentSchema.parse({
      id: 'intent-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-13',
      endDate: '2026-09-16',
      state: 'checkout_pending',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
      expiresAt: '2026-08-13T12:15:00.000Z',
      paystackReference: 'server-only',
    })).toMatchObject({ id: 'intent-one', state: 'checkout_pending' });
  });

  it('accepts a normalized paid booking and rejects intent states on bookings', () => {
    expect(renterVisibleBookingSchema.parse({
      id: 'booking-one',
      intentId: 'intent-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-24',
      state: 'paid_pending_owner',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
    }).intentId).toBe('intent-one');
    expect(renterVisibleBookingSchema.safeParse({
      id: 'booking-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-24',
      state: 'checkout_pending',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
    }).success).toBe(false);
  });

  it('rejects raw timestamp objects and missing renter identity', () => {
    expect(renterVisibleBookingIntentSchema.safeParse({
      id: 'intent-one',
      renterId: 'renter-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-13',
      endDate: '2026-09-16',
      state: 'intent_created',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: { seconds: 1_786_617_600, nanoseconds: 0 },
      updatedAt: '2026-08-13T12:14:00.000Z',
      expiresAt: '2026-08-13T12:15:00.000Z',
    }).success).toBe(false);
    expect(renterVisibleBookingSchema.safeParse({
      id: 'booking-one',
      ownerId: 'owner-one',
      vehicleId: 'vehicle-one',
      startDate: '2026-09-21',
      endDate: '2026-09-24',
      state: 'confirmed',
      priceSnapshot: validPriceSnapshot,
      vehicleSnapshot: validVehicleSnapshot,
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:14:00.000Z',
    }).success).toBe(false);
  });
});

describe('owner verification contracts and schemas', () => {
  it('validates locked constants and enums', () => {
    expect(CURRENT_OWNER_TERMS_VERSION).toBe('owner-terms-2026-08-01');
    expect(CURRENT_COMMISSION_TERMS_VERSION).toBe('owner-commission-2026-08-01');
    expect(CURRENT_PRIVACY_NOTICE_VERSION).toBe('privacy-notice-2026-08-01');
    expect(OWNER_VERIFICATION_STATES).toEqual([
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'suspended',
      'revoked',
    ]);
    expect(LAGOS_AREA_LABELS).toContain('Lekki');
    expect(LAGOS_AREA_LABELS).toContain('Lekki Phase 1');
    expect(GOVERNMENT_ID_KINDS).toEqual([
      'national_id',
      'international_passport',
      'drivers_licence',
      'voters_card',
      'residence_permit',
    ]);
    expect(OWNER_REVIEW_DECISIONS).toEqual([
      'start_review',
      'approve',
      'reject',
      'suspend',
      'restore',
      'revoke',
    ]);
    expect(OWNER_REVIEW_CHECKLIST_KEYS).toEqual([
      'identity_matches_id',
      'document_legible',
      'lagos_address_plausible',
      'current_terms_accepted',
      'no_fraud_indicators',
    ]);
    expect(STAFF_ROLE_KEYS).toEqual([
      'support',
      'vehicle_admin',
      'verification_admin',
      'finance_admin',
      'privacy_admin',
      'super_admin',
    ]);
  });

  it('validates error codes and safe reason codes', () => {
    expect(canonicalErrorCodeSchema.parse('INVALID_STATE_TRANSITION')).toBe('INVALID_STATE_TRANSITION');
    expect(canonicalErrorCodeSchema.parse('PROFILE_INCOMPLETE')).toBe('PROFILE_INCOMPLETE');
    expect(commandSafeReasonSchema.parse('phone_unverified')).toBe('phone_unverified');
    expect(commandSafeReasonSchema.parse('terms_stale')).toBe('terms_stale');
    expect(commandSafeReasonSchema.safeParse('unknown_reason').success).toBe(false);
  });

  it('validates Nigerian E.164 phone numbers', () => {
    expect(nigerianE164Schema.parse('+2348012345678')).toBe('+2348012345678');
    expect(nigerianE164Schema.parse('+2349098765432')).toBe('+2349098765432');
    expect(nigerianE164Schema.safeParse('08012345678').success).toBe(false);
    expect(nigerianE164Schema.safeParse('+14155552671').success).toBe(false);
    expect(nigerianE164Schema.safeParse('+234601234567').success).toBe(false);
  });

  it('validates legal names and structured Lagos addresses', () => {
    expect(ownerLegalNameSchema.parse('Alhaji Musa Danjuma')).toBe('Alhaji Musa Danjuma');
    expect(ownerLegalNameSchema.safeParse('A').success).toBe(false);

    const validAddress = {
      areaLabel: 'Lekki Phase 1',
      line1: '12 Admiralty Way, Lekki',
      city: 'Lagos' as const,
      country: 'NG' as const,
    };
    expect(ownerAddressSchema.parse(validAddress)).toEqual(validAddress);
    expect(ownerAddressSchema.safeParse({ ...validAddress, city: 'Abuja' }).success).toBe(false);
    expect(ownerAddressSchema.safeParse({ ...validAddress, areaLabel: 'Unknown Area' }).success).toBe(false);
  });

  it('validates terms acceptance requiring current versions', () => {
    expect(ownerTermsAcceptanceSchema.parse({
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    })).toMatchObject({ ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION });

    expect(ownerTermsAcceptanceSchema.safeParse({
      ownerTermsVersion: 'stale-version',
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    }).success).toBe(false);
  });

  it('validates completeOwnerProfile command and result', () => {
    const validCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idem_key_complete_profile_01',
      data: {
        legalName: 'Tunde Bakare & Sons',
        address: {
          areaLabel: 'Victoria Island',
          line1: 'Plot 1044 Adeola Odeku Street',
          city: 'Lagos' as const,
          country: 'NG' as const,
        },
        acceptedOwnerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
        acceptedCommissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
        acceptedPrivacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      },
    };
    expect(completeOwnerProfileCommandSchema.parse(validCommand)).toMatchObject({ schemaVersion: 1 });

    const validResult = {
      requestId: 'req-01',
      result: {
        ownerId: 'owner-01',
        verificationStatus: 'draft' as const,
        profileVersion: 1,
      },
    };
    expect(completeOwnerProfileResultSchema.parse(validResult)).toMatchObject({ requestId: 'req-01' });
  });

  it('validates submitOwnerVerification command and result', () => {
    const validCommand = {
      schemaVersion: 1,
      idempotencyKey: 'idem_key_submit_verification_01',
      data: {
        uploadId: 'upload_national_id_01',
        documentKind: 'national_id' as const,
        originalFileName: 'nin_slip.pdf',
      },
    };
    expect(submitOwnerVerificationCommandSchema.parse(validCommand)).toMatchObject({ schemaVersion: 1 });

    const validResult = {
      requestId: 'req-02',
      result: {
        ownerId: 'owner-01',
        verificationStatus: 'submitted' as const,
        submittedAt: '2026-08-15T12:00:00.000Z',
        receiptId: 'receipt-01',
      },
    };
    expect(submitOwnerVerificationResultSchema.parse(validResult)).toMatchObject({ requestId: 'req-02' });
  });

  it('validates reviewOwnerVerification with superRefine rules for approve and reject', () => {
    // start_review: valid without reason or checklist
    expect(reviewOwnerVerificationCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'idem_key_start_review_01',
      data: {
        ownerId: 'owner-01',
        expectedVersion: 1,
        decision: 'start_review',
      },
    })).toMatchObject({ schemaVersion: 1 });

    // approve: valid with complete checklist
    expect(reviewOwnerVerificationCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'idem_key_approve_01',
      data: {
        ownerId: 'owner-01',
        expectedVersion: 2,
        decision: 'approve',
        checklist: {
          identity_matches_id: true,
          document_legible: true,
          lagos_address_plausible: true,
          current_terms_accepted: true,
          no_fraud_indicators: true,
        },
      },
    })).toMatchObject({ schemaVersion: 1 });

    // approve: fails if any checklist flag is false
    expect(reviewOwnerVerificationCommandSchema.safeParse({
      schemaVersion: 1,
      idempotencyKey: 'idem_key_approve_02',
      data: {
        ownerId: 'owner-01',
        expectedVersion: 2,
        decision: 'approve',
        checklist: {
          identity_matches_id: true,
          document_legible: false,
          lagos_address_plausible: true,
          current_terms_accepted: true,
          no_fraud_indicators: true,
        },
      },
    }).success).toBe(false);

    // reject: valid with reason >= 10 chars
    expect(reviewOwnerVerificationCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'idem_key_reject_01',
      data: {
        ownerId: 'owner-01',
        expectedVersion: 2,
        decision: 'reject',
        reason: 'The uploaded identity document is blurred and expired.',
      },
    })).toMatchObject({ schemaVersion: 1 });

    // reject: fails without reason
    expect(reviewOwnerVerificationCommandSchema.safeParse({
      schemaVersion: 1,
      idempotencyKey: 'idem_key_reject_02',
      data: {
        ownerId: 'owner-01',
        expectedVersion: 2,
        decision: 'reject',
      },
    }).success).toBe(false);

    // review result
    expect(reviewOwnerVerificationResultSchema.parse({
      requestId: 'req-03',
      result: {
        ownerId: 'owner-01',
        fromStatus: 'under_review',
        toStatus: 'approved',
        decidedAt: '2026-08-15T12:30:00.000Z',
      },
    })).toMatchObject({ requestId: 'req-03' });
  });

  it('validates strict ownerVisibleProfileSchema and rejects extra/missing keys', () => {
    const validProfile = {
      ownerId: 'owner-01',
      legalName: 'Chinedu Eze Luxury Fleet',
      displayName: 'Chinedu Eze Luxury Fleet',
      address: {
        areaLabel: 'Ikoyi' as const,
        line1: '15 Alexander Avenue, Ikoyi',
        city: 'Lagos' as const,
        country: 'NG' as const,
      },
      verificationStatus: 'draft' as const,
      verificationUpdatedAt: '2026-08-15T10:00:00.000Z',
      lastDecisionReason: null,
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      termsAcceptedAt: '2026-08-15T10:00:00.000Z',
      governmentId: null,
      createdAt: '2026-08-15T10:00:00.000Z',
      updatedAt: '2026-08-15T10:00:00.000Z',
      version: 1,
    };

    expect(ownerVisibleProfileSchema.parse(validProfile)).toEqual(validProfile);

    // Rejects storagePath if attempted
    expect(ownerVisibleProfileSchema.safeParse({
      ...validProfile,
      governmentId: {
        uploadId: 'upload-01',
        documentKind: 'national_id',
        contentType: 'image/jpeg',
        byteSize: 1024,
        uploadedAt: '2026-08-15T10:00:00.000Z',
        status: 'uploaded',
        storagePath: 'private/owner-verification/...',
      },
    }).success).toBe(false);
  });

  it('validates adminVisibleOwnerVerificationSchema with masked values', () => {
    const validAdminView = {
      ownerId: 'owner-01',
      status: 'submitted' as const,
      legalName: 'Amina Bello Motors',
      emailMasked: 'a***@example.com',
      phoneMasked: '+234****5678',
      address: {
        areaLabel: 'Ikeja' as const,
        line1: '45 Isaac John Street, Ikeja GRA',
        city: 'Lagos' as const,
        country: 'NG' as const,
      },
      governmentId: {
        uploadId: 'upload-01',
        documentKind: 'drivers_licence' as const,
        contentType: 'image/png' as const,
        byteSize: 2048576,
        originalFileName: 'license.png',
        uploadedAt: '2026-08-15T11:00:00.000Z',
        bytesState: 'present' as const,
      },
      checklist: null,
      lastDecision: null,
      lastDecisionReason: null,
      reviewerUid: null,
      submittedAt: '2026-08-15T11:05:00.000Z',
      reviewedAt: null,
      terms: {
        ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
        commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
        privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
      },
      createdAt: '2026-08-15T10:00:00.000Z',
      updatedAt: '2026-08-15T11:05:00.000Z',
      version: 1,
      documentPreviewUrl: 'https://storage.googleapis.com/signed-url',
    };

    expect(adminVisibleOwnerVerificationSchema.parse(validAdminView)).toEqual(validAdminView);
  });
});
