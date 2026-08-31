import { describe, expect, it, vi } from 'vitest';

import {
  WebFirestoreDiscoveryGateway,
  createDiscoveryGateway,
} from './firestore-discovery-gateway.web';

const discoveryVehicle = {
  vehicleId: 'veh-live-1',
  displayName: '2024 Toyota Land Cruiser Prado',
  make: 'Toyota',
  model: 'Land Cruiser Prado',
  year: 2024,
  category: 'executive_suv' as const,
  seats: 7,
  ownerDailyRateKobo: 35_000_000,
  areaLabel: 'Ikoyi',
  approxLatitude: 6.45,
  approxLongitude: 3.43,
  chauffeurPolicy: 'included' as const,
  deliveryPolicy: 'included' as const,
  imageUrls: ['https://example.com/card.webp'],
  primaryImageUrl: 'https://example.com/card.webp',
  description: 'Pristine luxury SUV with uniformed executive chauffeur.',
  features: ['climate_control' as const],
};

const callable = vi.fn((_: unknown, name: string) => {
  if (name === 'getVehicleDetails') {
    return vi.fn(async () => ({ data: { vehicle: discoveryVehicle } }));
  }
  return vi.fn(async () => ({
    data: { vehicles: [{ ...discoveryVehicle, distanceKm: 2.4 }], totalMatches: 1 },
  }));
});

vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (functions: unknown, name: string) => callable(functions, name),
}));

describe('WebFirestoreDiscoveryGateway', () => {
  const gateway = new WebFirestoreDiscoveryGateway({} as any);

  it('loads featured vehicles through the authenticated callable boundary', async () => {
    const vehicles = await gateway.getFeaturedVehicles();
    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].id).toBe('veh-live-1');
    expect(vehicles[0].distanceKm).toBe(2.4);
  });

  it('maps search criteria to the server contract', async () => {
    const vehicles = await gateway.searchVehicles({
      category: 'executive_suv',
      minDailyRateKobo: 20_000_000,
      maxDailyRateKobo: 40_000_000,
    });
    expect(vehicles).toHaveLength(1);
    expect(callable).toHaveBeenCalledWith(expect.anything(), 'searchVehicles');
  });

  it('loads detail through getVehicleDetails', async () => {
    const vehicle = await gateway.getVehicleById('veh-live-1');
    expect(vehicle?.id).toBe('veh-live-1');
    expect(callable).toHaveBeenCalledWith(expect.anything(), 'getVehicleDetails');
  });
});

describe('web preview discovery boundary', () => {
  it('uses deterministic preview data when no live Functions instance is supplied', async () => {
    const gateway = createDiscoveryGateway();
    const vehicles = await gateway.getFeaturedVehicles();
    expect(vehicles.length).toBeGreaterThan(0);
    expect(vehicles[0].id).toMatch(/^preview-/);
  });
});
