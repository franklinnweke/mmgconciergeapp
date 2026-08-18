import { describe, expect, it } from 'vitest';

import { searchVehiclesService, type DiscoveryVehicleSource } from './search-vehicles-service';

const mockSources: DiscoveryVehicleSource = {
  listDiscoverable: async () => [
    {
      vehicle: {
        vehicleId: 'veh-suv-1',
        ownerId: 'owner-1',
        displayName: '2024 Toyota Land Cruiser Prado',
        make: 'Toyota',
        model: 'Land Cruiser Prado',
        year: 2024,
        category: 'executive_suv',
        seats: 7,
        transmission: 'automatic',
        fuelType: 'petrol',
        mileageKm: 12000,
        description: 'Pristine luxury SUV with uniformed executive chauffeur.',
        features: ['climate_control', 'wifi'],
        ownerDailyRateKobo: 35_000_000,
        chauffeurPolicy: 'included',
        deliveryPolicy: 'included',
        areaLabel: 'Ikoyi',
        approxLatitude: 6.4531,
        approxLongitude: 3.4334,
        moderationStatus: 'approved',
        visibility: 'active',
        discoverable: true,
        lastDecisionReason: null,
        pendingRevisionId: null,
        imageCount: 1,
        primaryImagePath: 'vehicles/veh-suv-1/card.webp',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      },
      images: [
        {
          imageId: 'img-1',
          vehicleId: 'veh-suv-1',
          ownerId: 'owner-1',
          order: 0,
          status: 'approved',
          width: 1920,
          height: 1080,
          originalUploadId: 'upload-1',
          variantPaths: { card: 'vehicles/veh-suv-1/card.webp' },
          processing: {
            sourceFormat: 'jpeg',
            sourceByteSize: 500000,
            sourceHadExif: true,
            sourceGps: 'stripped',
            metadataStripped: true,
            variants: {
              card: {
                path: 'vehicles/veh-suv-1/card.webp',
                width: 1200,
                height: 800,
                byteSize: 200000,
                contentType: 'image/webp',
              },
            },
          },
          publicVariantPaths: {
            card: 'public/vehicles/veh-suv-1/card.webp',
          },
          promotedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
    {
      vehicle: {
        vehicleId: 'veh-sedan-1',
        ownerId: 'owner-2',
        displayName: '2023 Mercedes-Benz S-Class',
        make: 'Mercedes-Benz',
        model: 'S-Class',
        year: 2023,
        category: 'executive_sedan',
        seats: 4,
        transmission: 'automatic',
        fuelType: 'petrol',
        mileageKm: 18000,
        description: 'Flagship luxury saloon for VIP delegation.',
        features: ['climate_control', 'privacy_glass'],
        ownerDailyRateKobo: 55_000_000,
        chauffeurPolicy: 'included',
        deliveryPolicy: 'included',
        areaLabel: 'Victoria Island',
        approxLatitude: 6.4281,
        approxLongitude: 3.4219,
        moderationStatus: 'approved',
        visibility: 'active',
        discoverable: true,
        lastDecisionReason: null,
        pendingRevisionId: null,
        imageCount: 1,
        primaryImagePath: 'vehicles/veh-sedan-1/card.webp',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      },
      images: [
        {
          imageId: 'img-2',
          vehicleId: 'veh-sedan-1',
          ownerId: 'owner-2',
          order: 0,
          status: 'approved',
          width: 1920,
          height: 1080,
          originalUploadId: 'upload-2',
          variantPaths: { card: 'vehicles/veh-sedan-1/card.webp' },
          processing: {
            sourceFormat: 'jpeg',
            sourceByteSize: 500000,
            sourceHadExif: true,
            sourceGps: 'stripped',
            metadataStripped: true,
            variants: {
              card: {
                path: 'vehicles/veh-sedan-1/card.webp',
                width: 1200,
                height: 800,
                byteSize: 200000,
                contentType: 'image/webp',
              },
            },
          },
          publicVariantPaths: {
            card: 'public/vehicles/veh-sedan-1/card.webp',
          },
          promotedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    },
  ],
};

describe('searchVehiclesService', () => {
  it('searches and returns discoverable vehicles with distance calculation and public URLs', async () => {
    const result = await searchVehiclesService(
      {},
      mockSources,
      'mmg-concierge.appspot.com',
    );

    expect(result.totalMatches).toBe(2);
    expect(result.vehicles[0].primaryImageUrl).toContain('https://storage.googleapis.com/');
    expect(result.vehicles[0].distanceKm).toBeGreaterThanOrEqual(0);
  });

  it('filters by category', async () => {
    const result = await searchVehiclesService(
      { category: 'executive_sedan' },
      mockSources,
      'mmg-concierge.appspot.com',
    );

    expect(result.totalMatches).toBe(1);
    expect(result.vehicles[0].vehicleId).toBe('veh-sedan-1');
  });

  it('filters by minimum seat capacity', async () => {
    const result = await searchVehiclesService(
      { minSeats: 6 },
      mockSources,
      'mmg-concierge.appspot.com',
    );

    expect(result.totalMatches).toBe(1);
    expect(result.vehicles[0].vehicleId).toBe('veh-suv-1');
    expect(result.vehicles[0].seats).toBe(7);
  });

  it('filters by text query', async () => {
    const result = await searchVehiclesService(
      { query: 'Mercedes' },
      mockSources,
      'mmg-concierge.appspot.com',
    );

    expect(result.totalMatches).toBe(1);
    expect(result.vehicles[0].displayName).toContain('Mercedes');
  });
});
