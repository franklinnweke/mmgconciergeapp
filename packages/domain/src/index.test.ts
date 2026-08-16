import { describe, expect, it } from 'vitest';

import {
  actorMayApplyDecision,
  calculateAuthoritativePrice,
  calculateBookingQuote,
  calculateChargedDays,
  canTransitionBookingIntent,
  canTransitionOwnerVerification,
  canTransitionPaidBooking,
  canTransitionVehicleModeration,
  canTransitionVehicleVisibility,
  classifyRevision,
  computeDiscoverable,
  dateOnlyToEpochDay,
  decisionTargetStatus,
  DEFAULT_OWNER_COMMISSION_BPS,
  DEFAULT_SERVICE_FEE_BPS,
  DEFAULT_SERVICE_FEE_FIXED_KOBO,
  formatNairaFromKobo,
  intervalsOverlap,
  isCurrentTerms,
  isTerminalOwnerVerification,
  maskEmail,
  maskNigerianPlate,
  maskPhoneE164,
  ownerMayCreateVehicle,
  ownerMayManageVehicle,
  ownerMayMutateProfile,
  ownerMaySubmit,
  ownerVerificationTransitions,
  requiresApprovalChecklist,
  requiresReviewReason,
  roundBasisPointsHalfUp,
  roundToApproxLatLng,
  validateReviewReason,
  vehicleReviewTargetStatus,
} from './index';

describe('formatNairaFromKobo', () => {
  it('formats integer kobo as whole Nigerian naira', () => {
    expect(formatNairaFromKobo(385_000_00)).toBe('₦385,000');
  });

  it('rejects fractional kobo', () => {
    expect(() => formatNairaFromKobo(10.5)).toThrow('integer number of kobo');
  });
});
describe('date-only booking arithmetic', () => {
  it('uses exclusive calendar dates without local-time or DST arithmetic', () => {
    expect(calculateChargedDays('2026-03-28', '2026-03-31')).toBe(3);
    expect(calculateChargedDays('2026-12-31', '2027-01-02')).toBe(2);
  });

  it('rejects impossible, reversed, same-day, and overlong ranges', () => {
    expect(() => dateOnlyToEpochDay('2026-02-29')).toThrow('real calendar');
    expect(() => calculateChargedDays('2026-09-04', '2026-09-01')).toThrow();
    expect(() => calculateChargedDays('2026-09-01', '2026-09-01')).toThrow();
    expect(() => calculateChargedDays('2026-01-01', '2027-01-02')).toThrow();
  });
});

describe('authoritative pricing', () => {
  it('rounds percentage components to nearest kobo, half up', () => {
    expect(roundBasisPointsHalfUp(101, 500)).toBe(5);
    expect(roundBasisPointsHalfUp(110, 500)).toBe(6);
  });

  it('calculates renter total and owner earnings from server configuration', () => {
    expect(calculateAuthoritativePrice({
      ownerDailyRateKobo: 38_500_000,
      chargedDays: 2,
      deliveryFeeKobo: 0,
      serviceFeeBps: 800,
      serviceFeeFixedKobo: 0,
      ownerCommissionBps: 1_500,
      configVersion: 'pricing-v1',
      termsVersion: 'terms-v1',
      cancellationPolicyVersion: 'cancel-v1',
    })).toMatchObject({
      baseRentalKobo: 77_000_000,
      serviceFeeKobo: 6_160_000,
      ownerCommissionKobo: 11_550_000,
      ownerEarningsKobo: 65_450_000,
      renterTotalKobo: 83_160_000,
    });
  });

  it('fails before unsafe-integer multiplication or addition', () => {
    expect(() => calculateAuthoritativePrice({
      ownerDailyRateKobo: Number.MAX_SAFE_INTEGER,
      chargedDays: 2,
      deliveryFeeKobo: 0,
      serviceFeeBps: 0,
      serviceFeeFixedKobo: 0,
      ownerCommissionBps: 0,
      configVersion: 'v1',
      termsVersion: 'v1',
      cancellationPolicyVersion: 'v1',
    })).toThrow('safe integer');
  });
});

describe('availability and state machines', () => {
  it('treats touching exclusive intervals as available and overlap as unavailable', () => {
    expect(intervalsOverlap(
      { startDate: '2026-09-01', endDate: '2026-09-03' },
      { startDate: '2026-09-03', endDate: '2026-09-05' },
    )).toBe(false);
    expect(intervalsOverlap(
      { startDate: '2026-09-01', endDate: '2026-09-04' },
      { startDate: '2026-09-03', endDate: '2026-09-05' },
    )).toBe(true);
  });

  it('rejects illegal shortcuts and unpaid confirmation', () => {
    expect(canTransitionBookingIntent('intent_created', 'paid')).toBe(false);
    expect(canTransitionBookingIntent('checkout_pending', 'paid')).toBe(true);
    expect(canTransitionPaidBooking('paid_pending_owner', 'confirmed')).toBe(true);
    expect(canTransitionPaidBooking('cancelled', 'confirmed')).toBe(false);
  });
});

