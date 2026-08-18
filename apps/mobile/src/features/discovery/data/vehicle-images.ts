import { VehicleSummary, VehicleSummaryImageKey } from '@mmg/contracts';
import { ImageSource } from 'expo-image';

let graphiteSedan: ImageSource = { uri: '/assets/images/fleet/graphite-executive-sedan.png' };
let heroSuv: ImageSource = { uri: '/assets/images/fleet/prado-250-obsidian-hero.png' };
let pearlSuv: ImageSource = { uri: '/assets/images/fleet/prado-150-pearl.png' };
let pradoGraphite: ImageSource = { uri: '/assets/images/fleet/prado-150-graphite.png' };
let lc300White: ImageSource = { uri: '/assets/images/fleet/lc300-vxr-white.png' };
let mercedesS580: ImageSource = { uri: '/assets/images/fleet/mercedes-s580-black.png' };
let mercedesVclass: ImageSource = { uri: '/assets/images/fleet/mercedes-vclass-vip.png' };
let mercedesG63: ImageSource = { uri: '/assets/images/fleet/mercedes-g63-black.png' };
let lexusLx600: ImageSource = { uri: '/assets/images/fleet/lexus-lx600-pearl.png' };

try {
  graphiteSedan = require('../../../../assets/images/fleet/graphite-executive-sedan.png');
  heroSuv = require('../../../../assets/images/fleet/prado-250-obsidian-hero.png');
  pearlSuv = require('../../../../assets/images/fleet/prado-150-pearl.png');
  pradoGraphite = require('../../../../assets/images/fleet/prado-150-graphite.png');
  lc300White = require('../../../../assets/images/fleet/lc300-vxr-white.png');
  mercedesS580 = require('../../../../assets/images/fleet/mercedes-s580-black.png');
  mercedesVclass = require('../../../../assets/images/fleet/mercedes-vclass-vip.png');
  mercedesG63 = require('../../../../assets/images/fleet/mercedes-g63-black.png');
  lexusLx600 = require('../../../../assets/images/fleet/lexus-lx600-pearl.png');
} catch {
  // Running in non-bundler runtime (e.g. Node.js unit test suite)
}

export const vehicleImages: Record<VehicleSummaryImageKey, ImageSource> = {
  'graphite-sedan': graphiteSedan,
  'hero-suv': heroSuv,
  'pearl-suv': pearlSuv,
  'prado-graphite': pradoGraphite,
  'lc300-white': lc300White,
  'mercedes-s580': mercedesS580,
  'mercedes-vclass': mercedesVclass,
  'mercedes-g63': mercedesG63,
  'lexus-lx600': lexusLx600,
};

export function resolveVehicleImageSource(
  vehicle?: Partial<VehicleSummary> | null,
): ImageSource {
  if (!vehicle) return vehicleImages['hero-suv'];

  // Check explicit imageKey first if present
  if (vehicle.imageKey && vehicleImages[vehicle.imageKey]) {
    return vehicleImages[vehicle.imageKey];
  }

  // Model-based matching for named fleet assets
  const name = (vehicle.displayName || `${vehicle.make} ${vehicle.model}`).toLowerCase();
  if (name.includes('prado 250') || name.includes('land cruiser prado 250')) {
    return vehicleImages['hero-suv'];
  }
  if (name.includes('prado 150 vx') || name.includes('pearl')) {
    return vehicleImages['pearl-suv'];
  }
  if (name.includes('prado 150 txl') || name.includes('graphite')) {
    return vehicleImages['prado-graphite'];
  }
  if (name.includes('300') || name.includes('lc300') || name.includes('lc 300')) {
    return vehicleImages['lc300-white'];
  }
  if (name.includes('s 580') || name.includes('s580') || name.includes('s-class')) {
    return vehicleImages['mercedes-s580'];
  }
  if (name.includes('v-class') || name.includes('v class') || name.includes('jet edition')) {
    return vehicleImages['mercedes-vclass'];
  }
  if (name.includes('g 63') || name.includes('g63') || name.includes('g-wagon')) {
    return vehicleImages['mercedes-g63'];
  }
  if (name.includes('lx 600') || name.includes('lx600') || name.includes('lexus')) {
    return vehicleImages['lexus-lx600'];
  }

  if (vehicle.imageUrl) return { uri: vehicle.imageUrl };
  if (vehicle.primaryImageUrl) return { uri: vehicle.primaryImageUrl };
  if (vehicle.imageUrls && vehicle.imageUrls.length > 0 && vehicle.imageUrls[0]) {
    return { uri: vehicle.imageUrls[0] };
  }

  if (vehicle.category === 'executive_sedan') {
    return vehicleImages['mercedes-s580'];
  }
  if (vehicle.category === 'luxury_van') {
    return vehicleImages['mercedes-vclass'];
  }
  return vehicleImages['hero-suv'];
}
