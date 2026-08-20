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
  confirmBookingCommandSchema,
  confirmBookingResultSchema,
  createBookingIntentCommandSchema,
  dateOnlySchema,
  emailPasswordRegistrationSchema,
  emailPasswordSignInSchema,
  maskEmail,
  maskPhone,
  nigerianE164Schema,
  nigerianE164PhoneSchema,
  getOwnerVehicleCalendarResultSchema,
  getVehicleCalendarResultSchema,
  ownerAddressSchema,
  ownerLegalNameSchema,
  ownerTermsAcceptanceSchema,
  ownerVisibleProfileSchema,
  priceSnapshotSchema,
  rejectBookingCommandSchema,
  rejectBookingResultSchema,
  removeVehicleAvailabilityBlockCommandSchema,
  renterVisibleBookingIntentSchema,
  renterVisibleBookingSchema,
  renterVisibleVehicleToSummary,
  reviewOwnerVerificationCommandSchema,
  reviewOwnerVerificationResultSchema,
  setVehicleAvailabilityBlockCommandSchema,
  submitOwnerVerificationCommandSchema,
  submitOwnerVerificationResultSchema,
} from './index';

describe('paid booking owner-response contracts', () => {
  it('requires optimistic concurrency and preserves the controlled confirmation transition', () => {
    const command = {
      schemaVersion: 1,
      idempotencyKey: 'confirm-booking-prado-001',
      data: { bookingId: 'booking-prado-001', expectedVersion: 3 },
    };
    const result = {
      requestId: 'request-confirm-001',
      result: {
        bookingId: 'booking-prado-001',
        fromState: 'paid_pending_owner',
        toState: 'confirmed',
        decidedAt: '2026-08-20T12:00:00.000Z',
        version: 4,
      },
    };

    expect(confirmBookingCommandSchema.parse(command)).toEqual(command);
    expect(confirmBookingResultSchema.parse(result)).toEqual(result);
    expect(confirmBookingCommandSchema.safeParse({
      ...command,
      data: { bookingId: 'booking-prado-001' },
    }).success).toBe(false);
  });

  it('requires a meaningful rejection reason and exposes only the intervention case ID', () => {
    const command = {
      schemaVersion: 1,
      idempotencyKey: 'reject-booking-prado-001',
      data: {
        bookingId: 'booking-prado-001',
        expectedVersion: 3,
        reason: 'The assigned chauffeur is no longer available.',
      },
    };
    const result = {
      requestId: 'request-reject-001',
      result: {
        bookingId: 'booking-prado-001',
        caseId: 'case-owner-rejection-001',
        fromState: 'paid_pending_owner',
        toState: 'intervention_required',
        decidedAt: '2026-08-20T12:00:00.000Z',
        version: 4,
      },
    };

    expect(rejectBookingCommandSchema.parse(command)).toEqual(command);
    expect(rejectBookingResultSchema.parse(result)).toEqual(result);
    expect(rejectBookingCommandSchema.safeParse({
      ...command,
      data: { ...command.data, reason: 'No driver' },
    }).success).toBe(false);
    expect(rejectBookingResultSchema.safeParse({
      ...result,
      result: { ...result.result, ownerReason: command.data.reason },
    }).success).toBe(false);
  });
});

