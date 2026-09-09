import {
  listOwnerRentalRequestsResultSchema,
  ownerVisibleRentalRequestSchema,
  type ListOwnerRentalRequestsResult,
} from '@mmg/contracts/rental-request';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

import { BookingCommandError } from './errors.js';

function timestampIso(value: unknown): string | undefined {
  return value instanceof Timestamp ? value.toDate().toISOString() : undefined;
}

export class FirestoreOwnerRentalRequestQuery {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async list(ownerId: string): Promise<ListOwnerRentalRequestsResult> {
    const snapshot = await this.firestore
      .collection('rentalRequests')
      .where('ownerId', '==', ownerId)
      .limit(200)
      .get();

    const requests = snapshot.docs.map((document) => {
      const data = document.data();
      const projection = {
        requestId: typeof data.requestId === 'string' ? data.requestId : document.id,
        ownerId: data.ownerId,
        vehicleId: data.vehicleId,
        startDate: data.startDate,
        endDate: data.endDate,
        serviceAreaLabel: data.serviceAreaLabel,
        state: data.state,
        version: data.version,
        estimatedPriceSnapshot: data.estimatedPriceSnapshot,
        ...(data.authoritativePriceSnapshot ? { authoritativePriceSnapshot: data.authoritativePriceSnapshot } : {}),
        vehicleSnapshot: data.vehicleSnapshot,
        ...(typeof data.intentId === 'string' ? { intentId: data.intentId } : {}),
        ...(timestampIso(data.holdExpiresAt) ? { holdExpiresAt: timestampIso(data.holdExpiresAt) } : {}),
        ...(typeof data.bookingId === 'string' ? { bookingId: data.bookingId } : {}),
        createdAt: timestampIso(data.createdAt),
        updatedAt: timestampIso(data.updatedAt),
      };
      const parsed = ownerVisibleRentalRequestSchema.safeParse(projection);
      if (!parsed.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'A rental request cannot be displayed safely.');
      }
      return parsed.data;
    });

    requests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return listOwnerRentalRequestsResultSchema.parse({ requests });
  }
}
