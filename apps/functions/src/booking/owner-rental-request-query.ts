import {
  listOwnerRentalRequestsResultSchema,
  ownerVisibleRentalRequestSchema,
  type ListOwnerRentalRequestsResult,
} from '@mmg/contracts/rental-request';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { clientRentalRequestProjection } from './client-rental-request-projection.js';
import { BookingCommandError } from './errors.js';

export class FirestoreOwnerRentalRequestQuery {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async list(ownerId: string): Promise<ListOwnerRentalRequestsResult> {
    const snapshot = await this.firestore
      .collection('rentalRequests')
      .where('ownerId', '==', ownerId)
      .limit(200)
      .get();

    const requests = snapshot.docs.map((document) => {
      const parsed = ownerVisibleRentalRequestSchema.safeParse(
        clientRentalRequestProjection(document.id, document.data(), { audience: 'owner' }),
      );
      if (!parsed.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'A rental request cannot be displayed safely.');
      }
      return parsed.data;
    });

    requests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return listOwnerRentalRequestsResultSchema.parse({ requests });
  }
}
