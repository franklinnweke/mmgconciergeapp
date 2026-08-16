import { DiscoveryGateway, VehicleSearchCriteria, VehicleSummary } from '@mmg/contracts';

const vehicles = [
  {
    areaLabel: 'Victoria Island',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 385_000_00,
    deliveryPolicy: 'included',
    displayName: 'Prado 150 — Pearl',
    distanceKm: 3.2,
    id: 'preview-prado-pearl',
    imageKey: 'pearl-suv',
    seats: 6,
  },
  {
    areaLabel: 'Ikoyi',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 450_000_00,
    deliveryPolicy: 'included',
    displayName: 'Prado 250 — Obsidian',
    distanceKm: 5.7,
    id: 'preview-prado-250',
    imageKey: 'hero-suv',
    seats: 6,
  },
  {
    areaLabel: 'Lekki',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 360_000_00,
    deliveryPolicy: 'included',
    displayName: 'Prado 150 — Graphite',
    distanceKm: 6.1,
    id: 'preview-prado-graphite',
    imageKey: 'prado-graphite',
    seats: 6,
  },
  {
    areaLabel: 'Lagos Island',
    category: 'executive_sedan',
    chauffeurPolicy: 'included',
    dailyRateKobo: 420_000_00,
    deliveryPolicy: 'included',
    displayName: 'Obsidian Executive Saloon',
    distanceKm: 8.4,
    id: 'preview-executive-saloon',
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
  return vehicles
    .filter((vehicle) => matchesCriteria(vehicle, criteria))
    .slice()
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function getPreviewVehicleById(vehicleId: string) {
  return vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
}

export const previewDiscoveryGateway: DiscoveryGateway = {
  async getFeaturedVehicles() {
    return [...vehicles].sort((left, right) => left.distanceKm - right.distanceKm);
  },
  async searchVehicles(criteria) {
    return filterPreviewVehicles(criteria);
  },
};
