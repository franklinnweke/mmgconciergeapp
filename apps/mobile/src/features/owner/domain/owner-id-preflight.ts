export const SUPPORTED_OWNER_ID_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

export type OwnerIdMimeType = (typeof SUPPORTED_OWNER_ID_MIME_TYPES)[number];

export const MAX_OWNER_ID_BYTES = 10 * 1024 * 1024; // 10 MiB

export type OwnerIdCandidate = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type ValidatedOwnerId = {
  uri: string;
  fileName: string;
  mimeType: OwnerIdMimeType;
  fileSize: number;
};

export type OwnerIdValidationCode =
  | 'unsupported_type'
  | 'missing_size'
  | 'too_large'
  | 'invalid_document';

export class OwnerIdValidationError extends Error {
  constructor(
    public readonly code: OwnerIdValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'OwnerIdValidationError';
  }
}

function isSupportedMimeType(value: string): value is OwnerIdMimeType {
  return (SUPPORTED_OWNER_ID_MIME_TYPES as readonly string[]).includes(value);
}

function extensionForMimeType(mimeType: OwnerIdMimeType): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'jpg';
}

export function validateOwnerIdCandidate(
  candidate: OwnerIdCandidate,
  fallbackStem: string,
): ValidatedOwnerId {
  const uri = candidate.uri?.trim();
  if (!uri) {
    throw new OwnerIdValidationError(
      'invalid_document',
      'This document could not be read. Choose it again or select a different file.',
    );
  }

  const mimeType = candidate.mimeType?.trim().toLowerCase() ?? '';
  if (!mimeType) {
    throw new OwnerIdValidationError(
      'unsupported_type',
      'Document file format is missing or unknown. Select a valid JPEG, PNG, WebP, or PDF file.',
    );
  }

  if (!isSupportedMimeType(mimeType)) {
    throw new OwnerIdValidationError(
      'unsupported_type',
      'This document format is not supported. Upload a JPEG, PNG, WebP, or PDF document.',
    );
  }

  const fileSize = candidate.fileSize;
  if (typeof fileSize !== 'number' || !Number.isSafeInteger(fileSize) || fileSize <= 0) {
    throw new OwnerIdValidationError(
      'missing_size',
      'MMG could not verify the document file size. Please re-take or re-select the document.',
    );
  }

  if (fileSize > MAX_OWNER_ID_BYTES) {
    throw new OwnerIdValidationError(
      'too_large',
      `This document is larger than ${MAX_OWNER_ID_BYTES / (1024 * 1024)} MB. Choose a smaller file.`,
    );
  }

  const originalFileName = candidate.fileName?.trim();
  const fileName =
    originalFileName && originalFileName.length <= 120
      ? originalFileName
      : `${fallbackStem}.${extensionForMimeType(mimeType)}`;

  return {
    uri,
    fileName,
    mimeType,
    fileSize,
  };
}
