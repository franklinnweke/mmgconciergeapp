import { DiscoveryGateway, VehicleSearchCriteria, VehicleSummary } from '@mmg/contracts';

const vehicles = [
  {
    areaLabel: 'Ikoyi, Lagos',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 385_000_00,
    deliveryPolicy: 'included',
    description: '2024 Toyota Land Cruiser Prado 250 First Edition in Obsidian Black. Equipped with high-clearance executive suspension, dual-zone climate control, privacy glass, and certified executive chauffeur.',
    displayName: 'Toyota Land Cruiser Prado 250 First Edition',
    distanceKm: 2.4,
    id: 'preview-prado-250-first-edition',
    imageKey: 'hero-suv',
    make: 'Toyota',
    model: 'Land Cruiser Prado 250',
    seats: 7,
    year: 2024,
  },
  {
    areaLabel: 'Victoria Island, Lagos',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 290_000_00,
    deliveryPolicy: 'included',
    description: '2023 Toyota Land Cruiser Prado 150 VX in Pearl White metallic. High-grade executive interior, whisper-quiet cabin, cool-box refrigeration, and professional diplomatic driver.',
    displayName: 'Toyota Land Cruiser Prado 150 VX Luxury',
    distanceKm: 3.2,
    id: 'preview-prado-150-vx-pearl',
    imageKey: 'pearl-suv',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 VX',
    seats: 7,
    year: 2023,
  },
  {
    areaLabel: 'Lekki Phase 1, Lagos',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 250_000_00,
    deliveryPolicy: 'included',
    description: '2022 Toyota Land Cruiser Prado 150 TXL in Metallic Graphite Grey. Robust Lagos-road resilience, rear passenger comfort, and certified security-vetted driver.',
    displayName: 'Toyota Land Cruiser Prado 150 TXL',
    distanceKm: 5.1,
    id: 'preview-prado-150-txl-graphite',
    imageKey: 'prado-graphite',
    make: 'Toyota',
    model: 'Land Cruiser Prado 150 TXL',
    seats: 7,
    year: 2022,
  },
  {
    areaLabel: 'Banana Island, Ikoyi, Lagos',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 550_000_00,
    deliveryPolicy: 'included',
    description: '2024 Toyota Land Cruiser 300 VXR VIP Flagship in Super White. Twin-turbo V6, ventilated executive leather, heads-up display, and VIP protocol chauffeur.',
    displayName: 'Toyota Land Cruiser 300 VXR VIP',
    distanceKm: 4.8,
    id: 'preview-lc300-vxr-vip',
    imageKey: 'lc300-white',
    make: 'Toyota',
    model: 'Land Cruiser 300 VXR',
    seats: 7,
    year: 2024,
  },
  {
    areaLabel: 'Victoria Island, Lagos',
    category: 'executive_sedan',
    chauffeurPolicy: 'included',
    dailyRateKobo: 480_000_00,
    deliveryPolicy: 'included',
    description: '2023 Mercedes-Benz S 580 long-wheelbase in Obsidian Black. Rear executive reclining lounge with calf rests, Burmester 3D surround sound, and uniformed executive chauffeur.',
    displayName: 'Mercedes-Benz S 580 4MATIC Executive Saloon',
    distanceKm: 3.9,
    id: 'preview-mercedes-s580-saloon',
    imageKey: 'mercedes-s580',
    make: 'Mercedes-Benz',
    model: 'S 580 4MATIC',
    seats: 4,
    year: 2023,
  },
  {
    areaLabel: 'Murtala Muhammed Airport, Lagos',
    category: 'luxury_van',
    chauffeurPolicy: 'included',
    dailyRateKobo: 420_000_00,
    deliveryPolicy: 'included',
    description: '2023 Mercedes-Benz V-Class VIP Jet Lounge in Obsidian Black. 4 facing first-class electric captain chairs, privacy partition, Wi-Fi router, and direct tarmac VIP pickup.',
    displayName: 'Mercedes-Benz V-Class VIP Jet Edition',
    distanceKm: 9.6,
    id: 'preview-mercedes-vclass-jet',
    imageKey: 'mercedes-vclass',
    make: 'Mercedes-Benz',
    model: 'V-Class Extra Long',
    seats: 6,
    year: 2023,
  },
  {
    areaLabel: 'Ikoyi, Lagos',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 650_000_00,
    deliveryPolicy: 'included',
    description: '2023 Mercedes-AMG G 63 in Obsidian Black with Night Package. Handcrafted 4.0L V8 Biturbo, unmistakable executive road authority, and defensive-driving trained security escort driver.',
    displayName: 'Mercedes-AMG G 63 Executive Escort',
    distanceKm: 2.8,
    id: 'preview-mercedes-g63-amg',
    imageKey: 'mercedes-g63',
    make: 'Mercedes-AMG',
    model: 'G 63',
    seats: 5,
    year: 2023,
  },
  {
    areaLabel: 'Eko Atlantic, Lagos',
    category: 'executive_suv',
    chauffeurPolicy: 'included',
    dailyRateKobo: 580_000_00,
    deliveryPolicy: 'included',
    description: '2024 Lexus LX 600 Ultra Luxury in Eminent White Pearl. 4-seat VIP executive layout with Ottoman footrest, Mark Levinson 25-speaker audio, and white-glove chauffeur service.',
    displayName: 'Lexus LX 600 Ultra Luxury Lounge',
    distanceKm: 4.1,
    id: 'preview-lexus-lx600-vip',
    imageKey: 'lexus-lx600',
    make: 'Lexus',
    model: 'LX 600 Ultra Luxury',
    seats: 4,
    year: 2024,
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
};
