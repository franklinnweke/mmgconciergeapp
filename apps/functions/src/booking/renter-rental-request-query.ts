import {
  listRenterRentalRequestsResultSchema,
  renterVisibleRentalRequestSchema,
  type ListRenterRentalRequestsResult,
} from '@mmg/contracts/rental-request';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

import { clientRentalRequestProjection } from './client-rental-request-projection.js';
import { BookingCommandError } from './errors.js';

export class FirestoreRenterRentalRequestQuery {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async list(renterId: string, includePickupDispatch = false): Promise<ListRenterRentalRequestsResult> {
    const snapshot = await this.firestore
      .collection('rentalRequests')
      .where('renterId', '==', renterId)
      .limit(200)
      .get();

    const requests = snapshot.docs.map((document) => {
      const parsed = renterVisibleRentalRequestSchema.safeParse(
        clientRentalRequestProjection(document.id, document.data(), { audience: 'renter', includePickupDispatch }),
      );
      if (!parsed.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'A rental request cannot be displayed safely.');
      }
      return parsed.data;
    });

    requests.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return listRenterRentalRequestsResultSchema.parse({ requests });
  }
}
