import { describe, expect, it } from 'vitest';

import {
  LAGOS_SERVICE_ENVELOPE,
  createRentalRequestDataSchema,
  pickupLocationSnapshotSchema,
} from './rental-request';

describe('rental-request contract schemas', () => {
  const validPickup = {
    displayName: 'Eko Hotels & Suites',
    formattedAddress: 'Plot 1415 Adetokunbo Ademola Street, Victoria Island, Lagos',
    latitude: 6.4269,
    longitude: 3.4285,
    placeId: 'loc-eko-hotel',
    serviceAreaLabel: 'Victoria Island' as const,
  };

  const validData = {
    vehicleId: 'veh-prado-001',
    startDate: '2026-09-20',
    endDate: '2026-09-23',
    contactPhone: '+2348012345678',
    serviceAreaLabel: 'Victoria Island' as const,
    pickupLocation: validPickup,
  };

  it('validates a correct pickup location inside the Lagos service envelope', () => {
    const parsed = pickupLocationSnapshotSchema.safeParse(validPickup);
    expect(parsed.success).toBe(true);
  });

  it('rejects worldwide coordinates outside the Lagos service envelope', () => {
    // London coordinates
    const londonPickup = {
      ...validPickup,
      latitude: 51.5074,
      longitude: -0.1278,
    };
    const londonResult = pickupLocationSnapshotSchema.safeParse(londonPickup);
    expect(londonResult.success).toBe(false);
    if (!londonResult.success) {
      expect(londonResult.error.issues[0]?.message).toContain('Lagos service envelope');
    }

    // Abuja coordinates
    const abujaPickup = {
      ...validPickup,
      latitude: 9.0765,
      longitude: 7.3986,
    };
    const abujaResult = pickupLocationSnapshotSchema.safeParse(abujaPickup);
    expect(abujaResult.success).toBe(false);
  });

  it('validates createRentalRequestDataSchema with matching serviceAreaLabel', () => {
    const parsed = createRentalRequestDataSchema.safeParse(validData);
    expect(parsed.success).toBe(true);
  });

  it('rejects createRentalRequestDataSchema when pickupLocation serviceAreaLabel mismatches top-level', () => {
    const mismatchedData = {
      ...validData,
      serviceAreaLabel: 'Ikoyi' as const,
      pickupLocation: validPickup, // has serviceAreaLabel: 'Victoria Island'
    };
    const result = createRentalRequestDataSchema.safeParse(mismatchedData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Pickup location service area must match rental request service area.',
      );
    }
  });

  it('allows createRentalRequestDataSchema without pickupLocation for backward compatibility', () => {
    const { pickupLocation: _, ...legacyData } = validData;
    const parsed = createRentalRequestDataSchema.safeParse(legacyData);
    expect(parsed.success).toBe(true);
  });

  it('exports approximate LAGOS_SERVICE_ENVELOPE bounds', () => {
    expect(LAGOS_SERVICE_ENVELOPE.minLatitude).toBe(6.30);
    expect(LAGOS_SERVICE_ENVELOPE.maxLatitude).toBe(6.75);
    expect(LAGOS_SERVICE_ENVELOPE.minLongitude).toBe(2.70);
    expect(LAGOS_SERVICE_ENVELOPE.maxLongitude).toBe(4.30);
  });
});
