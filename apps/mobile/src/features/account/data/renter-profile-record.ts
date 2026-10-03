import {
  renterProfileRecordSchema,
  type RenterProfileRecord,
} from '@mmg/contracts';

export type RenterProfileDiagnosticCode =
  | 'profile_unavailable'
  | 'profile_permission_denied'
  | 'profile_invalid_record'
  | 'profile_identity_mismatch'
  | 'profile_read_failed';

export class RenterProfileError extends Error {
  readonly diagnosticCode: RenterProfileDiagnosticCode;
  readonly code: string;

  constructor(
    diagnosticCode: RenterProfileDiagnosticCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'RenterProfileError';
    this.diagnosticCode = diagnosticCode;
    this.code = diagnosticCode;
  }
}

export function normalizeTimestamp(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? value : value.toISOString();
  }
  if (value && typeof value === 'object') {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === 'function') {
      try {
        const parsed = (toDate as () => Date).call(value);
        return parsed instanceof Date && !Number.isNaN(parsed.getTime())
          ? parsed.toISOString()
          : value;
      } catch {
        return value;
      }
    }
    const seconds = (value as { seconds?: unknown; _seconds?: unknown }).seconds
      ?? (value as { _seconds?: unknown })._seconds;
    if (typeof seconds === 'number') {
      const nanos = (value as { nanoseconds?: unknown; _nanoseconds?: unknown }).nanoseconds
        ?? (value as { _nanoseconds?: unknown })._nanoseconds
        ?? 0;
      const millis = seconds * 1000 + (typeof nanos === 'number' ? Math.floor(nanos / 1e6) : 0);
      const parsed = new Date(millis);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }
  return value;
}

export function normalizeDeliveryAddress(rawAddress: unknown): unknown {
  if (!rawAddress || typeof rawAddress !== 'object') return rawAddress;
  const addr = rawAddress as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    streetAddress: addr.streetAddress,
    areaLabel: addr.areaLabel,
  };
  if (addr.buildingNumber !== undefined) {
    normalized.buildingNumber = addr.buildingNumber;
  }
  if (addr.landmark !== undefined) {
    normalized.landmark = addr.landmark;
  }
  if (addr.placeId !== undefined) {
    normalized.placeId = addr.placeId;
  }
  if (addr.approxLatitude !== undefined) {
    normalized.approxLatitude = addr.approxLatitude;
  }
  if (addr.approxLongitude !== undefined) {
    normalized.approxLongitude = addr.approxLongitude;
  }
  return normalized;
}

export function parseRenterProfileDocument(
  renterId: string,
  raw: Record<string, unknown>,
): RenterProfileRecord {
  const normalized = {
    renterId: raw.renterId,
    fullName: raw.fullName,
    email: raw.email,
    phone: raw.phone,
    defaultDeliveryAddress: normalizeDeliveryAddress(raw.defaultDeliveryAddress),
    acceptedRenterTermsVersion: raw.acceptedRenterTermsVersion,
    acceptedPrivacyNoticeVersion: raw.acceptedPrivacyNoticeVersion,
    accountStatus: raw.accountStatus,
    deletionReason: raw.deletionReason ?? null,
    deletionRequestedAt:
      raw.deletionRequestedAt === null || raw.deletionRequestedAt === undefined
        ? null
        : normalizeTimestamp(raw.deletionRequestedAt),
    profileVersion: raw.profileVersion,
    createdAt: normalizeTimestamp(raw.createdAt),
    updatedAt: normalizeTimestamp(raw.updatedAt),
  };

  const parsed = renterProfileRecordSchema.safeParse(normalized);
  if (!parsed.success) {
    throw new RenterProfileError(
      'profile_invalid_record',
      'Renter profile record is incomplete or invalid.',
      parsed.error,
    );
  }
  if (parsed.data.renterId !== renterId) {
    throw new RenterProfileError(
      'profile_identity_mismatch',
      'Renter profile identity does not match its document path.',
    );
  }
  return parsed.data;
}
