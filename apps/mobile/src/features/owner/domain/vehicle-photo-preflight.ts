import {
  MAX_IMAGE_EDGE,
  MAX_UPLOAD_BYTES,
  MIN_IMAGE_HEIGHT,
  MIN_IMAGE_WIDTH,
} from '@mmg/contracts';

export const SUPPORTED_VEHICLE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type VehiclePhotoMimeType = (typeof SUPPORTED_VEHICLE_IMAGE_MIME_TYPES)[number];

export type VehiclePhotoCandidate = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
};

export type ValidatedVehiclePhoto = {
  uri: string;
  fileName: string;
  mimeType: VehiclePhotoMimeType;
  fileSize: number;
  width?: number;
  height?: number;
};

export type VehiclePhotoValidationCode =
  | 'unsupported_type'
  | 'missing_size'
  | 'too_large'
  | 'too_small'
  | 'dimension_too_large'
  | 'invalid_photo';

export class VehiclePhotoValidationError extends Error {
  constructor(
    public readonly code: VehiclePhotoValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'VehiclePhotoValidationError';
  }
}

function isSupportedMimeType(value: string): value is VehiclePhotoMimeType {
  return (SUPPORTED_VEHICLE_IMAGE_MIME_TYPES as readonly string[]).includes(value);
}

function extensionForMimeType(mimeType: VehiclePhotoMimeType): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function validateVehiclePhotoCandidate(
  candidate: VehiclePhotoCandidate,
  fallbackStem: string,
): ValidatedVehiclePhoto {
  const uri = candidate.uri.trim();
  if (!uri) {
    throw new VehiclePhotoValidationError(
      'invalid_photo',
      'This photo could not be read. Choose it again or select a different image.',
    );
  }

  const mimeType = candidate.mimeType?.trim().toLowerCase() ?? '';
  if (!isSupportedMimeType(mimeType)) {
    throw new VehiclePhotoValidationError(
      'unsupported_type',
      'This photo format is not supported yet. Choose a JPEG, PNG, or WebP image.',
    );
  }

  const fileSize = candidate.fileSize;
  if (typeof fileSize !== 'number' || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new VehiclePhotoValidationError(
      'missing_size',
      "MMG could not verify this photo's file size. Choose it again or select a different image.",
    );
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    throw new VehiclePhotoValidationError(
      'too_large',
      `This photo is larger than ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB. Choose a smaller image.`,
    );
  }

  const originalFileName = candidate.fileName?.trim();
  const fileName = originalFileName && originalFileName.length <= 120
    ? originalFileName
    : `${fallbackStem}.${extensionForMimeType(mimeType)}`;

  const width = candidate.width;
  const height = candidate.height;
  if (typeof width === 'number' && typeof height === 'number') {
    if (width < MIN_IMAGE_WIDTH || height < MIN_IMAGE_HEIGHT) {
      throw new VehiclePhotoValidationError(
        'too_small',
        `Photo resolution is too low (${width}×${height}). Listing photos must be at least ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} pixels. Please choose an original camera photo.`,
      );
    }
    if (width > MAX_IMAGE_EDGE || height > MAX_IMAGE_EDGE) {
      throw new VehiclePhotoValidationError(
        'dimension_too_large',
        `Photo dimensions exceed the maximum allowed size of ${MAX_IMAGE_EDGE} pixels on an edge. Please choose a standard photo.`,
      );
    }
  }

  return {
    uri,
    fileName,
    mimeType,
    fileSize,
    ...(typeof width === 'number' ? { width } : {}),
    ...(typeof height === 'number' ? { height } : {}),
  };
}
