import { describe, expect, it } from 'vitest';

import {
  actorMayApplyDecision,
  allPaidBookingStates,
  calculateAuthoritativePrice,
  calculateBookingQuote,
  calculateChargedDays,
  calculateDiscoveryScore,
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
  haversineDistanceKm,
  intervalsOverlap,
  isCurrentRenterTerms,
  isCurrentTerms,
  isTerminalOwnerVerification,
  isWithinLagosBBox,
  maskEmail,
  maskNigerianPlate,
  maskPhoneE164,
  ownerMayCreateVehicle,
  ownerMayManageVehicle,
  ownerMayMutateProfile,
  ownerMaySubmit,
  ownerVerificationTransitions,
  rankVehiclesByDiscoveryScore,
  renterMayRequestDeletion,
  requiresApprovalChecklist,
  requiresReviewReason,
  roundBasisPointsHalfUp,
  roundToApproxLatLng,
  validateReviewReason,
  vehicleReviewTargetStatus,
  type PaidBookingState,
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

describe('paid booking transitions', () => {
  // Mirrors the architecture handoff §7.4. Completion is deliberately two-step
  // so a trip can only close after an owner-claimed completion is confirmed.
  it('routes completion through completion_pending', () => {
    expect(canTransitionPaidBooking('in_progress', 'completion_pending')).toBe(true);
    expect(canTransitionPaidBooking('completion_pending', 'completed')).toBe(true);
  });

  it('refuses to close a trip directly from in_progress', () => {
    expect(canTransitionPaidBooking('in_progress', 'completed')).toBe(false);
  });

  it('allows an owner to claim completion from confirmed without a start scan', () => {
    expect(canTransitionPaidBooking('confirmed', 'completion_pending')).toBe(true);
  });

  it('treats completed and refunded as terminal', () => {
    for (const state of allPaidBookingStates) {
      expect(canTransitionPaidBooking('completed', state)).toBe(false);
      expect(canTransitionPaidBooking('refunded', state)).toBe(false);
    }
  });

  it('never allows a paid booking to re-enter the pending-owner state', () => {
    for (const state of allPaidBookingStates) {
      if (state === 'paid_pending_owner') continue;
      expect(canTransitionPaidBooking(state, 'paid_pending_owner')).toBe(false);
    }
  });

  it('reaches every state from the entry state', () => {
    // Guards against adding a state that nothing can transition into.
    const reachable = new Set<PaidBookingState>(['paid_pending_owner']);
    let grew = true;
    while (grew) {
      grew = false;
      for (const from of [...reachable]) {
        for (const to of allPaidBookingStates) {
          if (canTransitionPaidBooking(from, to) && !reachable.has(to)) {
            reachable.add(to);
            grew = true;
          }
        }
      }
    }
    expect([...allPaidBookingStates].filter((state) => !reachable.has(state))).toEqual([]);
  });

  it('reaches a terminal state from every state', () => {
    // Guards against a state that can be entered but never closed out.
    for (const state of allPaidBookingStates) {
      const seen = new Set<PaidBookingState>([state]);
      const queue: PaidBookingState[] = [state];
      let terminal = false;
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === 'completed' || current === 'refunded') {
          terminal = true;
          break;
        }
        for (const next of allPaidBookingStates) {
          if (canTransitionPaidBooking(current, next) && !seen.has(next)) {
            seen.add(next);
            queue.push(next);
          }
        }
      }
      expect(terminal, `${state} cannot reach a terminal state`).toBe(true);
    }
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

  it('withholds discovery from an approved active listing with nothing servable', () => {
    // The gap between "the moderator approved it" and "the bytes are public".
    // Ignoring hasApprovedSnapshot here would surface a listing whose photos
    // cannot load.
    expect(
      computeDiscoverable({
        moderationStatus: 'approved',
        visibility: 'active',
        hasApprovedSnapshot: false,
      }),
    ).toBe(false);
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

describe('Lagos geo calculations and discovery ranking', () => {
  it('computes Haversine great-circle distance accurately', () => {
    // Ikoyi (6.4531, 3.4334) to Victoria Island (6.4281, 3.4219) ~ 3.0 km
    const dist = haversineDistanceKm(6.4531, 3.4334, 6.4281, 3.4219);
    expect(dist).toBeGreaterThan(2.5);
    expect(dist).toBeLessThan(3.5);

    // Same point is 0 km
    expect(haversineDistanceKm(6.45, 3.43, 6.45, 3.43)).toBe(0);
  });

  it('validates Lagos bounding box boundaries', () => {
    // Inside Lagos
    expect(isWithinLagosBBox(6.4531, 3.4334)).toBe(true); // Ikoyi
    expect(isWithinLagosBBox(6.6018, 3.3515)).toBe(true); // Ikeja

    // Outside Lagos
    expect(isWithinLagosBBox(9.0765, 7.3986)).toBe(false); // Abuja
    expect(isWithinLagosBBox(4.8156, 7.0498)).toBe(false); // Port Harcourt
    expect(isWithinLagosBBox(51.5074, -0.1278)).toBe(false); // London
  });

  it('calculates discovery score using distance and price weighting', () => {
    // Closer + cheaper vehicle produces lower score
    const scoreCloser = calculateDiscoveryScore({
      distanceKm: 2,
      dailyRateKobo: 25_000_000,
      maxRadiusKm: 20,
      minRateKobo: 20_000_000,
      maxRateKobo: 60_000_000,
    });

    const scoreFarther = calculateDiscoveryScore({
      distanceKm: 18,
      dailyRateKobo: 55_000_000,
      maxRadiusKm: 20,
      minRateKobo: 20_000_000,
      maxRateKobo: 60_000_000,
    });

    expect(scoreCloser).toBeLessThan(scoreFarther);
  });

  it('ranks vehicles by composite discovery score', () => {
    const list = [
      { id: 'v-far-expensive', distanceKm: 25, dailyRateKobo: 60_000_00 },
      { id: 'v-close-cheap', distanceKm: 2, dailyRateKobo: 25_000_00 },
      { id: 'v-mid', distanceKm: 8, dailyRateKobo: 35_000_00 },
    ];

    const ranked = rankVehiclesByDiscoveryScore(list);
    expect(ranked[0].id).toBe('v-close-cheap');
    expect(ranked[1].id).toBe('v-mid');
    expect(ranked[2].id).toBe('v-far-expensive');
  });
});

describe('renter profile domain rules', () => {
  it('validates renter terms agreement version matching', () => {
    const current = {
      renterTermsVersion: '2026-03-01',
      privacyNoticeVersion: '2026-03-01',
    };

    expect(isCurrentRenterTerms(current, current)).toBe(true);
    expect(
      isCurrentRenterTerms(
        { renterTermsVersion: '2025-01-01', privacyNoticeVersion: '2026-03-01' },
        current,
      ),
    ).toBe(false);
  });

  it('permits deletion request only for active accounts', () => {
    expect(renterMayRequestDeletion('active')).toBe(true);
    expect(renterMayRequestDeletion('suspended')).toBe(false);
    expect(renterMayRequestDeletion('deleted')).toBe(false);
    expect(renterMayRequestDeletion('deletion_requested')).toBe(false);
  });
});
