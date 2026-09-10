import { describe, expect, it } from 'vitest';

import type { RenterVisibleRentalRequest } from '@mmg/contracts/rental-request';

import { mapRenterVisibleRentalRequest, resolveServiceAreaLabel } from './renter-rental-request';

const priceSnapshot = {
  currency: 'NGN' as const,
  chargedDays: 2,
  ownerDailyRateKobo: 38_500_000,
  baseRentalKobo: 77_000_000,
  deliveryFeeKobo: 0,
  serviceFeeBps: 800,
  serviceFeeFixedKobo: 0,
  serviceFeeKobo: 6_160_000,
  ownerCommissionBps: 1_500,
  ownerCommissionKobo: 11_550_000,
  ownerEarningsKobo: 65_450_000,
  renterTotalKobo: 83_160_000,
  configVersion: 'pricing-2026-08-01',
  termsVersion: 'renter-terms-2026-08-01',
  cancellationPolicyVersion: 'cancellation-2026-08-01',
};

const request: RenterVisibleRentalRequest = {
  requestId: 'request-one',
  vehicleId: 'vehicle-one',
  startDate: '2026-09-18',
  endDate: '2026-09-20',
  serviceAreaLabel: 'Ikoyi',
  state: 'requested',
  version: 1,
  estimatedPriceSnapshot: priceSnapshot,
  vehicleSnapshot: {
    displayName: 'Range Rover Vogue',
    areaLabel: 'Ikoyi',
    categoryLabel: 'Executive SUV',
    imageKey: 'hero-suv',
  },
  createdAt: '2026-09-09T12:00:00.000Z',
  updatedAt: '2026-09-09T12:00:00.000Z',
};

describe('resolveServiceAreaLabel', () => {
  it('accepts canonical labels and Home-style Lagos suffixes', () => {
    expect(resolveServiceAreaLabel('Ikoyi')).toBe('Ikoyi');
    expect(resolveServiceAreaLabel('Victoria Island, Lagos')).toBe('Victoria Island');
    expect(resolveServiceAreaLabel('Lekki Phase 1')).toBe('Lekki Phase 1');
    expect(resolveServiceAreaLabel('MMA International Airport')).toBeNull();
  });
});

describe('mapRenterVisibleRentalRequest', () => {
  it('maps a soft request without claiming a hold or payment', () => {
    const trip = mapRenterVisibleRentalRequest(request);
    expect(trip.source).toBe('request');
    expect(trip.state).toBe('requested');
    expect(trip.group).toBe('active');
    expect(trip.intentId).toBeUndefined();
    expect(trip.holdExpiresAt).toBeUndefined();
    expect(trip.priceSnapshot.configVersion).toBe('pricing-2026-08-01');
  });

  it('prefers the authoritative price once a payment window exists', () => {
    const trip = mapRenterVisibleRentalRequest({
      ...request,
      state: 'ready_for_payment',
      version: 3,
      intentId: 'intent-one',
      holdExpiresAt: '2026-09-09T13:00:00.000Z',
      authoritativePriceSnapshot: { ...priceSnapshot, renterTotalKobo: 90_000_000 },
    });
    expect(trip.group).toBe('active');
    expect(trip.intentId).toBe('intent-one');
    expect(trip.holdExpiresAt).toBe('2026-09-09T13:00:00.000Z');
    expect(trip.priceSnapshot.renterTotalKobo).toBe(90_000_000);
  });
});
