import {
  renterVehicleSnapshotSchema,
  type RenterVehicleSnapshot,
  type VehicleSummaryImageKey,
} from '@mmg/contracts';

import { resolvePrimaryImagePath } from '../vehicle/image-processing.js';
import type { PublicObjectUrl } from '../vehicle/renter-vehicle-view.js';
import type { VehicleImageRecord } from '../vehicle/vehicle-repository.js';

export type BookingVehicleSnapshotInput = {
  displayName: string;
  areaLabel: string;
  categoryLabel: string;
  imageKey?: VehicleSummaryImageKey;
  imageUrl?: string;
};

/**
 * Builds the immutable renter-facing vehicle snapshot stored on booking intents.
 * Published Storage image variants are authoritative. Legacy image keys are only
 * retained for old fixture-shaped vehicles when no real published URL exists.
 */
export function buildBookingVehicleSnapshot(
  input: BookingVehicleSnapshotInput,
  images: readonly VehicleImageRecord[],
  publicObjectUrl: PublicObjectUrl,
  options: { allowLegacyImageKeyFallback?: boolean } = {},
): RenterVehicleSnapshot {
  const primaryImagePath = resolvePrimaryImagePath(
    images
      .filter((image) => image.status === 'approved' && image.publicVariantPaths)
      .map((image) => ({
        imageId: image.imageId,
        order: image.order,
        variantPaths: image.publicVariantPaths ?? {},
      })),
  );

  const canonicalImageUrl = primaryImagePath
    ? publicObjectUrl(primaryImagePath)
    : input.imageUrl;

  return renterVehicleSnapshotSchema.parse({
    displayName: input.displayName,
    areaLabel: input.areaLabel,
    categoryLabel: input.categoryLabel,
    ...(canonicalImageUrl
      ? { imageUrl: canonicalImageUrl }
      : options.allowLegacyImageKeyFallback && input.imageKey
        ? { imageKey: input.imageKey }
        : {}),
  });
}
