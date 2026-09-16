import {
  renterProfileRecordSchema,
  type RenterProfileRecord,
} from '@mmg/contracts';

function normalizeTimestamp(value: unknown): unknown {
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
        const parsed = (toDate as () => Date)();
        return parsed instanceof Date && !Number.isNaN(parsed.getTime())
          ? parsed.toISOString()
          : value;
      } catch {
        return value;
      }
    }
  }
  return value;
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
    defaultDeliveryAddress: raw.defaultDeliveryAddress,
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
    throw new Error('Renter profile record is incomplete or invalid.');
  }
  if (parsed.data.renterId !== renterId) {
    throw new Error('Renter profile identity does not match its document path.');
  }
  return parsed.data;
}
