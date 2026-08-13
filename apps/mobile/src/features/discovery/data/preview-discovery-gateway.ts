import { DiscoveryGateway, VehicleSearchCriteria, VehicleSummary } from '@mmg/contracts';

const vehicles = [
  {
    areaLabel: 'Victoria Island',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 385_000_00,
    deliveryPolicy: 'included',
    displayName: 'Pearl Executive SUV',
    distanceKm: 3.2,
    id: 'preview-pearl-suv',
    imageKey: 'pearl-suv',
    seats: 6,
  },
  {
    areaLabel: 'Ikoyi',
    category: 'executive_sedan',
    chauffeurPolicy: 'included',
    dailyRateKobo: 450_000_00,
    deliveryPolicy: 'included',
    displayName: 'Obsidian Executive Saloon',
    distanceKm: 5.7,
    id: 'preview-graphite-sedan',
    imageKey: 'graphite-sedan',
    seats: 4,
  },
  {
    areaLabel: 'Lekki',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 360_000_00,
    deliveryPolicy: 'included',
    displayName: 'Onyx Executive SUV',
    distanceKm: 8.4,
    id: 'preview-onyx-suv',
    imageKey: 'hero-suv',
    seats: 6,
  },
  {
    areaLabel: 'Lagos Island',
    category: 'executive_sedan',
    chauffeurPolicy: 'included',
    dailyRateKobo: 420_000_00,
    deliveryPolicy: 'included',
    displayName: 'Silverline Executive Saloon',
    distanceKm: 6.1,
    id: 'preview-silverline-sedan',
    imageKey: 'graphite-sedan',
    seats: 4,
  },
] as const satisfies readonly VehicleSummary[];

function matchesCriteria(vehicle: VehicleSummary, criteria: VehicleSearchCriteria) {
  const query = criteria.query?.trim().toLocaleLowerCase();
  const matchesQuery =
    !query ||
    vehicle.displayName.toLocaleLowerCase().includes(query) ||
    vehicle.areaLabel.toLocaleLowerCase().includes(query);

  return (
    matchesQuery &&
    (!criteria.areaLabel || vehicle.areaLabel === criteria.areaLabel) &&
    (!criteria.category || vehicle.category === criteria.category)
  );
}

export function filterPreviewVehicles(criteria: VehicleSearchCriteria) {
  return vehicles.filter((vehicle) => matchesCriteria(vehicle, criteria));
}

export function getPreviewVehicleById(vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
}

export const previewDiscoveryGateway: DiscoveryGateway = {
  async getFeaturedVehicles() {
    return vehicles.slice(0, 2);
  },
  async searchVehicles(criteria) {
    return filterPreviewVehicles(criteria);
  },
};
