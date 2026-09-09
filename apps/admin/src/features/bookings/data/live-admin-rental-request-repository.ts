import 'server-only';

import {
  priceSnapshotSchema,
  renterVehicleSnapshotSchema,
} from '@mmg/contracts';
import {
  rentalRequestServiceAreaSchema,
  rentalRequestStateSchema,
} from '@mmg/contracts/rental-request';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

import { getAdminFirestore } from '@/features/auth/server/firebase-admin';

const requestSchema = z.object({
  requestId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceAreaLabel: rentalRequestServiceAreaSchema,
  state: rentalRequestStateSchema,
  version: z.number().int().positive(),
  estimatedPriceSnapshot: priceSnapshotSchema,
  authoritativePriceSnapshot: priceSnapshotSchema.optional(),
  vehicleSnapshot: renterVehicleSnapshotSchema,
  intentId: z.string().min(1).max(128).optional(),
  bookingId: z.string().min(1).max(128).optional(),
  holdExpiresAt: z.instanceof(Timestamp).optional(),
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
  state: z.infer<typeof rentalRequestStateSchema>;
  version: number;
  renterTotalKobo: number;
  contactPhone: string | null;
  intentId?: string;
  bookingId?: string;
  holdExpiresAt?: string;
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
    const request = requestSchema.safeParse({
      ...document.data(),
      requestId: typeof document.data().requestId === 'string' ? document.data().requestId : document.id,
    });
    if (!request.success) {
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

    const data = request.data;
    requests.push({
      requestId: data.requestId,
      renterReference: reference(data.renterId),
      ownerReference: reference(data.ownerId),
      vehicleId: data.vehicleId,
      vehicleDisplayName: data.vehicleSnapshot.displayName,
      startDate: data.startDate,
      endDate: data.endDate,
      serviceAreaLabel: data.serviceAreaLabel,
      state: data.state,
      version: data.version,
      renterTotalKobo: (data.authoritativePriceSnapshot ?? data.estimatedPriceSnapshot).renterTotalKobo,
      contactPhone: contact?.success ? contact.data.contactPhone : null,
      ...(data.intentId ? { intentId: data.intentId } : {}),
      ...(data.bookingId ? { bookingId: data.bookingId } : {}),
      ...(data.holdExpiresAt ? { holdExpiresAt: data.holdExpiresAt.toDate().toISOString() } : {}),
      createdAt: data.createdAt.toDate().toISOString(),
      updatedAt: data.updatedAt.toDate().toISOString(),
    });
  }

  return {
    projectId: firestore.app.options.projectId ?? 'unknown-project',
    requests,
    skippedInvalidCount,
  };
}
