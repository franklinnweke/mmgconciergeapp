import type {
  VehicleImageVariant,
  VehicleModerationStatus,
  VehicleVisibility,
} from '@mmg/contracts';
import { computeDiscoverable } from '@mmg/domain';

import { publicVariantPath } from './image-processing.js';
import { hasRenterPublishedImage, isRenterVehicleDetailsReady } from './renter-vehicle-view.js';
import type { VehicleStorageGateway } from './vehicle-storage-gateway.js';
import { PUBLIC_VARIANT_CACHE_CONTROL } from './vehicle-storage-gateway.js';

/**
 * Approved-only public promotion.
 *
 * `public/vehicles/...` is the single world-readable prefix in the bucket, so
 * copying bytes into it *is* publication. Two rules follow, and every function
 * here exists to keep them:
 *
 * 1. **Nothing is published before the approval is durable.** Bytes are copied
 *    only after the review transaction commits. The reverse order would put a
 *    vehicle's photos on the open internet and then discover the approval failed
 *    to save — moderation exists precisely to stop some of those photos being
 *    published at all.
 * 2. **No record claims a public path that has no object.** `publicVariantPaths`
 *    is stamped only after the copies succeed, and it names exactly the variants
 *    that were copied — never the full variant list.
 *
 * The cost of that ordering is that a crash between the copy and the stamp
 * leaves bytes in the public prefix that no record references. They are
 * unreachable through the app (nothing links to them) and they belong to a
 * listing a moderator did approve, so they are safe; `needsPromotion` still
 * reports the image as unpromoted, which is what a reconciler would look for.
 */

/** The subset of an image record that promotion cares about. */
export type PromotableImage = {
  imageId: string;
  status: 'processed' | 'rejected' | 'approved';
  /** Variant name → private path. Only variants listed here were ever written. */
  variantPaths: Record<string, string>;
  publicVariantPaths: Record<string, string> | null;
  promotedAt: string | null;
};

/**
 * The invariant these two predicates encode:
 *
 *   public bytes exist  ⟺  moderationStatus === 'approved' && visibility === 'active'
 *
 * `servable` is that conjunction, decided by the caller. Keeping it a single
 * boolean is deliberate — moderation review and owner visibility changes both
 * move the listing across the same line, and two predicates with two different
 * notions of "live" is how a suspended listing keeps serving photos.
 */

/** True when the image should be public and is not yet. */
export function needsPromotion(image: PromotableImage, servable: boolean): boolean {
  return servable && image.status === 'approved' && image.publicVariantPaths === null;
}

/** True when public bytes exist that should no longer be served. */
export function needsDemotion(image: PromotableImage, servable: boolean): boolean {
  if (image.publicVariantPaths === null) return false;
  return !servable || image.status !== 'approved';
}

/**
 * Copies an approved image's private variants into the public prefix.
 *
 * Returns the paths actually written, keyed by variant. Throws if any copy
 * fails: a partial promotion must not be stamped, because the record would then
 * name an object that is missing.
 *
 * `contentTypeByVariant` comes from the image's own processing record, so the
 * published object declares what was actually encoded rather than a guess.
 */
export async function promoteImage(
  vehicleId: string,
  image: PromotableImage,
  storageGateway: VehicleStorageGateway,
  contentTypeByVariant: Record<string, string> = {},
): Promise<Record<string, string>> {
  const promoted: Record<string, string> = {};

  for (const [variant, privatePath] of Object.entries(image.variantPaths)) {
    const destination = publicVariantPath(vehicleId, image.imageId, variant as VehicleImageVariant);
    await storageGateway.copyObject(privatePath, destination, {
      contentType: contentTypeByVariant[variant] ?? 'image/jpeg',
      // Variant paths are unique per imageId — a replaced photo gets a new path
      // rather than new bytes at an old one — so this can be cached hard.
      cacheControl: PUBLIC_VARIANT_CACHE_CONTROL,
      // Deliberately empty. Nothing about the owner travels with a public photo.
      metadata: {},
    });
    promoted[variant] = destination;
  }

  return promoted;
}

/**
 * Removes an image's public bytes.
 *
 * Deletes every path the record claims, not a freshly derived list, so an object
 * written under an older path scheme is still cleaned up. Idempotent — the
 * gateway ignores objects that are already gone — which is what makes a retried
 * suspension safe.
 */
