import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';
import type {
  OwnerResponseSlaCandidate,
  OwnerResponseSlaRepository,
} from './owner-response-sla-service.js';

const candidateSchema = z.object({
  ownerId: z.string().min(1).max(128),
  renterId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128),
  state: z.literal('paid_pending_owner'),
  createdAt: z.instanceof(Timestamp),
  ownerResponseSlaAlertedAt: z.instanceof(Timestamp).optional(),
}).passthrough();

export class FirestoreOwnerResponseSlaRepository implements OwnerResponseSlaRepository {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async getConfiguredSlaMinutes(): Promise<number | null> {
    const snapshot = await this.firestore.doc('systemConfig/private').get();
    if (!snapshot.exists) return null;
    const value = snapshot.data()?.ownerResponseSlaMinutes;
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number') {
      throw new BookingCommandError(
        'CONFIGURATION_UNAVAILABLE',
        'Owner response SLA configuration is invalid.',
      );
    }
    return value;
  }

  async listPaidPendingOwnerBookings(): Promise<readonly OwnerResponseSlaCandidate[]> {
    const snapshot = await this.firestore.collection('bookings')
      .where('state', '==', 'paid_pending_owner')
      .get();

    return snapshot.docs.map((document) => {
      const parsed = candidateSchema.safeParse(document.data());
      if (!parsed.success) {
        throw new BookingCommandError(
          'FAILED_PRECONDITION',
          'Paid booking data is invalid for owner response monitoring.',
        );
      }
      return {
        bookingId: document.id,
        ownerId: parsed.data.ownerId,
        renterId: parsed.data.renterId,
        vehicleId: parsed.data.vehicleId,
        state: 'paid_pending_owner',
        createdAt: parsed.data.createdAt.toDate(),
      };
    });
  }

  async recordExceededSla(input: {
    bookingId: string;
    cutoff: Date;
    slaMinutes: number;
    now: Date;
  }): Promise<'created' | 'noop'> {
    return this.firestore.runTransaction(async (transaction) => {
      const bookingRef = this.firestore.doc(`bookings/${input.bookingId}`);
      const bookingSnapshot = await transaction.get(bookingRef);
      if (!bookingSnapshot.exists) return 'noop';

      const parsed = candidateSchema.safeParse(bookingSnapshot.data());
      if (!parsed.success) return 'noop';
      if (parsed.data.state !== 'paid_pending_owner') return 'noop';
      if (parsed.data.createdAt.toMillis() > input.cutoff.getTime()) return 'noop';
      if (parsed.data.ownerResponseSlaAlertedAt) return 'noop';

      const eventId = `owner-response-sla-${input.bookingId}`;
      const outboxRef = this.firestore.doc(`notificationOutbox/${eventId}`);
      const outboxSnapshot = await transaction.get(outboxRef);
      if (outboxSnapshot.exists) {
        transaction.update(bookingRef, {
          ownerResponseSlaAlertedAt: Timestamp.fromDate(input.now),
          ownerResponseSlaMinutes: input.slaMinutes,
          updatedAt: Timestamp.fromDate(input.now),
        });
        return 'noop';
      }

      transaction.update(bookingRef, {
        ownerResponseSlaAlertedAt: Timestamp.fromDate(input.now),
        ownerResponseSlaMinutes: input.slaMinutes,
        updatedAt: Timestamp.fromDate(input.now),
      });
      transaction.create(outboxRef, {
        eventId,
        eventType: 'booking.owner_response_sla_exceeded',
        audience: 'operations',
        bookingId: input.bookingId,
        ownerId: parsed.data.ownerId,
        renterId: parsed.data.renterId,
        vehicleId: parsed.data.vehicleId,
        slaMinutes: input.slaMinutes,
        status: 'unavailable',
        reason: 'admin_alert_delivery_not_in_wp4',
        createdAt: Timestamp.fromDate(input.now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: 'system',
        actorType: 'system',
        entityId: input.bookingId,
        entityType: 'booking',
        eventType: 'booking.owner_response_sla_exceeded',
        fromState: 'paid_pending_owner',
        toState: 'paid_pending_owner',
        requestId: eventId,
        occurredAt: Timestamp.fromDate(input.now),
        details: {
          ownerId: parsed.data.ownerId,
          vehicleId: parsed.data.vehicleId,
          slaMinutes: input.slaMinutes,
        },
      });
      return 'created';
    });
  }
}
