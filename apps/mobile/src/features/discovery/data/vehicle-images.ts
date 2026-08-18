import { VehicleSummary, VehicleSummaryImageKey } from '@mmg/contracts';
import { ImageSource } from 'expo-image';

let graphiteSedan: ImageSource = { uri: '/assets/images/fleet/graphite-executive-sedan.png' };
let heroSuv: ImageSource = { uri: '/assets/images/fleet/prado-250-obsidian-hero.png' };
let pearlSuv: ImageSource = { uri: '/assets/images/fleet/prado-150-pearl.png' };
let pradoGraphite: ImageSource = { uri: '/assets/images/fleet/prado-150-graphite.png' };

try {
  graphiteSedan = require('../../../../assets/images/fleet/graphite-executive-sedan.png');
  heroSuv = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');
  pearlSuv = require('../../../../assets/images/fleet/prado-150-pearl.png');
  pradoGraphite = require('../../../../assets/images/fleet/prado-150-graphite.png');
} catch {
  // Running in non-bundler runtime (e.g. Node.js unit test suite)
}

export const vehicleImages: Record<VehicleSummaryImageKey, ImageSource> = {
  'graphite-sedan': graphiteSedan,
  'hero-suv': heroSuv,
  'pearl-suv': pearlSuv,
  'prado-graphite': pradoGraphite,
};

export function resolveVehicleImageSource(
  vehicle?: Partial<VehicleSummary> | null,
): ImageSource {
  if (!vehicle) return vehicleImages['hero-suv'];
  if (vehicle.imageUrl) return { uri: vehicle.imageUrl };
  if (vehicle.primaryImageUrl) return { uri: vehicle.primaryImageUrl };
  if (vehicle.imageUrls && vehicle.imageUrls.length > 0 && vehicle.imageUrls[0]) {
    return { uri: vehicle.imageUrls[0] };
  }
  if (vehicle.imageKey && vehicleImages[vehicle.imageKey]) {
    return vehicleImages[vehicle.imageKey];
  }
  if (vehicle.category === 'executive_sedan') {
    return vehicleImages['graphite-sedan'];
  }
  return vehicleImages['hero-suv'];
}