describe('calculateBookingQuote', () => {
  it('adds the eight-percent service and protection fee', () => {
    expect(calculateBookingQuote(385_000_00, 2)).toEqual({
      durationDays: 2,
      rentalKobo: 770_000_00,
      serviceFeeKobo: 61_600_00,
      totalKobo: 831_600_00,
    });
  });

  it('matches calculateAuthoritativePrice with default fee configuration', () => {
    for (const dailyRate of [10_000_00, 25_000_00, 38_500_00, 50_000_00, 100_000_00]) {
      for (const days of [1, 2, 3, 5, 7]) {
        const quote = calculateBookingQuote(dailyRate, days);
        const authoritative = calculateAuthoritativePrice({
          ownerDailyRateKobo: dailyRate,
          chargedDays: days,
          deliveryFeeKobo: 0,
          serviceFeeBps: DEFAULT_SERVICE_FEE_BPS,
          serviceFeeFixedKobo: DEFAULT_SERVICE_FEE_FIXED_KOBO,
          ownerCommissionBps: DEFAULT_OWNER_COMMISSION_BPS,
          configVersion: 'test',
          termsVersion: 'test',
          cancellationPolicyVersion: 'test',
        });
        expect(quote.rentalKobo).toBe(authoritative.baseRentalKobo);
        expect(quote.serviceFeeKobo).toBe(authoritative.serviceFeeKobo);
        expect(quote.totalKobo).toBe(authoritative.renterTotalKobo);
      }
    }
  });

  it('rejects invalid booking durations', () => {
    expect(() => calculateBookingQuote(385_000_00, 0)).toThrow('positive whole number');
  });
});

