import {
  MAX_VEHICLE_IMAGES,
  renterVisibleVehicleSchema,
  type RenterVisibleVehicle,
} from '@mmg/contracts';
import { resolveVehicleDiscoveryLocation } from '@mmg/domain';

import { PRIMARY_IMAGE_VARIANT } from './image-processing.js';
import type { VehicleImageRecord, VehicleRecord } from './vehicle-repository.js';

/**
 * The renter-facing projection of a listing.
 *
 * This is the only place a vehicle becomes visible to someone who does not own
 * it, so it is written as a whitelist: every field is named explicitly and the
 * result is validated against `renterVisibleVehicleSchema` (which is `.strict()`)
 * before it is returned. A spread of the stored record would silently publish
 * whatever field is added to `VehicleRecord` next.
 *
 * It never accepts a `VehiclePrivateRecord`. Plate, street address, exact
 * coordinates, place id and document paths live there, and a function that
 * cannot see them cannot leak them — a stronger guarantee than remembering to
 * omit them.
 *
 * Photo URLs come only from `publicVariantPaths`, which `image-promotion.ts`
 * stamps after the bytes are in the renter-readable prefix. A private variant
 * path is never turned into a URL.
 */

/** Maps a renter-readable Firebase Storage object path to a media URL. */
export type PublicObjectUrl = (publicPath: string) => string;

/**
 * Media URLs for objects exposed by Firebase Storage Rules.
 *
 * `allow read: if true` is a Firebase Storage Rules decision. It does not make
 * the same object anonymously readable through the raw `storage.googleapis.com`
 * Cloud Storage endpoint, which is governed by GCS IAM. Use the Firebase Storage
 * media endpoint so the request is evaluated against the repository's Storage
 * Rules instead of relying on bucket-level public IAM.
 */
export function googleCloudStoragePublicUrl(bucketName: string): PublicObjectUrl {
  if (!bucketName) {
    throw new Error('googleCloudStoragePublicUrl: bucket name is required.');
  }

  const encodedBucket = encodeURIComponent(bucketName);
  return (publicPath: string) =>
    `https://firebasestorage.googleapis.com/v0/b/${encodedBucket}/o/${encodeURIComponent(
      publicPath,
    )}?alt=media`;
}

/** Why a listing was not renter-visible. Reported, never guessed at by callers. */
export type RenterVehicleDropReason =
  | 'not_discoverable'
  | 'not_approved'
  | 'not_active'
  | 'no_published_images'
  | 'invalid_projection';

export type RenterVehicleViewOptions = {
  /** Called instead of throwing when a listing cannot be projected. */
  onDropped?: (vehicleId: string, reason: RenterVehicleDropReason) => void;
};

const renterVehicleDetailsSchema = renterVisibleVehicleSchema.omit({ imageUrls: true, primaryImageUrl: true });

function renterVehicleDetails(vehicle: Record<string, unknown>) {
  const location = resolveVehicleDiscoveryLocation({
    areaLabel: vehicle.areaLabel,
    approxLatitude: vehicle.approxLatitude,
    approxLongitude: vehicle.approxLongitude,
  });
  return {
    vehicleId: vehicle.vehicleId,
    ownerId: vehicle.ownerId,
    displayName: vehicle.displayName,
    category: vehicle.category,
    seats: vehicle.seats,
    areaLabel: vehicle.areaLabel,
    approxLatitude: location?.lat ?? null,
    approxLongitude: location?.lng ?? null,
    ownerDailyRateKobo: vehicle.ownerDailyRateKobo,
    chauffeurPolicy: vehicle.chauffeurPolicy,
    deliveryPolicy: vehicle.deliveryPolicy,
    description: vehicle.description,
    features: vehicle.features,
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
  };
}

/** Shared readiness check: publication must satisfy the same details as discovery. */
export function isRenterVehicleDetailsReady(vehicle: Record<string, unknown>): boolean {
  return renterVehicleDetailsSchema.safeParse(renterVehicleDetails(vehicle)).success;
}

type PublishedImageCandidate = Pick<VehicleImageRecord, 'status' | 'publicVariantPaths'>;

function publishedImagePath(image: PublishedImageCandidate): string | null {
  if (image.status !== 'approved' || !image.publicVariantPaths) return null;
  const path = image.publicVariantPaths[PRIMARY_IMAGE_VARIANT] ?? Object.values(image.publicVariantPaths)[0];
  return typeof path === 'string' && path.length > 0 ? path : null;
}

/** Publication uses the same approved-photo predicate as the renter projection. */
export function hasRenterPublishedImage(images: readonly PublishedImageCandidate[]): boolean {
  return images.some((image) => publishedImagePath(image) !== null);
}

/**
 * Projects a stored listing for renters, or returns null if it is not visible.
 *
 * Null rather than a partial DTO: `renterVisibleVehicleSchema` requires at least
 * one image URL, and a listing with no published photo is not something a renter
 * can be shown. Returning null per listing (rather than throwing) is what lets a
 * discovery query drop one bad row instead of failing the whole page.
 */
export function toRenterVisibleVehicle(
  vehicle: VehicleRecord,
  images: VehicleImageRecord[],
  publicObjectUrl: PublicObjectUrl,
  options: RenterVehicleViewOptions = {},
): RenterVisibleVehicle | null {
  const drop = (reason: RenterVehicleDropReason): null => {
    options.onDropped?.(vehicle.vehicleId, reason);
    return null;
  };

  // All three are checked, not just `discoverable`. That flag is derived state:
  // if a document ever carries a stale `true` — a legacy write, a restore from
  // backup, a bug in a future command — the status and visibility it was derived
  // from still have to agree before anything is served.
  if (!vehicle.discoverable) return drop('not_discoverable');
  if (vehicle.moderationStatus !== 'approved') return drop('not_approved');
  if (vehicle.visibility !== 'active') return drop('not_active');

  const imageUrls: string[] = [];
  for (const image of [...images].sort((a, b) => a.order - b.order)) {
    // Both conditions, for the same reason as above: `publicVariantPaths` is the
    // record of what was published, `status` is the moderation fact. A rejected
    // image with paths still stamped is a listing mid-demotion, not a photo to
    // show.
    const path = publishedImagePath(image);
    if (path) imageUrls.push(publicObjectUrl(path));
    if (imageUrls.length === MAX_VEHICLE_IMAGES) break;
  }

  if (imageUrls.length === 0) return drop('no_published_images');

  const projection = {
    ...renterVehicleDetails(vehicle),
    imageUrls,
    primaryImageUrl: imageUrls[0],
  };

  const parsed = renterVisibleVehicleSchema.safeParse(projection);
  if (!parsed.success) return drop('invalid_projection');
  return parsed.data;
}

/**
 * Projects a page of listings, dropping the ones that are not visible.
 *
 * The count of dropped listings is worth surfacing: a discovery page that is
 * quietly short is indistinguishable from a city with fewer cars in it.
 */
export function toRenterVisibleVehicles(
  sources: ReadonlyArray<{ vehicle: VehicleRecord; images: VehicleImageRecord[] }>,
  publicObjectUrl: PublicObjectUrl,
  options: RenterVehicleViewOptions = {},
): RenterVisibleVehicle[] {
  const visible: RenterVisibleVehicle[] = [];
  for (const source of sources) {
    const projected = toRenterVisibleVehicle(
      source.vehicle,
      source.images,
      publicObjectUrl,
      options,
    );
    if (projected) visible.push(projected);
  }
  return visible;
}
