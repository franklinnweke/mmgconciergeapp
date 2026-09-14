import { MAX_UPLOAD_BYTES } from '@mmg/contracts';
import { describe, expect, it } from 'vitest';

import {
  validateVehiclePhotoCandidate,
  VehiclePhotoValidationError,
} from './vehicle-photo-preflight';

describe('vehicle photo preflight', () => {
  it('accepts supported images with truthful metadata', () => {
    expect(validateVehiclePhotoCandidate({
      uri: 'file:///vehicle.jpg',
      fileName: 'vehicle.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2_048_000,
    }, 'vehicle-photo-1')).toEqual({
      uri: 'file:///vehicle.jpg',
      fileName: 'vehicle.jpg',
      mimeType: 'image/jpeg',
      fileSize: 2_048_000,
    });
  });

  it('keeps WebP as WebP instead of relabeling it as JPEG', () => {
    const photo = validateVehiclePhotoCandidate({
      uri: 'file:///vehicle.webp',
      fileName: 'vehicle.webp',
      mimeType: 'IMAGE/WEBP',
      fileSize: 512_000,
    }, 'vehicle-photo-2');

    expect(photo.mimeType).toBe('image/webp');
  });

  it('rejects HEIC rather than declaring its bytes as JPEG', () => {
    expect(() => validateVehiclePhotoCandidate({
      uri: 'file:///vehicle.heic',
      fileName: 'vehicle.heic',
      mimeType: 'image/heic',
      fileSize: 1_024_000,
    }, 'vehicle-photo-3')).toThrowError(VehiclePhotoValidationError);
  });

  it('rejects a photo when its real file size is unavailable', () => {
    expect(() => validateVehiclePhotoCandidate({
      uri: 'file:///vehicle.jpg',
      fileName: 'vehicle.jpg',
      mimeType: 'image/jpeg',
      fileSize: undefined,
    }, 'vehicle-photo-4')).toThrow(/file size/i);
  });

  it('rejects an oversized image before an upload session is created', () => {
    expect(() => validateVehiclePhotoCandidate({
      uri: 'file:///large.png',
      fileName: 'large.png',
      mimeType: 'image/png',
      fileSize: MAX_UPLOAD_BYTES + 1,
    }, 'vehicle-photo-5')).toThrow(/larger than/i);
  });
});