export async function demoteImage(
  image: PromotableImage,
  storageGateway: VehicleStorageGateway,
): Promise<void> {
  for (const publicPath of Object.values(image.publicVariantPaths ?? {})) {
    await storageGateway.deleteObject(publicPath);
  }
}

/**
 * Per-variant content types for each image, keyed by imageId.
 *
 * Read off the stored processing facts rather than inferred from the variant
 * name, so a published object declares the type that was actually encoded.
 */
export function contentTypesForImages(
  images: ReadonlyArray<{
    imageId: string;
    processing: { variants: Record<string, { contentType: string }> };
  }>,
): Record<string, Record<string, string>> {
  return Object.fromEntries(
    images.map((image) => [
      image.imageId,
      Object.fromEntries(
        Object.entries(image.processing.variants).map(([variant, record]) => [
          variant,
          record.contentType,
        ]),
      ),
    ]),
  );
}

// ── The publication step, shared by moderation review and owner visibility ──

/** What a service's decision transaction hands to publication. */
export type PublicationOutcome = {
  /** approved && active, as decided by the committing transaction. */
  servable: boolean;
  moderationStatus: string;
  visibility: string;
  images: PromotableImage[];
};

export type PublicationContext = {
  vehicleId: string;
  actorId: string;
  actorType: 'owner' | 'vehicle_admin' | 'super_admin' | 'system';
  requestId: string;
  now: Date;
  outcome: PublicationOutcome;
  repository: PublicationRepository;
  storageGateway: VehicleStorageGateway;
  onPromotionFailure?: (error: unknown, context: { vehicleId: string; requestId: string }) => void;
  /** Per-variant content types, keyed by imageId, taken from processing facts. */
  contentTypesByImageId?: Record<string, Record<string, string>>;
};

/**
 * The narrow slice of the vehicle repository publication needs. Declared here
 * rather than imported so this module does not depend on the full command-side
 * transaction surface.
 */
export type PublicationRepository = {
  runTransaction<T>(
    work: (transaction: {
      getVehicle(vehicleId: string): Promise<PublicationVehicle | null>;
      getVehicleImages(vehicleId: string): Promise<PublicationImage[]>;
      setVehicle(vehicleId: string, record: PublicationVehicle, now: Date): void;
      setVehicleImage(vehicleId: string, imageId: string, record: PublicationImage, now: Date): void;
      createAuditEvent(event: {
        actorId: string;
        actorType: 'owner' | 'vehicle_admin' | 'super_admin' | 'system';
        entityId: string;
        entityType: 'vehicle' | 'vehiclePrivate' | 'vehicleImage' | 'vehicleRevision';
        eventType: string;
        requestId: string;
        occurredAt: Date;
        details?: Record<string, unknown>;
      }): void;
    }) => Promise<T>,
  ): Promise<T>;
};

type PublicationVehicle = {
  moderationStatus: string;
  visibility: string;
  discoverable: boolean;
  updatedAt: string;
  [key: string]: unknown;
};

type PublicationImage = PromotableImage & { updatedAt: string; [key: string]: unknown };

/**
 * Moves the bytes, then records where they landed.
 *
 * Never throws. By the time this runs the caller's decision is committed, so a
 * storage failure is not a failed command — it is an unpublished listing, which
 * stays non-discoverable and is recorded as `vehicle.publication_incomplete`.
 */
