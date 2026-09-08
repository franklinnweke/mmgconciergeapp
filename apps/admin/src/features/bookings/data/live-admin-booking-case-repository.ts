import 'server-only';

import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { getAdminFirestore } from '@/features/auth/server/firebase-admin';

export type StaffInterventionCase = {
  caseId: string;
  caseType: 'paid_conflict' | 'owner_rejection';
  caseStatus: string;
  priority: string | null;
  bookingId: string | null;
  paymentId: string | null;
  vehicleId: string;
  vehicleDisplayName: string;
  areaLabel: string;
  startDate: string;
  endDate: string;
  renterTotalKobo: number;
  renterReference: string;
  ownerReference: string;
  reason: string;
  openedAt: string;
  version: number;
};

export type StaffInterventionSnapshot = {
  cases: readonly StaffInterventionCase[];
  skippedInvalidCount: number;
  projectId: 'mmg-concierge-dev';
};

function configuredProjectId(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || null;
}

export function maskOperationalReference(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '••••••';
  return `••••${normalized.slice(-6)}`;
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value) {
    const candidate = (value as { toDate?: () => Date }).toDate?.();
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) return candidate.toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function recordString(data: DocumentData, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function positiveInteger(data: DocumentData, key: string): number | null {
  const value = data[key];
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function relatedJourney(data: DocumentData) {
  const snapshot = data.vehicleSnapshot;
  const price = data.priceSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || !price || typeof price !== 'object') return null;

  const vehicleSnapshot = snapshot as Record<string, unknown>;
  const priceSnapshot = price as Record<string, unknown>;
  const displayName = typeof vehicleSnapshot.displayName === 'string' ? vehicleSnapshot.displayName : null;
  const areaLabel = typeof vehicleSnapshot.areaLabel === 'string' ? vehicleSnapshot.areaLabel : null;
  const startDate = recordString(data, 'startDate');
  const endDate = recordString(data, 'endDate');
  const renterTotalKobo = typeof priceSnapshot.renterTotalKobo === 'number' &&
    Number.isSafeInteger(priceSnapshot.renterTotalKobo) && priceSnapshot.renterTotalKobo >= 0
    ? priceSnapshot.renterTotalKobo
    : null;

  if (!displayName || !areaLabel || !startDate || !endDate || renterTotalKobo === null) return null;
  return { displayName, areaLabel, startDate, endDate, renterTotalKobo };
}

function interventionReason(caseType: 'paid_conflict' | 'owner_rejection', data: DocumentData): string {
  if (caseType === 'owner_rejection') {
    return recordString(data, 'ownerReason') || 'Owner declined this paid booking.';
  }
  const code = recordString(data, 'reasonCode');
  return code ? code.replaceAll('_', ' ') : 'Paid booking dates became unavailable.';
}

/**
 * First live staff desk: read-only development visibility for trusted booking
 * intervention cases. It never queries renter/owner profile PII and never
 * exposes booking mutation methods.
 */
export async function loadDevelopmentInterventionCases(): Promise<StaffInterventionSnapshot> {
  const projectId = configuredProjectId();
  if (projectId !== 'mmg-concierge-dev') {
    throw new Error('Booking intervention desk is locked to mmg-concierge-dev during this phase.');
  }

  const firestore = getAdminFirestore();
  const snapshot = await firestore.collection('bookingCases').orderBy('openedAt', 'desc').limit(100).get();
  const cases: StaffInterventionCase[] = [];
  let skippedInvalidCount = 0;

  for (const document of snapshot.docs) {
    const data = document.data();
    const caseType = recordString(data, 'type');
    if (caseType !== 'paid_conflict' && caseType !== 'owner_rejection') continue;

    const renterId = recordString(data, 'renterId');
    const ownerId = recordString(data, 'ownerId');
    const vehicleId = recordString(data, 'vehicleId');
    const openedAt = timestampToIso(data.openedAt);
    const version = positiveInteger(data, 'version');
    const caseStatus = recordString(data, 'status');
    const bookingId = recordString(data, 'bookingId');
    const intentId = recordString(data, 'intentId');

    if (!renterId || !ownerId || !vehicleId || !openedAt || !version || !caseStatus) {
      skippedInvalidCount += 1;
      continue;
    }

    const relatedRef = caseType === 'owner_rejection'
      ? bookingId ? firestore.doc(`bookings/${bookingId}`) : null
      : intentId ? firestore.doc(`bookingIntents/${intentId}`) : null;
    if (!relatedRef) {
      skippedInvalidCount += 1;
      continue;
    }

    const relatedSnapshot = await relatedRef.get();
    const related = relatedSnapshot.exists ? relatedSnapshot.data() : null;
    if (!related) {
      skippedInvalidCount += 1;
      continue;
    }
    const journey = relatedJourney(related);
    if (!journey) {
      skippedInvalidCount += 1;
      continue;
    }

    cases.push({
      caseId: document.id,
      caseType,
      caseStatus,
      priority: recordString(data, 'priority'),
      bookingId,
      paymentId: recordString(data, 'paymentId') || recordString(related, 'paymentId'),
      vehicleId,
      vehicleDisplayName: journey.displayName,
      areaLabel: journey.areaLabel,
      startDate: journey.startDate,
      endDate: journey.endDate,
      renterTotalKobo: journey.renterTotalKobo,
      renterReference: maskOperationalReference(renterId),
      ownerReference: maskOperationalReference(ownerId),
      reason: interventionReason(caseType, data),
      openedAt,
      version,
    });
  }

  return { cases, skippedInvalidCount, projectId: 'mmg-concierge-dev' };
}
