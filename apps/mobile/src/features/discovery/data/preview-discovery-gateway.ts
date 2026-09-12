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

  const matchesSeats = !criteria.minSeats || vehicle.seats >= criteria.minSeats;
  const matchesMinPrice = !criteria.minDailyRateKobo || vehicle.dailyRateKobo >= criteria.minDailyRateKobo;
  const matchesMaxPrice = !criteria.maxDailyRateKobo || vehicle.dailyRateKobo <= criteria.maxDailyRateKobo;

  return (
    matchesQuery &&
    matchesSeats &&
    matchesMinPrice &&
    matchesMaxPrice &&
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

export function getPreviewVehicleById(vehicleId: string): VehicleSummary | null {
  return vehicles.find((vehicle) => vehicle.id === vehicleId) ?? null;
}

export const previewDiscoveryGateway: DiscoveryGateway = {
  async getFeaturedVehicles() {
    return [...vehicles].sort((left, right) => left.distanceKm - right.distanceKm);
  },
  async searchVehicles(criteria) {
    return filterPreviewVehicles(criteria);
  },
  async getVehicleById(vehicleId) {
    return getPreviewVehicleById(vehicleId);
  },
  async resolveSearchPlace(query: string) {
    const q = query.trim().toLowerCase();
    if (q.includes('ikoyi') || q.includes('wheatbaker')) {
      return {
        placeId: 'preview-ikoyi',
        areaLabel: 'Ikoyi',
        displayName: 'The Wheatbaker, Ikoyi, Lagos',
        approxLatitude: 6.4485,
        approxLongitude: 3.4385,
        withinLagos: true,
      };
    }
    if (q.includes('airport') || q.includes('mma') || q.includes('execujet')) {
      return {
        placeId: 'preview-airport',
        areaLabel: 'Ikeja',
        displayName: 'Murtala Muhammed Airport, Ikeja, Lagos',
        approxLatitude: 6.5774,
        approxLongitude: 3.3212,
        withinLagos: true,
      };
    }
    return {
      placeId: 'preview-vi',
      areaLabel: 'Victoria Island',
      displayName: 'Eko Hotel & Suites, Victoria Island, Lagos',
      approxLatitude: 6.4269,
      approxLongitude: 3.4285,
      withinLagos: true,
    };
  },
};
