import {
  AdminStorageGateway,
  type StorageGateway,
  type StoredObjectMetadata,
} from '../owner/storage-validation.js';

/**
 * The write side of Cloud Storage, needed only by vehicle image processing.
 *
 * Kept separate from the owner `StorageGateway` on purpose: owner verification
 * never writes to the bucket, and widening its interface would force every
 * existing owner test fake to stub methods it does not use.
 */
export interface VehicleStorageGateway extends StorageGateway {
  /** Full object contents. Bounded by the caller's size check, never unbounded. */
  downloadObject(storagePath: string): Promise<Buffer | null>;
  writeObject(
    storagePath: string,
    bytes: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; cacheControl?: string },
  ): Promise<void>;
  /**
   * Server-side copy used to promote an approved variant into the public prefix.
   *
   * `options` replaces the destination's metadata rather than inheriting the
   * source's. That is not a convenience: private variants carry `ownerId` in
   * custom metadata and `no-store` cache headers, and object metadata is
   * readable by anyone who can read the object. Inheriting it would publish the
   * owner's UID alongside the photo.
   */
  copyObject(
    fromPath: string,
    toPath: string,
    options: { contentType: string; cacheControl: string; metadata: Record<string, string> },
  ): Promise<void>;
  /** Resolves even when the object is already gone, so demotion is idempotent. */
  deleteObject(storagePath: string): Promise<void>;
}

/**
 * Cache headers for objects served to renters.
 *
 * Safe to cache hard and forever: variant paths are content-addressed by
 * `imageId`, so a replaced photo gets a new path rather than a new version of an
 * old one. `immutable` avoids revalidation traffic from mobile clients.
 */
const PUBLIC_VARIANT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/**
 * Private objects must never be cached by an intermediary. These are
 * pre-promotion variants and owner-supplied originals.
 */
const PRIVATE_CACHE_CONTROL = 'private, max-age=0, no-store';

export { PRIVATE_CACHE_CONTROL, PUBLIC_VARIANT_CACHE_CONTROL };

export class AdminVehicleStorageGateway
  extends AdminStorageGateway
  implements VehicleStorageGateway
{
  async downloadObject(storagePath: string): Promise<Buffer | null> {
    try {
      const [buffer] = await this.bucket.file(storagePath).download();
      return buffer;
    } catch {
      return null;
    }
  }

  async writeObject(
    storagePath: string,
    bytes: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; cacheControl?: string },
  ): Promise<void> {
    // Errors propagate. A silent write failure would let the caller record a
    // variant path pointing at an object that does not exist — exactly the
    // dishonesty this module was written to remove.
    await this.bucket.file(storagePath).save(bytes, {
      contentType: options.contentType,
      resumable: false,
      metadata: {
        cacheControl: options.cacheControl ?? PRIVATE_CACHE_CONTROL,
        ...(options.metadata ? { metadata: options.metadata } : {}),
      },
    });
  }

  async copyObject(
    fromPath: string,
    toPath: string,
    options: { contentType: string; cacheControl: string; metadata: Record<string, string> },
  ): Promise<void> {
    // These three go into the `rewriteTo` request body, which the JSON API treats
    // as the destination's object resource: fields present here override the
    // source's, fields omitted are inherited. `metadata` is therefore always
    // passed — explicitly empty rather than absent — so the source's custom
    // metadata (which carries `ownerId`) is replaced instead of copied.
    await this.bucket.file(fromPath).copy(this.bucket.file(toPath), {
      contentType: options.contentType,
      cacheControl: options.cacheControl,
      metadata: options.metadata,
    });
  }

  async deleteObject(storagePath: string): Promise<void> {
    await this.bucket.file(storagePath).delete({ ignoreNotFound: true });
  }
}

/**
 * In-memory gateway for tests and for services that must be provable without a
 * bucket. Records every write so a test can assert *which* objects were created,
 * not merely that no error was thrown.
 */
export class InMemoryVehicleStorageGateway implements VehicleStorageGateway {
  readonly objects = new Map<
    string,
    { bytes: Buffer; contentType: string; metadata?: Record<string, string>; cacheControl?: string }
  >();

  readonly deleted: string[] = [];

  constructor(seed?: Record<string, { bytes: Buffer; contentType: string; metadata?: Record<string, string> }>) {
    for (const [path, object] of Object.entries(seed ?? {})) {
      this.objects.set(path, object);
    }
  }

  async getObjectMetadata(storagePath: string): Promise<StoredObjectMetadata | null> {
    const object = this.objects.get(storagePath);
    if (!object) return null;
    return {
      contentType: object.contentType,
      size: object.bytes.byteLength,
      customMetadata: object.metadata,
    };
  }

  async readFirstBytes(storagePath: string, byteCount: number): Promise<Buffer | null> {
    const object = this.objects.get(storagePath);
    return object ? object.bytes.subarray(0, byteCount) : null;
  }

  async downloadObject(storagePath: string): Promise<Buffer | null> {
    return this.objects.get(storagePath)?.bytes ?? null;
  }

  async writeObject(
    storagePath: string,
    bytes: Buffer,
    options: { contentType: string; metadata?: Record<string, string>; cacheControl?: string },
  ): Promise<void> {
    this.objects.set(storagePath, { bytes, ...options });
  }

  async copyObject(
    fromPath: string,
    toPath: string,
    options: { contentType: string; cacheControl: string; metadata: Record<string, string> },
  ): Promise<void> {
    const object = this.objects.get(fromPath);
    if (!object) {
      throw new Error(`copyObject: source '${fromPath}' does not exist.`);
    }
    // Mirrors the real gateway: bytes are copied, metadata is replaced. Carrying
    // `object.metadata` over would make a test pass that the bucket would fail.
    this.objects.set(toPath, {
      bytes: object.bytes,
      contentType: options.contentType,
      cacheControl: options.cacheControl,
      metadata: options.metadata,
    });
  }

  async deleteObject(storagePath: string): Promise<void> {
    this.objects.delete(storagePath);
    this.deleted.push(storagePath);
  }
}
