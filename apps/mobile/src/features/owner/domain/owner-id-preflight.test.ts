import { describe, expect, it } from 'vitest';

import {
  MAX_OWNER_ID_BYTES,
  validateOwnerIdCandidate,
  OwnerIdValidationError,
} from './owner-id-preflight';

describe('owner ID preflight', () => {
  it('accepts valid JPEG, PNG, WebP, and PDF candidates', () => {
    const candidates = [
      { uri: 'file:///id.jpg', fileName: 'id.jpg', mimeType: 'image/jpeg', fileSize: 1_000_000 },
      { uri: 'file:///id.png', fileName: 'id.png', mimeType: 'image/png', fileSize: 2_000_000 },
      { uri: 'file:///id.webp', fileName: 'id.webp', mimeType: 'image/webp', fileSize: 500_000 },
      { uri: 'file:///id.pdf', fileName: 'id.pdf', mimeType: 'application/pdf', fileSize: 3_000_000 },
    ];

    for (const c of candidates) {
      const result = validateOwnerIdCandidate(c, 'doc-fallback');
      expect(result.mimeType).toBe(c.mimeType);
      expect(result.fileSize).toBe(c.fileSize);
    }
  });

  it('rejects unsupported types like HEIC or text', () => {
    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.heic', fileName: 'id.heic', mimeType: 'image/heic', fileSize: 1_000_000 },
        'doc',
      ),
    ).toThrowError(OwnerIdValidationError);

    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.txt', fileName: 'id.txt', mimeType: 'text/plain', fileSize: 1_000 },
        'doc',
      ),
    ).toThrowError(OwnerIdValidationError);
  });

  it('rejects candidates with missing or undefined mimeType without falling back to image/jpeg', () => {
    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.raw', fileName: 'id.raw', mimeType: null, fileSize: 1_000_000 },
        'doc',
      ),
    ).toThrow(/missing or unknown/i);
  });

  it('rejects candidates with missing, non-positive or invalid file sizes', () => {
    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.jpg', fileName: 'id.jpg', mimeType: 'image/jpeg', fileSize: undefined },
        'doc',
      ),
    ).toThrow(/file size/i);

    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.jpg', fileName: 'id.jpg', mimeType: 'image/jpeg', fileSize: 0 },
        'doc',
      ),
    ).toThrow(/file size/i);

    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.jpg', fileName: 'id.jpg', mimeType: 'image/jpeg', fileSize: -100 },
        'doc',
      ),
    ).toThrow(/file size/i);
  });

  it('rejects candidates exceeding 10 MiB limit', () => {
    expect(() =>
      validateOwnerIdCandidate(
        { uri: 'file:///id.jpg', fileName: 'id.jpg', mimeType: 'image/jpeg', fileSize: MAX_OWNER_ID_BYTES + 1 },
        'doc',
      ),
    ).toThrow(/larger than 10 MB/i);
  });
});
