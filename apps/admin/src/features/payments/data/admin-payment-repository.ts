import 'server-only';

import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

import { getAdminApp, getAdminFirestore } from '@/features/auth/server/firebase-admin';

export type AdminPaymentRecord = {
  paymentId: string;
  intentId: string;
  rentalRequestId: string | null;
  vehicleId: string | null;
  renterReference: string;
  reference: string;
  state: string;
  providerStatus: string | null;
  verificationOutcome: string | null;
  environment: string | null;
  amountKobo: number;
  holdExpiresAt: string | null;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminPaymentEvent = {
  eventId: string;
  source: string;
  status: string;
  providerStatus: string | null;
  gatewayResponse: string | null;
  paidAtIso: string | null;
  receivedAt: string | null;
};

export type AdminPaymentsSnapshot = {
  projectId: string;
  payments: AdminPaymentRecord[];
  skippedInvalidCount: number;
};

export type AdminPaymentDetail = {
  payment: AdminPaymentRecord;
  events: AdminPaymentEvent[];
};

function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value) {
    const parsed = (value as { toDate?: () => Date }).toDate?.();
    if (parsed instanceof Date && !Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

function stringValue(data: DocumentData, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function reference(value: string): string {
  return `••••${value.slice(-6)}`;
}

function parsePayment(document: FirebaseFirestore.DocumentSnapshot): AdminPaymentRecord | null {
  if (!document.exists) return null;
  const data = document.data();
  if (!data) return null;

  const paymentId = stringValue(data, 'paymentId') ?? document.id;
  const intentId = stringValue(data, 'intentId');
  const renterId = stringValue(data, 'renterId');
  const providerReference = stringValue(data, 'reference');
  const state = stringValue(data, 'state');
  const amountKobo = data.amountKobo;
  const createdAt = toIso(data.createdAt);
  const updatedAt = toIso(data.updatedAt);

  if (
    !paymentId || !intentId || !renterId || !providerReference || !state ||
    typeof amountKobo !== 'number' || !Number.isSafeInteger(amountKobo) || amountKobo <= 0 ||
    !createdAt || !updatedAt
  ) return null;

  return {
    paymentId,
    intentId,
    rentalRequestId: stringValue(data, 'rentalRequestId'),
    vehicleId: stringValue(data, 'vehicleId'),
    renterReference: reference(renterId),
    reference: providerReference,
    state,
    providerStatus: stringValue(data, 'lastProviderStatus'),
    verificationOutcome: stringValue(data, 'lastVerificationOutcome'),
    environment: stringValue(data, 'environment'),
    amountKobo,
    holdExpiresAt: toIso(data.holdExpiresAt),
    lastVerifiedAt: toIso(data.lastVerifiedAt),
    createdAt,
    updatedAt,
  };
}

export async function loadAdminPayments(): Promise<AdminPaymentsSnapshot> {
  const firestore = getAdminFirestore();
  const snapshot = await firestore.collection('payments').orderBy('createdAt', 'desc').limit(100).get();
  const payments: AdminPaymentRecord[] = [];
  let skippedInvalidCount = 0;

  for (const document of snapshot.docs) {
    const parsed = parsePayment(document);
    if (!parsed) {
      skippedInvalidCount += 1;
      continue;
    }
    payments.push(parsed);
  }

  return {
    projectId: getAdminApp().options.projectId ?? 'unknown-project',
    payments,
    skippedInvalidCount,
  };
}

export async function loadAdminPaymentDetail(paymentId: string): Promise<AdminPaymentDetail | null> {
  const firestore = getAdminFirestore();
  const paymentSnapshot = await firestore.doc(`payments/${paymentId}`).get();
  const payment = parsePayment(paymentSnapshot);
  if (!payment) return null;

  const eventSnapshot = await firestore.collection('paymentEvents')
    .where('reference', '==', payment.reference)
    .limit(30)
    .get();

  const events: AdminPaymentEvent[] = eventSnapshot.docs.map((document) => {
    const data = document.data();
    return {
      eventId: stringValue(data, 'eventId') ?? document.id,
      source: stringValue(data, 'source') ?? 'unknown',
      status: stringValue(data, 'status') ?? 'unknown',
      providerStatus: stringValue(data, 'providerStatus'),
      gatewayResponse: stringValue(data, 'gatewayResponse') ?? stringValue(data, 'verifiedGatewayResponse'),
      paidAtIso: stringValue(data, 'verifiedPaidAtIso') ?? stringValue(data, 'observedPaidAtIso'),
      receivedAt: toIso(data.receivedAt) ?? toIso(data.createdAt),
    };
  }).sort((left, right) => Date.parse(right.receivedAt ?? '1970-01-01') - Date.parse(left.receivedAt ?? '1970-01-01'));

  return { payment, events };
}
