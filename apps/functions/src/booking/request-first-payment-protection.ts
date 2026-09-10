import { dateOnlySchema } from '@mmg/contracts';
import { rentalRequestStateSchema } from '@mmg/contracts/rental-request';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';

const PAYMENT_IN_FLIGHT_PROTECTION_MINUTES = 120;

const intentSchema = z.object({
  renterId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128), vehicleId: z.string().min(1).max(128),
  rentalRequestId: z.string().min(1).max(128).optional(), state: z.enum(['intent_created', 'checkout_pending']),
  startDate: dateOnlySchema, endDate: dateOnlySchema,
}).passthrough();

const requestSchema = z.object({
  requestId: z.string().min(1).max(128), renterId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128),
  vehicleId: z.string().min(1).max(128), startDate: dateOnlySchema, endDate: dateOnlySchema,
  state: rentalRequestStateSchema, version: z.number().int().positive(), intentId: z.string().min(1).max(128).optional(),
  holdExpiresAt: z.instanceof(Timestamp).optional(),
}).passthrough();

const heldBlockSchema = z.object({
  intentId: z.string().min(1).max(128), rentalRequestId: z.string().min(1).max(128).optional(),
  renterId: z.string().min(1).max(128), ownerId: z.string().min(1).max(128), vehicleId: z.string().min(1).max(128),
  startDate: dateOnlySchema, endDate: dateOnlySchema, state: z.literal('held'), expiresAt: z.instanceof(Timestamp),
  paymentProtectionExpiresAt: z.instanceof(Timestamp).optional(),
}).passthrough();

export class FirestoreRequestFirstPaymentProtection {
  constructor(private readonly firestore: Firestore = getFirestore()) {}

  async protect(intentId: string, renterId: string, now: Date): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const intentRef = this.firestore.doc(`bookingIntents/${intentId}`);
      const intentSnapshot = await transaction.get(intentRef);
      const intent = intentSchema.safeParse(intentSnapshot.data());
      if (!intentSnapshot.exists || !intent.success || !intent.data.rentalRequestId) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'This payment is not linked to an approved rental request.');
      }
      if (intent.data.renterId !== renterId) throw new BookingCommandError('FORBIDDEN', 'You cannot pay for this rental request.');

      const requestRef = this.firestore.doc(`rentalRequests/${intent.data.rentalRequestId}`);
      const blockRef = this.firestore.doc(`bookingBlocks/${intentId}`);
      const [requestSnapshot, blockSnapshot] = await Promise.all([transaction.get(requestRef), transaction.get(blockRef)]);
      const request = requestSchema.safeParse(requestSnapshot.data());
      const block = heldBlockSchema.safeParse(blockSnapshot.data());
      if (!requestSnapshot.exists || !request.success || !blockSnapshot.exists || !block.success) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Rental request payment state is incomplete.');
      }
      if (
        request.data.requestId !== intent.data.rentalRequestId || request.data.renterId !== renterId ||
        request.data.ownerId !== intent.data.ownerId || request.data.vehicleId !== intent.data.vehicleId ||
        request.data.startDate !== intent.data.startDate || request.data.endDate !== intent.data.endDate ||
        request.data.intentId !== intentId || request.data.state !== 'ready_for_payment' ||
        block.data.intentId !== intentId || block.data.rentalRequestId !== request.data.requestId ||
        block.data.renterId !== renterId || block.data.ownerId !== request.data.ownerId || block.data.vehicleId !== request.data.vehicleId ||
        block.data.startDate !== request.data.startDate || block.data.endDate !== request.data.endDate
      ) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Rental request payment binding is inconsistent.');
      }

      if (intent.data.state === 'checkout_pending') {
        if (!block.data.paymentProtectionExpiresAt || block.data.paymentProtectionExpiresAt.toMillis() <= now.getTime()) {
          throw new BookingCommandError('FAILED_PRECONDITION', 'The protected payment attempt needs concierge review.');
        }
        return;
      }

      if (!request.data.holdExpiresAt || request.data.holdExpiresAt.toMillis() <= now.getTime() || block.data.expiresAt.toMillis() <= now.getTime()) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'The 30-minute payment window has expired.', { reason: 'expired' });
      }

      const protectionExpiresAt = new Date(now.getTime() + PAYMENT_IN_FLIGHT_PROTECTION_MINUTES * 60 * 1000);
      transaction.update(blockRef, {
        paymentWindowExpiresAt: request.data.holdExpiresAt,
        paymentProtectionStartedAt: Timestamp.fromDate(now),
        paymentProtectionExpiresAt: Timestamp.fromDate(protectionExpiresAt),
        expiresAt: Timestamp.fromDate(protectionExpiresAt),
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.create(this.firestore.collection('auditEvents').doc(), {
        actorId: renterId, actorType: 'renter', entityId: request.data.requestId, entityType: 'rentalRequest',
        eventType: 'rental_request.payment_started', fromState: 'ready_for_payment', toState: 'ready_for_payment',
        requestId: `payment-start-${intentId}`, occurredAt: Timestamp.fromDate(now),
        details: { intentId, paymentWindowExpiresAt: request.data.holdExpiresAt.toDate().toISOString(), protectionExpiresAt: protectionExpiresAt.toISOString() },
      });
    });
  }
}
