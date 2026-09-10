import 'server-only';

import {
  priceSnapshotSchema,
  renterVehicleSnapshotSchema,
} from '@mmg/contracts';
import {
  rentalRequestServiceAreaSchema,
  rentalRequestStateSchema,
  type RentalRequestState,
} from '@mmg/contracts/rental-request';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getAdminApp, getAdminFirestore } from '@/features/auth/server/firebase-admin';

// Keep workspace-local Zod values inside this schema. The contracts workspace
// currently resolves a different Zod major, so imported contract schemas are
// applied as an explicit second validation stage rather than embedded here.
const requestEnvelopeSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceAreaLabel: z.unknown(),
  state: z.unknown(),
  version: z.number().int().positive(),
  estimatedPriceSnapshot: z.unknown(),
  authoritativePriceSnapshot: z.unknown().optional(),
  vehicleSnapshot: z.unknown(),
  intentId: z.string().min(1).max(128).optional(),
  bookingId: z.string().min(1).max(128).optional(),
  holdExpiresAt: z.instanceof(Timestamp).optional(),
  cancellationRequestedAt: z.instanceof(Timestamp).optional(),
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
}).passthrough();

const contactSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  contactPhone: z.string().trim().min(7).max(32),
}).passthrough();

export type AdminRentalRequestRecord = {
  requestId: string;
  renterReference: string;
  ownerReference: string;
  vehicleId: string;
  vehicleDisplayName: string;
  startDate: string;
  endDate: string;
  serviceAreaLabel: string;
  state: RentalRequestState;
  version: number;
  renterTotalKobo: number;
  contactPhone: string | null;
  intentId?: string;
  bookingId?: string;
  holdExpiresAt?: string;
  cancellationRequestedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminRentalRequestSnapshot = {
  projectId: string;
  requests: AdminRentalRequestRecord[];
  skippedInvalidCount: number;
};

function reference(value: string): string {
  return `••••${value.slice(-6)}`;
}

export async function loadDevelopmentRentalRequests(): Promise<AdminRentalRequestSnapshot> {
  const firestore = getAdminFirestore();
  const requestSnapshot = await firestore
    .collection('rentalRequests')
    .orderBy('updatedAt', 'desc')
    .limit(100)
    .get();

  const contactSnapshots = requestSnapshot.empty
    ? []
    : await firestore.getAll(...requestSnapshot.docs.map((document) =>
      firestore.doc(`rentalRequestContacts/${document.id}`)));
  const contacts = new Map(contactSnapshots.map((snapshot) => [snapshot.id, snapshot]));

  const requests: AdminRentalRequestRecord[] = [];
  let skippedInvalidCount = 0;

  for (const document of requestSnapshot.docs) {
    const envelope = requestEnvelopeSchema.safeParse({
      ...document.data(),
      requestId: typeof document.data().requestId === 'string' ? document.data().requestId : document.id,
    });
    if (!envelope.success) {
      skippedInvalidCount += 1;
      continue;
    }

    const data = envelope.data;
    const serviceArea = rentalRequestServiceAreaSchema.safeParse(data.serviceAreaLabel);
    const effectiveState = data.cancellationRequestedAt && (data.state === 'ready_for_payment' || data.state === 'confirmed')
      ? 'cancellation_requested'
      : data.state;
    const state = rentalRequestStateSchema.safeParse(effectiveState);
    const estimatedPrice = priceSnapshotSchema.safeParse(data.estimatedPriceSnapshot);
    const authoritativePrice = data.authoritativePriceSnapshot === undefined
      ? null
      : priceSnapshotSchema.safeParse(data.authoritativePriceSnapshot);
    const vehicle = renterVehicleSnapshotSchema.safeParse(data.vehicleSnapshot);

    if (
      !serviceArea.success ||
      !state.success ||
      !estimatedPrice.success ||
      (authoritativePrice !== null && !authoritativePrice.success) ||
      !vehicle.success
    ) {
      skippedInvalidCount += 1;
      continue;
    }

    const contactSnapshot = contacts.get(document.id);
    const contact = contactSnapshot?.exists
      ? contactSchema.safeParse(contactSnapshot.data())
      : null;
    if (contact && !contact.success) {
      skippedInvalidCount += 1;
    }

    const price = authoritativePrice?.success ? authoritativePrice.data : estimatedPrice.data;
    requests.push({
      requestId: data.requestId,
      renterReference: reference(data.renterId),
      ownerReference: reference(data.ownerId),
      vehicleId: data.vehicleId,
      vehicleDisplayName: vehicle.data.displayName,
      startDate: data.startDate,
      endDate: data.endDate,
      serviceAreaLabel: serviceArea.data,
      state: state.data,
      version: data.version,
      renterTotalKobo: price.renterTotalKobo,
      contactPhone: contact?.success ? contact.data.contactPhone : null,
      ...(data.intentId ? { intentId: data.intentId } : {}),
      ...(data.bookingId ? { bookingId: data.bookingId } : {}),
      ...(data.holdExpiresAt ? { holdExpiresAt: data.holdExpiresAt.toDate().toISOString() } : {}),
      ...(data.cancellationRequestedAt ? { cancellationRequestedAt: data.cancellationRequestedAt.toDate().toISOString() } : {}),
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    });
  }

  return {
    projectId: getAdminApp().options.projectId ?? 'unknown-project',
    requests,
    skippedInvalidCount,
  };
}
