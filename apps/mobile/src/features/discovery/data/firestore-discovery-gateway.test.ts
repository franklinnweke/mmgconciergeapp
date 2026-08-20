import { describe, expect, it, vi } from 'vitest';

import {
  WebFirestoreDiscoveryGateway,
  createDiscoveryGateway,
} from './firestore-discovery-gateway.web';

const mockDocs = [
  {
    id: 'veh-live-1',
    exists: () => true,
    data: () => ({
      ownerId: 'owner-1',
      displayName: '2024 Toyota Land Cruiser Prado',
      make: 'Toyota',
      model: 'Land Cruiser Prado',
      year: 2024,
      category: 'executive_suv',
      seats: 7,
      ownerDailyRateKobo: 35_000_000,
      areaLabel: 'Ikoyi',
      approxLatitude: 6.4531,
      approxLongitude: 3.4334,
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      chauffeurPolicy: 'included',
      deliveryPolicy: 'included',
      imageUrls: ['https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/veh-live-1/card.webp'],
      primaryImageUrl: 'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/veh-live-1/card.webp',
      description: 'Pristine luxury SUV with uniformed executive chauffeur.',
      features: ['climate_control', 'wifi'],
    }),
  },
  {
    id: 'veh-live-2',
    exists: () => true,
    data: () => ({
      ownerId: 'owner-2',
      displayName: '2023 Mercedes-Benz S-Class',
      make: 'Mercedes-Benz',
      model: 'S-Class',
      year: 2023,
      category: 'executive_sedan',
      seats: 4,
      ownerDailyRateKobo: 55_000_000,
      areaLabel: 'Victoria Island',
      approxLatitude: 6.4281,
      approxLongitude: 3.4219,
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      chauffeurPolicy: 'included',
      deliveryPolicy: 'included',
      imageUrls: ['https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/veh-live-2/card.webp'],
      primaryImageUrl: 'https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/veh-live-2/card.webp',
      description: 'Flagship luxury sedan for VIP delegation.',
      features: ['climate_control', 'privacy_glass'],
    }),
  },
  {
    id: 'veh-unapproved',
    exists: () => true,
    data: () => ({
      ownerId: 'owner-3',
      displayName: 'Unapproved Draft Vehicle',
      moderationStatus: 'pending_review',
      visibility: 'active',
      discoverable: false,
    }),
  },
  {
    id: 'veh-corrupt-no-images',
    exists: () => true,
    data: () => ({
      ownerId: 'owner-4',
      displayName: 'Broken Listing',
      make: 'Lexus',
      model: 'LX600',
      year: 2024,
      category: 'executive_suv',
      seats: 7,
      ownerDailyRateKobo: 45_000_000,
      areaLabel: 'Ikoyi',
      approxLatitude: 6.45,
      approxLongitude: 3.43,
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      imageUrls: [],
    }),
  },
  {
    id: 'veh-corrupt-missing-coords',
    exists: () => true,
    data: () => ({
      ownerId: 'owner-5',
      displayName: 'Missing Coords Listing',
      make: 'BMW',
      model: '7 Series',
      year: 2024,
      category: 'executive_sedan',
      seats: 4,
      ownerDailyRateKobo: 50_000_000,
      areaLabel: 'Ikoyi',
      approxLatitude: null,
      approxLongitude: null,
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      imageUrls: ['https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/veh-5/card.webp'],
    }),
  },
  {
    id: 'veh-corrupt-invalid-category',
    exists: () => true,
    data: () => ({
      ownerId: 'owner-6',
      displayName: 'Invalid Category Listing',
      make: 'Audi',
      model: 'A8',
      year: 2024,
      category: 'unknown_custom_category',
      seats: 4,
      ownerDailyRateKobo: 50_000_000,
      areaLabel: 'Ikoyi',
      approxLatitude: 6.45,
      approxLongitude: 3.43,
      moderationStatus: 'approved',
      visibility: 'active',
      discoverable: true,
      imageUrls: ['https://storage.googleapis.com/mmg-concierge.appspot.com/public/vehicles/veh-6/card.webp'],
    }),
  },
];

let activeMockDocs = [...mockDocs];

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(async (_docRef) => mockDocs[0]),
  getDocs: vi.fn(async () => ({
    forEach: (callback: any) => {
      activeMockDocs.forEach(callback);
    },
  })),
  limit: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

describe('WebFirestoreDiscoveryGateway', () => {
  const gateway = new WebFirestoreDiscoveryGateway({} as any);

  it('fetches featured vehicles and drops non-discoverable and corrupted rows', async () => {
    activeMockDocs = [...mockDocs];
    const featured = await gateway.getFeaturedVehicles();
    expect(featured.length).toBe(2);
    expect(featured.some((v) => v.id === 'veh-unapproved')).toBe(false);
    expect(featured.some((v) => v.id === 'veh-corrupt-no-images')).toBe(false);
    expect(featured.some((v) => v.id === 'veh-corrupt-missing-coords')).toBe(false);
    expect(featured.some((v) => v.id === 'veh-corrupt-invalid-category')).toBe(false);
    expect(featured[0].displayName).toBeDefined();
    expect(featured[0].primaryImageUrl).toBeDefined();
  });

  it('returns empty array without silent fallback when live database has no vehicles', async () => {
    activeMockDocs = [];
    const featured = await gateway.getFeaturedVehicles();
    expect(featured).toEqual([]);
  });

  it('filters vehicles by category', async () => {
    activeMockDocs = [...mockDocs];
    const sedans = await gateway.searchVehicles({ category: 'executive_sedan' });
    expect(sedans.length).toBe(1);
    expect(sedans[0].id).toBe('veh-live-2');
    expect(sedans[0].category).toBe('executive_sedan');
  });

  it('filters vehicles by minimum seats', async () => {
    activeMockDocs = [...mockDocs];
    const suvs = await gateway.searchVehicles({ minSeats: 6 });
    expect(suvs.length).toBe(1);
    expect(suvs[0].id).toBe('veh-live-1');
    expect(suvs[0].seats).toBe(7);
  });

  it('filters vehicles by query string (make or model)', async () => {
    activeMockDocs = [...mockDocs];
    const benzResults = await gateway.searchVehicles({ query: 'Mercedes' });
    expect(benzResults.length).toBe(1);
    expect(benzResults[0].displayName).toContain('Mercedes-Benz');
  });

  it('retrieves single vehicle by ID', async () => {
    const vehicle = await gateway.getVehicleById('veh-live-1');
    expect(vehicle).not.toBeNull();
    expect(vehicle!.id).toBe('veh-live-1');
    expect(vehicle!.areaLabel).toBe('Ikoyi');
  });
});

describe('web preview discovery boundary', () => {
  it('uses the Prado-led deterministic fleet by default', async () => {
    const gateway = createDiscoveryGateway();
    const vehicles = await gateway.getFeaturedVehicles();

    expect(vehicles.length).toBeGreaterThan(0);
    expect(vehicles[0].id).toMatch(/^preview-/);
    expect(vehicles.some((vehicle) => vehicle.displayName.includes('Prado'))).toBe(true);
  });

  it('keeps preview list and detail identifiers consistent', async () => {
    const gateway = createDiscoveryGateway();
    const [first] = await gateway.getFeaturedVehicles();

    await expect(gateway.getVehicleById(first.id)).resolves.toEqual(first);
    await expect(gateway.getVehicleById('missing-preview-vehicle')).resolves.toBeNull();
  });
});
