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

  it('accepts photos meeting the minimum resolution requirements', () => {
    const photo = validateVehiclePhotoCandidate({
      uri: 'file:///cam.jpg',
      fileName: 'cam.jpg',
      mimeType: 'image/jpeg',
      fileSize: 1_500_000,
      width: 1920,
      height: 1080,
    }, 'vehicle-photo-6');

    expect(photo.width).toBe(1920);
    expect(photo.height).toBe(1080);
  });

  it('rejects an undersized photo (e.g. 1024x768) with clear resolution guidance', () => {
    expect(() => validateVehiclePhotoCandidate({
      uri: 'file:///undersized.jpg',
      fileName: 'undersized.jpg',
      mimeType: 'image/jpeg',
      fileSize: 370_000,
      width: 1024,
      height: 768,
    }, 'vehicle-photo-7')).toThrowError(/Photo resolution is too low \(1024×768\).*must be at least 1280×720/i);
  });

  it('rejects an image with height below minimum (e.g. 1920x600)', () => {
    expect(() => validateVehiclePhotoCandidate({
      uri: 'file:///banner.jpg',
      fileName: 'banner.jpg',
      mimeType: 'image/jpeg',
      fileSize: 400_000,
      width: 1920,
      height: 600,
    }, 'vehicle-photo-8')).toThrowError(/must be at least 1280×720/i);
  });

  it('rejects an image with edge exceeding MAX_IMAGE_EDGE', () => {
    expect(() => validateVehiclePhotoCandidate({
      uri: 'file:///huge.jpg',
      fileName: 'huge.jpg',
      mimeType: 'image/jpeg',
      fileSize: 5_000_000,
      width: 9000,
      height: 6000,
    }, 'vehicle-photo-9')).toThrowError(/exceed the maximum allowed size of 8000/i);
  });
});