describe('owner verification state machine and transitions', () => {
  it('defines the complete 7-state transition table', () => {
    expect(Object.keys(ownerVerificationTransitions)).toEqual([
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'suspended',
      'revoked',
    ]);
  });

  it('allows legal transitions across the lifecycle', () => {
    // draft -> submitted
    expect(canTransitionOwnerVerification('draft', 'submitted')).toBe(true);

    // submitted -> under_review
    expect(canTransitionOwnerVerification('submitted', 'under_review')).toBe(true);

    // under_review -> approved / rejected
    expect(canTransitionOwnerVerification('under_review', 'approved')).toBe(true);
    expect(canTransitionOwnerVerification('under_review', 'rejected')).toBe(true);

    // approved -> suspended / revoked
    expect(canTransitionOwnerVerification('approved', 'suspended')).toBe(true);
    expect(canTransitionOwnerVerification('approved', 'revoked')).toBe(true);

    // rejected -> submitted (resubmit)
    expect(canTransitionOwnerVerification('rejected', 'submitted')).toBe(true);

    // suspended -> approved / revoked
    expect(canTransitionOwnerVerification('suspended', 'approved')).toBe(true);
    expect(canTransitionOwnerVerification('suspended', 'revoked')).toBe(true);
  });

  it('rejects illegal transitions and shortcuts', () => {
    // submitted cannot skip under_review
    expect(canTransitionOwnerVerification('submitted', 'approved')).toBe(false);
    expect(canTransitionOwnerVerification('submitted', 'rejected')).toBe(false);

    // draft cannot jump to under_review or approved
    expect(canTransitionOwnerVerification('draft', 'under_review')).toBe(false);
    expect(canTransitionOwnerVerification('draft', 'approved')).toBe(false);

    // rejected cannot jump to approved without submitted
    expect(canTransitionOwnerVerification('rejected', 'approved')).toBe(false);
    expect(canTransitionOwnerVerification('rejected', 'under_review')).toBe(false);

    // terminal state revoked cannot transition anywhere
    expect(canTransitionOwnerVerification('revoked', 'approved')).toBe(false);
    expect(canTransitionOwnerVerification('revoked', 'draft')).toBe(false);
    expect(canTransitionOwnerVerification('revoked', 'submitted')).toBe(false);
  });

  it('maps review decisions to target statuses', () => {
    expect(decisionTargetStatus('start_review')).toBe('under_review');
    expect(decisionTargetStatus('approve')).toBe('approved');
    expect(decisionTargetStatus('reject')).toBe('rejected');
    expect(decisionTargetStatus('suspend')).toBe('suspended');
    expect(decisionTargetStatus('restore')).toBe('approved');
    expect(decisionTargetStatus('revoke')).toBe('revoked');
  });

  it('evaluates actor decision permissions', () => {
    expect(actorMayApplyDecision('verification_admin', 'approve')).toBe(true);
    expect(actorMayApplyDecision('super_admin', 'revoke')).toBe(true);
    expect(actorMayApplyDecision('owner', 'approve')).toBe(false);
    expect(actorMayApplyDecision('system', 'start_review')).toBe(false);
  });

  it('evaluates profile mutation and submit eligibility', () => {
    // ownerMayMutateProfile: true for null, draft, rejected
    expect(ownerMayMutateProfile(null)).toBe(true);
    expect(ownerMayMutateProfile('draft')).toBe(true);
    expect(ownerMayMutateProfile('rejected')).toBe(true);
    expect(ownerMayMutateProfile('submitted')).toBe(false);
    expect(ownerMayMutateProfile('under_review')).toBe(false);
    expect(ownerMayMutateProfile('approved')).toBe(false);
    expect(ownerMayMutateProfile('suspended')).toBe(false);
    expect(ownerMayMutateProfile('revoked')).toBe(false);

    // ownerMaySubmit: true ONLY for draft and rejected; explicitly false for null
    expect(ownerMaySubmit('draft')).toBe(true);
    expect(ownerMaySubmit('rejected')).toBe(true);
    expect(ownerMaySubmit(null)).toBe(false);
    expect(ownerMaySubmit('submitted')).toBe(false);
    expect(ownerMaySubmit('under_review')).toBe(false);
    expect(ownerMaySubmit('approved')).toBe(false);
    expect(ownerMaySubmit('suspended')).toBe(false);
    expect(ownerMaySubmit('revoked')).toBe(false);
  });

  it('identifies terminal verification state', () => {
    expect(isTerminalOwnerVerification('revoked')).toBe(true);
    expect(isTerminalOwnerVerification('draft')).toBe(false);
    expect(isTerminalOwnerVerification('submitted')).toBe(false);
    expect(isTerminalOwnerVerification('approved')).toBe(false);
  });

  it('identifies decision reason and checklist requirements', () => {
    expect(requiresReviewReason('reject')).toBe(true);
    expect(requiresReviewReason('suspend')).toBe(true);
    expect(requiresReviewReason('revoke')).toBe(true);
    expect(requiresReviewReason('approve')).toBe(false);
    expect(requiresReviewReason('start_review')).toBe(false);
    expect(requiresReviewReason('restore')).toBe(false);

    expect(requiresApprovalChecklist('approve')).toBe(true);
    expect(requiresApprovalChecklist('reject')).toBe(false);
  });

  it('validates review reasons with strict length bounds [10, 500]', () => {
    expect(validateReviewReason('  The uploaded document is expired and unreadable.  ')).toBe(
      'The uploaded document is expired and unreadable.',
    );
    expect(() => validateReviewReason('Short')).toThrow(RangeError);
    expect(() => validateReviewReason('A'.repeat(501))).toThrow(RangeError);
  });

  it('masks email addresses accurately', () => {
    expect(maskEmail('ada.okafor@example.com')).toBe('a***@example.com');
    expect(maskEmail('bello@domain.ng')).toBe('b***@domain.ng');
    expect(() => maskEmail('invalid-email')).toThrow(TypeError);
    expect(() => maskEmail('@example.com')).toThrow(TypeError);
  });

  it('masks Nigerian E.164 phone numbers accurately', () => {
    expect(maskPhoneE164('+2348012345678')).toBe('+234****5678');
    expect(maskPhoneE164('+2349098765432')).toBe('+234****5432');
    expect(() => maskPhoneE164('+14155552671')).toThrow(TypeError);
    expect(() => maskPhoneE164('08012345678')).toThrow(TypeError);
  });
});

describe('isCurrentTerms', () => {
  const current = {
    ownerTermsVersion: 'owner-terms-2026-08-01',
    commissionTermsVersion: 'owner-commission-2026-08-01',
    privacyNoticeVersion: 'privacy-notice-2026-08-01',
  };

  it('returns true when all versions match', () => {
    expect(isCurrentTerms(current, current)).toBe(true);
  });

  it('returns false when any version is stale', () => {
    expect(isCurrentTerms({ ...current, ownerTermsVersion: 'owner-terms-2025-01-01' }, current)).toBe(false);
    expect(isCurrentTerms({ ...current, commissionTermsVersion: 'stale' }, current)).toBe(false);
    expect(isCurrentTerms({ ...current, privacyNoticeVersion: '' }, current)).toBe(false);
  });
});