export async function applyPublication(context: PublicationContext): Promise<void> {
  const { vehicleId, outcome, storageGateway, repository, now } = context;

  const promotions = new Map<string, Record<string, string>>();
  const demotions: string[] = [];

  try {
    for (const image of outcome.images) {
      if (needsPromotion(image, outcome.servable)) {
        promotions.set(
          image.imageId,
          await promoteImage(
            vehicleId,
            image,
            storageGateway,
            context.contentTypesByImageId?.[image.imageId] ?? {},
          ),
        );
      } else if (needsDemotion(image, outcome.servable)) {
        await demoteImage(image, storageGateway);
        demotions.push(image.imageId);
      }
    }
  } catch (error) {
    context.onPromotionFailure?.(error, { vehicleId, requestId: context.requestId });
    await recordPublicationGap(context);
    return;
  }

  if (promotions.size === 0 && demotions.length === 0) {
    return;
  }

  try {
    await repository.runTransaction(async (transaction) => {
      // Re-read: the committing transaction's version is stale by now, and
      // another operation may have moved the listing on.
      const vehicle = await transaction.getVehicle(vehicleId);
      if (!vehicle) return;

      // Decided before any write. An early `return` inside a transaction does
      // not roll back writes already staged on it, so the supersede test cannot
      // sit after the stamping loop — a listing paused mid-publication would
      // commit public paths and go on serving photos.
      const superseded =
        vehicle.moderationStatus !== outcome.moderationStatus ||
        vehicle.visibility !== outcome.visibility;

      const images = await transaction.getVehicleImages(vehicleId);

      for (const image of images) {
        if (promotions.has(image.imageId)) {
          // Superseded: the bytes are in the public prefix but nothing will
          // reference them. Unreachable orphans are the accepted worst case
          // here; a record claiming them on a listing that is no longer live
          // would not be.
          if (superseded) continue;

          transaction.setVehicleImage(
            vehicleId,
            image.imageId,
            {
              ...image,
              publicVariantPaths: promotions.get(image.imageId)!,
              promotedAt: now.toISOString(),
              updatedAt: now.toISOString(),
            },
            now,
          );
          continue;
        }

        // Demotions are recorded unconditionally, superseded or not: the
        // objects are already deleted, so leaving the paths stamped would make
        // the record name objects that do not exist.
        if (demotions.includes(image.imageId)) {
          transaction.setVehicleImage(
            vehicleId,
            image.imageId,
            {
              ...image,
              publicVariantPaths: null,
              promotedAt: null,
              updatedAt: now.toISOString(),
            },
            now,
          );
          continue;
        }
      }

      const publishedImages = images.map((image) => ({
        ...image,
        publicVariantPaths: demotions.includes(image.imageId) ? null
          : !superseded && promotions.has(image.imageId) ? promotions.get(image.imageId)!
          : image.publicVariantPaths,
      }));

      // The newer state is authoritative and owns its own discoverability;
      // publication does not reinstate a superseded decision.
      const nextDiscoverable = superseded
        ? vehicle.discoverable
        : computeDiscoverable({
            moderationStatus: vehicle.moderationStatus as VehicleModerationStatus,
            visibility: vehicle.visibility as VehicleVisibility,
            hasApprovedSnapshot: hasRenterPublishedImage(publishedImages),
          }) && isRenterVehicleDetailsReady(vehicle);

      if (nextDiscoverable !== vehicle.discoverable) {
        transaction.setVehicle(
          vehicleId,
          {
            ...vehicle,
            discoverable: nextDiscoverable,
            lastDecisionReason: nextDiscoverable ? null : vehicle.lastDecisionReason,
            updatedAt: now.toISOString(),
          },
          now,
        );
      }

      transaction.createAuditEvent({
        actorId: context.actorId,
        actorType: context.actorType,
        entityId: vehicleId,
        entityType: 'vehicle',
        eventType: 'vehicle.images_published',
        requestId: context.requestId,
        occurredAt: now,
        details: {
          promotedImageIds: superseded ? [] : [...promotions.keys()],
          demotedImageIds: demotions,
          // Named rather than merely counted: these are the public objects a
          // reconciler has to clean up.
          abandonedPromotionImageIds: superseded ? [...promotions.keys()] : [],
          discoverable: nextDiscoverable,
          superseded,
        },
      });
    });
  } catch (error) {
    context.onPromotionFailure?.(error, { vehicleId, requestId: context.requestId });
    await recordPublicationGap(context);
  }
}

/**
 * Records that a committed decision has not been fully published.
 *
 * An audit event rather than a thrown error, because the decision itself
 * succeeded. The listing stays non-discoverable until a later activation or
 * reconciliation publishes it.
 */
async function recordPublicationGap(context: PublicationContext): Promise<void> {
  try {
    await context.repository.runTransaction(async (transaction) => {
      transaction.createAuditEvent({
        actorId: context.actorId,
        actorType: context.actorType,
        entityId: context.vehicleId,
        entityType: 'vehicle',
        eventType: 'vehicle.publication_incomplete',
        requestId: context.requestId,
        occurredAt: context.now,
        details: { discoverable: false },
      });
    });
  } catch {
    // Nothing further to do: the decision stands, the listing is not live, and
    // the caller has already been told through onPromotionFailure.
  }
}
