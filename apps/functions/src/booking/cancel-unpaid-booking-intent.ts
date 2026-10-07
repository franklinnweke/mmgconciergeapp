import { createHash, randomUUID } from 'node:crypto';

import { boundedIdSchema, dateOnlySchema } from '@mmg/contracts';
import {
  cancelUnpaidBookingIntentCommandSchema,
  cancelUnpaidBookingIntentResultSchema,
} from '@mmg/contracts/cancellation';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';

const identity = z.object({
  renterId: boundedIdSchema, ownerId: boundedIdSchema, vehicleId: boundedIdSchema,
  startDate: dateOnlySchema, endDate: dateOnlySchema,
}).passthrough();

/** Cancel only an uncharged historical hold. All reads precede all writes. */
export async function cancelUnpaidBookingIntent(
  command: unknown,
  renterId: string,
  database: Firestore = getFirestore(),
  now = new Date(),
) {
  if (!renterId) throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to cancel held dates.');
  const parsed = cancelUnpaidBookingIntentCommandSchema.safeParse(command);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Held-date cancellation is invalid.');
  const { intentId } = parsed.data.data;
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const requestHash = hash(parsed.data.data);
  const requestId = randomUUID();
  const replayRef = database.doc(`idempotencyKeys/${hash({ renterId, command: 'cancelUnpaidBookingIntent', key: parsed.data.idempotencyKey })}`);
  return database.runTransaction(async (transaction) => {
    const replay = await transaction.get(replayRef);
    if (replay.exists) {
      if (replay.data()?.actorId !== renterId || replay.data()?.requestHash !== requestHash) {
        throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'Cancellation key was already used differently.');
      }
      const result = cancelUnpaidBookingIntentResultSchema.safeParse(replay.data()?.result);
      if (!result.success || result.data.result.intentId !== intentId) throw new BookingCommandError('FAILED_PRECONDITION', 'Cancellation record is invalid.');
      return result.data;
    }
    const intentRef = database.doc(`bookingIntents/${intentId}`);
    const snapshot = await transaction.get(intentRef);
    if (!snapshot.exists) throw new BookingCommandError('NOT_FOUND', 'Held dates were not found.');
    if (snapshot.data()?.renterId !== renterId) throw new BookingCommandError('FORBIDDEN', 'You cannot cancel these held dates.');
    const owner = identity.safeParse(snapshot.data());
    if (!owner.success || owner.data.startDate >= owner.data.endDate) throw new BookingCommandError('FAILED_PRECONDITION', 'Held-date record is invalid.');
    const intent = snapshot.data()!;
    if (intent.rentalRequestId !== undefined || intent.state !== 'intent_created' ||
      intent.paymentId !== undefined || intent.paymentReference !== undefined || intent.bookingId !== undefined) {
      throw new BookingCommandError('INVALID_STATE_TRANSITION', 'Payment or request state changed. Refresh before cancelling.');
    }
    // Fail closed even if a corrupt historical intent omitted its payment binding.
    const payments = await transaction.get(database.collection('payments').where('intentId', '==', intentId).limit(1));
    if (!payments.empty) throw new BookingCommandError('FAILED_PRECONDITION', 'Payment activity needs review before releasing these dates.');
    const blockRef = database.doc(`bookingBlocks/${intentId}`);
    const blockSnapshot = await transaction.get(blockRef);
    const block = blockSnapshot.data();
    if (!blockSnapshot.exists || block?.state !== 'held' || block.intentId !== intentId || block.bookingId ||
      !Number.isSafeInteger(block.version) || block.version < 1 ||
      ['renterId', 'ownerId', 'vehicleId', 'startDate', 'endDate'].some((field) => block[field] !== intent[field])) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Held dates no longer match this request.');
    }
    const sentinelRef = database.doc(`vehicleAvailability/${owner.data.vehicleId}`);
    const sentinel = await transaction.get(sentinelRef);
    const version = sentinel.data()?.version;
    if (!sentinel.exists || !Number.isSafeInteger(version) || version < 0 || version >= Number.MAX_SAFE_INTEGER) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'Availability state is invalid.');
    }
    const at = Timestamp.fromDate(now);
    const result = cancelUnpaidBookingIntentResultSchema.parse({
      requestId, result: { intentId, state: 'expired', cancelledAt: now.toISOString(), inventoryReleased: true },
    });
    transaction.delete(blockRef);
    transaction.update(sentinelRef, { version: version + 1, updatedAt: at });
    transaction.update(intentRef, { state: 'expired', cancelledByRenterAt: at, updatedAt: at });
    transaction.create(database.doc(`auditEvents/${requestId}`), {
      eventType: 'booking.intent_cancelled_by_renter', actorId: renterId, actorType: 'renter',
      entityType: 'bookingIntent', entityId: intentId, requestId,
      fromState: 'intent_created', toState: 'expired', occurredAt: at,
      details: { vehicleId: owner.data.vehicleId, inventoryReleased: true },
    });
    transaction.create(replayRef, {
      actorId: renterId, commandName: 'cancelUnpaidBookingIntent', requestHash, result, createdAt: at,
    });
    return result;
  });
}
