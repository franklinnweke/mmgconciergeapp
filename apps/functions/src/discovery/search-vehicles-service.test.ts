import { describe, expect, it } from 'vitest';

import {
  promotedVehicleImageFixture,
  vehicleFixture,
} from '../vehicle/vehicle-repository-fake.js';
import {
  getVehicleDetailsService,
  searchVehiclesService,
  type DiscoveryVehicleSource,
} from './search-vehicles-service.js';

const suv = {
  vehicle: vehicleFixture({
    vehicleId: 'veh-suv-1',
    ownerId: 'owner-private-1',
    displayName: '2024 Toyota Land Cruiser Prado',
    make: 'Toyota',
    model: 'Land Cruiser Prado',
    year: 2024,
    category: 'executive_suv',
    seats: 7,
    description: 'Pristine luxury SUV with uniformed executive chauffeur.',
    features: ['climate_control', 'wifi'],
    ownerDailyRateKobo: 35_000_000,
    areaLabel: 'Ikoyi',
    approxLatitude: 6.4531,
    approxLongitude: 3.4334,
    moderationStatus: 'approved',
    visibility: 'active',
    discoverable: true,
    lastDecisionReason: 'internal note must never cross the wire',
    primaryImagePath: 'private/vehicle-uploads/owner-private-1/veh-suv-1/card',
  }),
  images: [
    promotedVehicleImageFixture({
      vehicleId: 'veh-suv-1',
      ownerId: 'owner-private-1',
      imageId: 'img-suv',
    }),
  ],
};

const sedan = {
  vehicle: vehicleFixture({
    vehicleId: 'veh-sedan-1',
    ownerId: 'owner-private-2',
    displayName: '2023 Mercedes-Benz S-Class',
    make: 'Mercedes-Benz',
    model: 'S-Class',
    year: 2023,
    category: 'executive_sedan',
    seats: 4,
    description: 'Flagship luxury saloon for VIP delegation and executive travel.',
    features: ['climate_control', 'privacy_glass'],
    ownerDailyRateKobo: 55_000_000,
    areaLabel: 'Victoria Island',
    approxLatitude: 6.4281,
    approxLongitude: 3.4219,
    moderationStatus: 'approved',
    visibility: 'active',
    discoverable: true,
  }),
  images: [
    promotedVehicleImageFixture({
      vehicleId: 'veh-sedan-1',
      ownerId: 'owner-private-2',
      imageId: 'img-sedan',
    }),
  ],
};

const mockSource: DiscoveryVehicleSource = {
  listDiscoverable: async () => [suv, sedan],
  getById: async (vehicleId) => {
    if (vehicleId === suv.vehicle.vehicleId) return suv;
    if (vehicleId === sedan.vehicle.vehicleId) return sedan;
    return null;
  },
};

const bucketName = 'mmg-test.appspot.com';

describe('searchVehiclesService', () => {
  it('returns strict renter discovery DTOs without trusted fields', async () => {
    const result = await searchVehiclesService({}, mockSource, bucketName);

    expect(result.totalMatches).toBe(2);
    expect(result.vehicles[0].distanceKm).toBeGreaterThanOrEqual(0);
    expect(result.vehicles[0].primaryImageUrl).toContain('firebasestorage.googleapis.com');

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('owner-private');
    expect(serialized).not.toContain('internal note');
    expect(serialized).not.toContain('private/vehicle-uploads');
    expect(result.vehicles[0]).not.toHaveProperty('ownerId');
    expect(result.vehicles[0]).not.toHaveProperty('moderationStatus');
    expect(result.vehicles[0]).not.toHaveProperty('primaryImagePath');
  });

  it('filters by category, seats, and text', async () => {
    const sedans = await searchVehiclesService(
      { category: 'executive_sedan' },
      mockSource,
      bucketName,
    );
    expect(sedans.vehicles.map((vehicle) => vehicle.vehicleId)).toEqual(['veh-sedan-1']);

    const large = await searchVehiclesService({ minSeats: 6 }, mockSource, bucketName);
    expect(large.vehicles.map((vehicle) => vehicle.vehicleId)).toEqual(['veh-suv-1']);

    const mercedes = await searchVehiclesService({ query: 'Mercedes' }, mockSource, bucketName);
    expect(mercedes.vehicles.map((vehicle) => vehicle.vehicleId)).toEqual(['veh-sedan-1']);
  });
});

describe('getVehicleDetailsService', () => {
  it('returns one strict renter DTO and null for missing vehicles', async () => {
    const result = await getVehicleDetailsService('veh-suv-1', mockSource, bucketName);
    expect(result.vehicle?.vehicleId).toBe('veh-suv-1');
    expect(result.vehicle).not.toHaveProperty('ownerId');
    expect(JSON.stringify(result)).not.toContain('private/');

    await expect(getVehicleDetailsService('missing', mockSource, bucketName)).resolves.toEqual({
      vehicle: null,
    });
  });
});
