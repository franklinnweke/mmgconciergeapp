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

const bundledVehicleImageByLegacyPath: Record<string, ImageSource> = {
  '/assets/images/fleet/graphite-executive-sedan.png': graphiteSedan,
  '/assets/images/fleet/prado-150-graphite.png': pradoGraphite,
  '/assets/images/fleet/prado-150-pearl.png': pearlSuv,
  '/assets/images/fleet/prado-250-obsidian-hero.png': heroSuv,
};

function isLegacyBundledAssetPath(url: string): boolean {
  return url.startsWith('/assets/images/fleet/');
}

export function normalizeVehicleImageUrl(url: string): string {
  const cloudStoragePrefix = 'https://storage.googleapis.com/';
  if (!url.startsWith(cloudStoragePrefix)) return url;

  const objectLocation = url.slice(cloudStoragePrefix.length);
  const firstSlash = objectLocation.indexOf('/');
  if (firstSlash <= 0 || firstSlash === objectLocation.length - 1) return url;

  const bucketName = objectLocation.slice(0, firstSlash);
  const publicPath = objectLocation.slice(firstSlash + 1);

  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(
    bucketName,
  )}/o/${encodeURIComponent(publicPath)}?alt=media`;
}

export function resolveVehicleFallbackImageSource(
  vehicle?: Partial<VehicleSummary> | null,
): ImageSource {
  if (vehicle?.imageKey && vehicleImages[vehicle.imageKey]) {
    return vehicleImages[vehicle.imageKey];
  }
  if (vehicle?.category === 'executive_sedan') {
    return vehicleImages['graphite-sedan'];
  }
  return vehicleImages['hero-suv'];
}

export function resolveVehicleImageUrlSource(
  url: string,
  vehicle: Partial<VehicleSummary>,
): ImageSource {
  const bundledSource = bundledVehicleImageByLegacyPath[url];
  if (bundledSource) return bundledSource;

  // Historical fixture documents stored web-root paths in Firestore. Those
  // paths cannot be loaded by an installed iOS or Android app. Missing legacy
  // files must fall back locally instead of being sent to the native loader.
  if (isLegacyBundledAssetPath(url)) {
    return resolveVehicleFallbackImageSource(vehicle);
  }

  return { uri: normalizeVehicleImageUrl(url) };
}

export function resolveVehicleImageSource(
  vehicle?: Partial<VehicleSummary> | null,
): ImageSource {
  if (!vehicle) return resolveVehicleFallbackImageSource(vehicle);
  if (vehicle.imageUrl) return resolveVehicleImageUrlSource(vehicle.imageUrl, vehicle);
  if (vehicle.primaryImageUrl) {
    return resolveVehicleImageUrlSource(vehicle.primaryImageUrl, vehicle);
  }
  if (vehicle.imageUrls && vehicle.imageUrls.length > 0 && vehicle.imageUrls[0]) {
    return resolveVehicleImageUrlSource(vehicle.imageUrls[0], vehicle);
  }
  return resolveVehicleFallbackImageSource(vehicle);
}