describe('vehicle availability contracts', () => {
  it('keeps renter calendar output coarse and rejects private block metadata', () => {
    const calendar = {
      vehicleId: 'vehicle-prado-250',
      windowStartDate: '2026-09-01',
      windowEndDate: '2026-09-04',
      days: [
        { date: '2026-09-01', available: true },
        { date: '2026-09-02', available: false },
        { date: '2026-09-03', available: false },
      ],
    };

    expect(getVehicleCalendarResultSchema.parse(calendar)).toEqual(calendar);
    expect(getVehicleCalendarResultSchema.safeParse({
      ...calendar,
      days: [{ date: '2026-09-02', available: false, blockId: 'private-block' }],
    }).success).toBe(false);
  });

  it('allows owner block detail only on owner-blocked days', () => {
    const calendar = {
      vehicleId: 'vehicle-prado-250',
      windowStartDate: '2026-09-01',
      windowEndDate: '2026-09-03',
      availabilityVersion: 4,
      days: [
        {
          date: '2026-09-01',
          status: 'owner_block',
          ownerBlockId: 'block-owner-1',
          reason: 'maintenance',
        },
        { date: '2026-09-02', status: 'reserved' },
      ],
      ownerBlocks: [{
        blockId: 'block-owner-1',
        vehicleId: 'vehicle-prado-250',
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        reason: 'maintenance',
        notes: null,
        version: 1,
        createdAt: '2026-08-20T12:00:00.000Z',
        updatedAt: '2026-08-20T12:00:00.000Z',
      }],
    } as const;

    expect(getOwnerVehicleCalendarResultSchema.parse(calendar)).toEqual(calendar);
    expect(getOwnerVehicleCalendarResultSchema.safeParse({
      ...calendar,
      days: [{ date: '2026-09-02', status: 'reserved', ownerBlockId: 'leak' }],
    }).success).toBe(false);
  });

  it('requires optimistic versions and rejects client-owned fields', () => {
    const setCommand = {
      schemaVersion: 1,
      idempotencyKey: 'availability_block_0001',
      data: {
        vehicleId: 'vehicle-prado-250',
        startDate: '2026-09-01',
        endDate: '2026-09-03',
        reason: 'owner_use',
        notes: 'Private family engagement',
        expectedAvailabilityVersion: 3,
      },
    };
    expect(setVehicleAvailabilityBlockCommandSchema.parse(setCommand)).toEqual(setCommand);
    expect(setVehicleAvailabilityBlockCommandSchema.safeParse({
      ...setCommand,
      data: { ...setCommand.data, state: 'confirmed', renterId: 'other-user' },
    }).success).toBe(false);

    expect(removeVehicleAvailabilityBlockCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: 'availability_remove_0001',
      data: {
        vehicleId: 'vehicle-prado-250',
        blockId: 'block-owner-1',
        expectedBlockVersion: 1,
        expectedAvailabilityVersion: 4,
      },
    }).data.expectedBlockVersion).toBe(1);
  });
});

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
    expect(commandSafeReasonSchema.parse('not_approved_owner')).toBe('not_approved_owner');
    expect(commandSafeReasonSchema.parse('not_vehicle_owner')).toBe('not_vehicle_owner');
    expect(commandSafeReasonSchema.parse('listing_incomplete')).toBe('listing_incomplete');
  });

  it('validates Nigerian E.164 phone numbers', () => {
    expect(nigerianE164Schema.parse('+2348012345678')).toBe('+2348012345678');
    expect(nigerianE164Schema.parse('+2349098765432')).toBe('+2349098765432');
    expect(nigerianE164Schema.safeParse('08012345678').success).toBe(false);
    expect(nigerianE164Schema.safeParse('+14155552671').success).toBe(false);
    expect(nigerianE164Schema.safeParse('+234601234567').success).toBe(false);
  });

  it('applies one phone rule to renters and owners alike', () => {
    // The renter-profile schema must not be looser than the one owner auth
    // enforces, or the same number would be valid for a renter and invalid for
    // an owner.
    for (const candidate of [
      '+2348012345678',
      '+2349098765432',
      '08012345678',
      '+14155552671',
      '+234601234567',
      '+2340000000000',
    ]) {
      expect(nigerianE164PhoneSchema.safeParse(candidate).success).toBe(
        nigerianE164Schema.safeParse(candidate).success,
      );
    }
    // It does tolerate surrounding whitespace from form input.
    expect(nigerianE164PhoneSchema.parse('  +2348012345678  ')).toBe('+2348012345678');
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

  it('accepts bounded version strings and passes stale terms to the domain/service layer for comparison', () => {
    // Current versions parse cleanly
    expect(ownerTermsAcceptanceSchema.parse({
      ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION,
      commissionTermsVersion: CURRENT_COMMISSION_TERMS_VERSION,
      privacyNoticeVersion: CURRENT_PRIVACY_NOTICE_VERSION,
    })).toMatchObject({ ownerTermsVersion: CURRENT_OWNER_TERMS_VERSION });

    // Historical/stale versions are accepted at the Zod boundary (domain layer emits terms_stale)
    const staleResult = ownerTermsAcceptanceSchema.safeParse({
      ownerTermsVersion: 'owner-terms-2025-01-01',
      commissionTermsVersion: 'owner-commission-2025-01-01',
      privacyNoticeVersion: 'privacy-notice-2025-01-01',
    });
    expect(staleResult.success).toBe(true);

    // Empty or oversized strings still fail
    expect(ownerTermsAcceptanceSchema.safeParse({
      ownerTermsVersion: '',
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

  describe('maskEmail and maskPhone helpers', () => {
    it('masks email correctly', () => {
      expect(maskEmail('alhaji.danjuma@lagosholdings.ng')).toBe('a***a@lagosholdings.ng');
      expect(maskEmail('ed@lagos.ng')).toBe('e***@lagos.ng');
      expect(maskEmail('invalid')).toBe('***@***.***');
    });

    it('masks Nigerian phone numbers with +234 prefix and suffix', () => {
      expect(maskPhone('+2348012345678')).toBe('+234****5678');
      expect(maskPhone(null)).toBeNull();
      expect(maskPhone('123')).toBe('***');
    });
  });

  describe('renterVisibleVehicleToSummary', () => {
    it('maps RenterVisibleVehicle to VehicleSummary with remote imageUrl and details', () => {
      const renterView = {
        vehicleId: 'veh-001',
        ownerId: 'owner-001',
        displayName: '2024 Toyota Land Cruiser Prado 250',
        category: 'executive_suv' as const,
        seats: 7,
        areaLabel: 'Ikoyi',
        approxLatitude: 6.45,
        approxLongitude: 3.43,
        ownerDailyRateKobo: 25_000_000,
        chauffeurPolicy: 'included' as const,
        deliveryPolicy: 'included' as const,
        imageUrls: ['https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg'],
        primaryImageUrl: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg',
        description: 'First Edition Prado in Ikoyi.',
        features: ['cold_ac' as const, 'armoured_available' as const],
        year: 2024,
        make: 'Toyota',
        model: 'Land Cruiser Prado',
      };

      const summary = renterVisibleVehicleToSummary(renterView, 5.2);

      expect(summary).toEqual({
        id: 'veh-001',
        displayName: '2024 Toyota Land Cruiser Prado 250',
        category: 'executive_suv',
        areaLabel: 'Ikoyi',
        seats: 7,
        dailyRateKobo: 25_000_000,
        distanceKm: 5.2,
        chauffeurPolicy: 'included',
        deliveryPolicy: 'included',
        imageUrl: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg',
        primaryImageUrl: 'https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg',
        imageUrls: ['https://storage.googleapis.com/mmg-concierge/public/vehicles/v1/approved/card.jpg'],
        description: 'First Edition Prado in Ikoyi.',
        year: 2024,
        make: 'Toyota',
        model: 'Land Cruiser Prado',
      });
    });
  });
});
