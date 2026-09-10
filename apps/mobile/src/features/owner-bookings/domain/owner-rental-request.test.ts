import { describe, expect, it } from 'vitest';

import type { OwnerVisibleRentalRequest } from '@mmg/contracts/rental-request';

import {
  canOwnerRespondToRequest,
  isOwnerDeclineReasonValid,
  ownerRequestStateCopy,
} from './owner-rental-request';

const request = {
  requestId: 'request-one',
  vehicleId: 'vehicle-one',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  serviceAreaLabel: 'Ikoyi',
  state: 'requested',
  version: 1,
  estimatedPriceSnapshot: {
    currency: 'NGN',
    chargedDays: 2,
    ownerDailyRateKobo: 1,
    baseRentalKobo: 2,
    deliveryFeeKobo: 0,
    serviceFeeBps: 800,
    serviceFeeFixedKobo: 0,
    serviceFeeKobo: 1,
    ownerCommissionBps: 1500,
    ownerCommissionKobo: 1,
    ownerEarningsKobo: 1,
    renterTotalKobo: 3,
    configVersion: 'pricing-2026-08-01',
    termsVersion: 'renter-terms-2026-08-01',
    cancellationPolicyVersion: 'cancellation-2026-08-01',
  },
  vehicleSnapshot: {
    displayName: 'Range Rover Vogue',
    areaLabel: 'Ikoyi',
    categoryLabel: 'Executive SUV',
  },
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
} as OwnerVisibleRentalRequest;

describe('owner rental request presentation', () => {
  it('allows accept or decline only while the request is still requested', () => {
    expect(canOwnerRespondToRequest(request)).toBe(true);
    expect(canOwnerRespondToRequest({ ...request, state: 'approved' })).toBe(false);
    expect(canOwnerRespondToRequest({ ...request, state: 'ready_for_payment' })).toBe(false);
  });

  it('never exposes renter identity fields on the owner projection type used by the desk', () => {
    expect(request).not.toHaveProperty('renterId');
    expect(request).not.toHaveProperty('contactPhone');
    expect(request).not.toHaveProperty('ownerId');
    expect(ownerRequestStateCopy('requested').body).toMatch(/does not lock dates/i);
  });

  it('accepts an omitted decline reason or a 3–500 character reason', () => {
    expect(isOwnerDeclineReasonValid('')).toBe(true);
    expect(isOwnerDeclineReasonValid('no')).toBe(false);
    expect(isOwnerDeclineReasonValid('Car already booked')).toBe(true);
  });
});
