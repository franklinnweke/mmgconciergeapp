import { describe, expect, it } from 'vitest';

import {
  sniffMagicBytes,
  validateOwnerVerificationUpload,
  type StorageGateway,
  type StoredObjectMetadata,
} from './storage-validation.js';

class InMemoryStorageGateway implements StorageGateway {
  files = new Map<string, { metadata: StoredObjectMetadata; data: Buffer }>();

  async getObjectMetadata(storagePath: string): Promise<StoredObjectMetadata | null> {
    return this.files.get(storagePath)?.metadata ?? null;
  }

  async readFirstBytes(storagePath: string, byteCount: number): Promise<Buffer | null> {
    const file = this.files.get(storagePath);
    if (!file) return null;
    return file.data.subarray(0, byteCount);
  }
}

describe('storage validation and magic bytes sniffing', () => {
  describe('sniffMagicBytes', () => {
    it('identifies JPEG magic bytes', () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(sniffMagicBytes(jpeg)).toBe('image/jpeg');
    });

    it('identifies PNG magic bytes', () => {
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      expect(sniffMagicBytes(png)).toBe('image/png');
    });

    it('identifies WEBP magic bytes (RIFF...WEBP)', () => {
      const webp = Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.from([0x24, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP'),
      ]);
      expect(sniffMagicBytes(webp)).toBe('image/webp');
    });

    it('identifies PDF magic bytes (%PDF-)', () => {
      const pdf = Buffer.from('%PDF-1.7\n%abc');
      expect(sniffMagicBytes(pdf)).toBe('application/pdf');
    });

    it('returns null for unknown or corrupted payloads', () => {
      expect(sniffMagicBytes(Buffer.from('plain-text-file'))).toBeNull();
      expect(sniffMagicBytes(Buffer.from([0x00, 0x01]))).toBeNull();
    });
  });

  describe('validateOwnerVerificationUpload', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    const validJpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

    it('validates a correct JPEG upload matching its metadata', async () => {
      const gateway = new InMemoryStorageGateway();
      gateway.files.set('private/owner-verification/owner-123/upload-001', {
        metadata: {
          contentType: 'image/jpeg',
          size: 1024,
          timeCreated: now.toISOString(),
          customMetadata: { ownerId: 'owner-123', purpose: 'government_id' },
        },
        data: validJpegBytes,
      });

      const validated = await validateOwnerVerificationUpload('owner-123', 'upload-001', gateway, now);
      expect(validated).toEqual({
        uploadId: 'upload-001',
        storagePath: 'private/owner-verification/owner-123/upload-001',
        contentType: 'image/jpeg',
        byteSize: 1024,
        uploadedAt: now.toISOString(),
      });
    });

    it('throws NOT_FOUND when storage object is missing', async () => {
      const gateway = new InMemoryStorageGateway();
      await expect(
        validateOwnerVerificationUpload('owner-123', 'missing-upload', gateway, now),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        safeDetails: { reason: 'upload_invalid' },
      });
    });

    it('throws FAILED_PRECONDITION when object size exceeds 10 MiB', async () => {
      const gateway = new InMemoryStorageGateway();
      gateway.files.set('private/owner-verification/owner-123/upload-big', {
        metadata: {
          contentType: 'image/jpeg',
          size: 10 * 1024 * 1024 + 1,
        },
        data: validJpegBytes,
      });

      await expect(
        validateOwnerVerificationUpload('owner-123', 'upload-big', gateway, now),
      ).rejects.toMatchObject({
        code: 'FAILED_PRECONDITION',
        safeDetails: { reason: 'upload_invalid' },
      });
    });

    it('throws FORBIDDEN when custom metadata ownerId does not match caller', async () => {
      const gateway = new InMemoryStorageGateway();
      gateway.files.set('private/owner-verification/owner-123/upload-001', {
        metadata: {
          contentType: 'image/jpeg',
          size: 1024,
          customMetadata: { ownerId: 'other-owner' },
        },
        data: validJpegBytes,
      });

      await expect(
        validateOwnerVerificationUpload('owner-123', 'upload-001', gateway, now),
      ).rejects.toMatchObject({
        code: 'FORBIDDEN',
        safeDetails: { reason: 'upload_invalid' },
      });
    });

    it('throws FAILED_PRECONDITION when magic bytes do not match declared content type (JPEG declared as PDF)', async () => {
      const gateway = new InMemoryStorageGateway();
      gateway.files.set('private/owner-verification/owner-123/upload-spoofed', {
        metadata: {
          contentType: 'application/pdf',
          size: 1024,
          customMetadata: { ownerId: 'owner-123' },
        },
        data: validJpegBytes, // JPEG bytes declared as PDF
      });

      await expect(
        validateOwnerVerificationUpload('owner-123', 'upload-spoofed', gateway, now),
      ).rejects.toMatchObject({
        code: 'FAILED_PRECONDITION',
        safeDetails: { reason: 'upload_invalid' },
      });
    });
  });
});
