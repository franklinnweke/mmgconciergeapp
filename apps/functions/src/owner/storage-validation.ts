import { CommandError } from '@mmg/contracts';
import { getStorage } from 'firebase-admin/storage';

export type AllowedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const ALLOWED_MIME_TYPES: readonly AllowedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export const MAX_ID_SIZE_BYTES = 10 * 1024 * 1024; // 10 MiB (10,485,760 bytes)

export type StoredObjectMetadata = {
  contentType: string;
  size: number;
  timeCreated?: string;
  customMetadata?: Record<string, string>;
};

export interface StorageGateway {
  getObjectMetadata(storagePath: string): Promise<StoredObjectMetadata | null>;
  readFirstBytes(storagePath: string, byteCount: number): Promise<Buffer | null>;
}

export type StorageBucket = ReturnType<ReturnType<typeof getStorage>['bucket']>;

export class AdminStorageGateway implements StorageGateway {
  // `protected`, not `private`: `AdminVehicleStorageGateway` extends this to add
  // the write side (download/write/copy/delete) that vehicle image processing
  // needs. The read-only `StorageGateway` interface stays narrow so the owner
  // verification tests' fakes do not have to implement writes.
  protected readonly bucket: StorageBucket;

  constructor(bucket?: StorageBucket) {
    this.bucket = bucket ?? getStorage().bucket();
  }

  async getObjectMetadata(storagePath: string): Promise<StoredObjectMetadata | null> {
    try {
      const file = this.bucket.file(storagePath);
      const [metadata] = await file.getMetadata();
      return {
        contentType: metadata.contentType || '',
        size: Number(metadata.size) || 0,
        timeCreated: metadata.timeCreated,
        customMetadata: metadata.metadata as Record<string, string> | undefined,
      };
    } catch {
      return null;
    }
  }

  async readFirstBytes(storagePath: string, byteCount: number): Promise<Buffer | null> {
    try {
      const file = this.bucket.file(storagePath);
      const [buffer] = await file.download({ start: 0, end: byteCount - 1 });
      return buffer;
    } catch {
      return null;
    }
  }
}

export function sniffMagicBytes(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length < 4) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WEBP: 'RIFF' (bytes 0..3) ... 'WEBP' (bytes 8..11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'image/webp';
  }

  // PDF: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d // -
  ) {
    return 'application/pdf';
  }

  return null;
}

export type ValidatedStorageUpload = {
  uploadId: string;
  storagePath: string;
  contentType: AllowedMimeType;
  byteSize: number;
  uploadedAt: string;
};

export async function validateOwnerVerificationUpload(
  uid: string,
  uploadId: string,
  storageGateway: StorageGateway,
  now: Date,
): Promise<ValidatedStorageUpload> {
  const storagePath = `private/owner-verification/${uid}/${uploadId}`;

  const metadata = await storageGateway.getObjectMetadata(storagePath);
  if (!metadata) {
    throw new CommandError(
      'NOT_FOUND',
      'The uploaded identification document could not be found. Please upload again.',
      { reason: 'upload_invalid' },
    );
  }

  if (metadata.size <= 0 || metadata.size > MAX_ID_SIZE_BYTES) {
    throw new CommandError(
      'FAILED_PRECONDITION',
      'Uploaded file exceeds the maximum allowed size of 10 MiB.',
      { reason: 'upload_invalid' },
    );
  }

  if (!ALLOWED_MIME_TYPES.includes(metadata.contentType as AllowedMimeType)) {
    throw new CommandError(
      'FAILED_PRECONDITION',
      'Uploaded file must be a JPEG, PNG, WEBP, or PDF document.',
      { reason: 'upload_invalid' },
    );
  }

  if (metadata.customMetadata?.ownerId && metadata.customMetadata.ownerId !== uid) {
    throw new CommandError(
      'FORBIDDEN',
      'Uploaded document does not match the authenticated owner identity.',
      { reason: 'upload_invalid' },
    );
  }

  const firstBytes = await storageGateway.readFirstBytes(storagePath, 16);
  if (!firstBytes || firstBytes.length < 4) {
    throw new CommandError(
      'FAILED_PRECONDITION',
      'Uploaded file is empty or corrupted. Please upload again.',
      { reason: 'upload_invalid' },
    );
  }

  const detectedType = sniffMagicBytes(firstBytes);
  if (!detectedType || detectedType !== metadata.contentType) {
    throw new CommandError(
      'FAILED_PRECONDITION',
      'Uploaded file content does not match its declared MIME format.',
      { reason: 'upload_invalid' },
    );
  }

  return {
    uploadId,
    storagePath,
    contentType: detectedType,
    byteSize: metadata.size,
    uploadedAt: metadata.timeCreated || now.toISOString(),
  };
}