describe('vehicle domain', () => {
  it('defines moderation state transitions', () => {
    expect(canTransitionVehicleModeration('draft', 'pending_review')).toBe(true);
    expect(canTransitionVehicleModeration('draft', 'approved')).toBe(false);
    expect(canTransitionVehicleModeration('pending_review', 'approved')).toBe(true);
    expect(canTransitionVehicleModeration('pending_review', 'rejected')).toBe(true);
    expect(canTransitionVehicleModeration('approved', 'suspended')).toBe(true);
    expect(canTransitionVehicleModeration('approved', 'rejected')).toBe(false);
    expect(canTransitionVehicleModeration('rejected', 'pending_review')).toBe(true);
    expect(canTransitionVehicleModeration('suspended', 'approved')).toBe(true);
  });

  it('defines visibility state transitions', () => {
    expect(canTransitionVehicleVisibility('paused', 'active')).toBe(true);
    expect(canTransitionVehicleVisibility('active', 'paused')).toBe(true);
    expect(canTransitionVehicleVisibility('paused', 'deleted')).toBe(true);
    expect(canTransitionVehicleVisibility('active', 'deleted')).toBe(true);
    expect(canTransitionVehicleVisibility('deleted', 'active')).toBe(false);
    expect(canTransitionVehicleVisibility('deleted', 'paused')).toBe(false);
  });

  it('maps review decisions to target moderation statuses', () => {
    expect(vehicleReviewTargetStatus('start_review')).toBe('pending_review');
    expect(vehicleReviewTargetStatus('approve')).toBe('approved');
    expect(vehicleReviewTargetStatus('reject')).toBe('rejected');
    expect(vehicleReviewTargetStatus('suspend')).toBe('suspended');
    expect(vehicleReviewTargetStatus('restore')).toBe('approved');
  });

  it('computes discoverable from moderation + visibility', () => {
    expect(computeDiscoverable({ moderationStatus: 'approved', visibility: 'active', hasApprovedSnapshot: true })).toBe(true);
    expect(computeDiscoverable({ moderationStatus: 'approved', visibility: 'paused', hasApprovedSnapshot: true })).toBe(false);
    expect(computeDiscoverable({ moderationStatus: 'draft', visibility: 'active', hasApprovedSnapshot: false })).toBe(false);
    expect(computeDiscoverable({ moderationStatus: 'approved', visibility: 'deleted', hasApprovedSnapshot: true })).toBe(false);
    expect(computeDiscoverable({ moderationStatus: 'rejected', visibility: 'active', hasApprovedSnapshot: false })).toBe(false);
  });

  it('gates vehicle creation on approved owner verification', () => {
    expect(ownerMayCreateVehicle('approved')).toBe(true);
    expect(ownerMayCreateVehicle('draft')).toBe(false);
    expect(ownerMayCreateVehicle(null)).toBe(false);
    expect(ownerMayCreateVehicle('suspended')).toBe(false);
  });

  it('gates vehicle management on owner match', () => {
    expect(ownerMayManageVehicle('owner-1', 'owner-1')).toBe(true);
    expect(ownerMayManageVehicle('owner-1', 'owner-2')).toBe(false);
  });

  it('classifies revisions', () => {
    // Minor: description only
    expect(classifyRevision({ specs: { description: 'Updated' } })).toEqual({ classification: 'minor', safetyCritical: false });
    // Major: rate change
    expect(classifyRevision({ ownerDailyRateKobo: 50_000_00 })).toEqual({ classification: 'major', safetyCritical: false });
    // Safety-critical: plate change
    expect(classifyRevision({ plate: 'ABC123DE' })).toEqual({ classification: 'major', safetyCritical: true });
    // Major: spec change
    expect(classifyRevision({ specs: { make: 'BMW' } })).toEqual({ classification: 'major', safetyCritical: false });
    // Safety-critical: location
    expect(classifyRevision({ areaLabel: 'Lekki' })).toEqual({ classification: 'major', safetyCritical: true });
    // Mixed major + safety-critical is safety-critical
    expect(classifyRevision({ ownerDailyRateKobo: 50_000_00, plate: 'ABC123DE' })).toEqual({ classification: 'major', safetyCritical: true });
    // No changes: minor
    expect(classifyRevision({})).toEqual({ classification: 'minor', safetyCritical: false });
  });

  it('rounds exact coords to ~1.1 km for public display', () => {
    expect(roundToApproxLatLng(6.5244, 3.3792)).toEqual({ lat: 6.52, lng: 3.38 });
  });

  it('masks Nigerian plates for public display', () => {
    expect(maskNigerianPlate('ABC123DE')).toBe('***DE');
    expect(maskNigerianPlate('EKY456GZ')).toBe('***GZ');
    expect(maskNigerianPlate('AB')).toBe('****');
  });
});
