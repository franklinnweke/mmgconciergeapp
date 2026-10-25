import { createHash, randomUUID } from 'node:crypto';
import { dateOnlySchema } from '@mmg/contracts';
import { confirmRentalRequestPickupCommandSchema, pickupLocationSnapshotSchema } from '@mmg/contracts/rental-request';
import { getFirestore, Timestamp, type Firestore } from 'firebase-admin/firestore';

import { BookingCommandError } from './errors.js';

/** Admin server only. No booking, payment, price or availability state is changed. */
export async function confirmRentalRequestPickup(
  command: unknown,
  actor: { uid: string; role: string },
  database: Firestore = getFirestore(),
  now = new Date(),
) {
  if (!actor.uid || !['support', 'super_admin'].includes(actor.role)) {
    throw new BookingCommandError('FORBIDDEN', 'Dispatch access is required.');
  }
  const parsed = confirmRentalRequestPickupCommandSchema.safeParse(command);
  if (!parsed.success) throw new BookingCommandError('INVALID_ARGUMENT', 'Enter a valid pickup time.');
  const { requestId, expectedVersion, confirmedPickupTime } = parsed.data.data;
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const requestHash = hash(parsed.data.data);
  const auditId = randomUUID();
  const replayRef = database.doc(`idempotencyKeys/${hash({ actorId: actor.uid, command: 'confirmRentalRequestPickup', key: parsed.data.idempotencyKey })}`);
  return database.runTransaction(async (transaction) => {
    const replay = await transaction.get(replayRef);
    if (replay.exists) {
      const saved = replay.data()!;
      if (saved.actorId !== actor.uid || saved.requestHash !== requestHash) {
        throw new BookingCommandError('IDEMPOTENCY_CONFLICT', 'This pickup confirmation key was already used differently.');
      }
      if (!saved.result || !['approved', 'ready_for_payment', 'confirmed'].includes(saved.result.state)
        || !Number.isSafeInteger(saved.result.version) || saved.result.version < 1) {
        throw new BookingCommandError('FAILED_PRECONDITION', 'Pickup confirmation replay is invalid.');
      }
      return { state: String(saved.result.state), version: Number(saved.result.version) };
    }
    const ref = database.doc(`rentalRequests/${requestId}`);
    const snapshot = await transaction.get(ref);
    const request = snapshot.data();
    if (!snapshot.exists || !request) throw new BookingCommandError('NOT_FOUND', 'Rental request was not found.');
    if (request.requestId !== requestId || !Number.isSafeInteger(request.version)
      || request.version !== expectedVersion || request.version >= Number.MAX_SAFE_INTEGER) {
      throw new BookingCommandError('INVALID_STATE_TRANSITION', 'Refresh this request before confirming pickup.');
    }
    if (!['approved', 'ready_for_payment', 'confirmed'].includes(request.state) || request.cancellationRequestedAt) {
      throw new BookingCommandError('INVALID_STATE_TRANSITION', 'Pickup cannot be confirmed for this request state.');
    }
    const pickup = pickupLocationSnapshotSchema.safeParse(request.pickupLocation);
    if (!dateOnlySchema.safeParse(request.startDate).success || !pickup.success
      || pickup.data.serviceAreaLabel !== request.serviceAreaLabel) {
      throw new BookingCommandError('FAILED_PRECONDITION', 'A valid pickup location and date are required.');
    }
    const scheduledAt = Date.parse(`${request.startDate}T${confirmedPickupTime}:00+01:00`);
    if (!Number.isFinite(scheduledAt) || scheduledAt < now.getTime()) {
      throw new BookingCommandError('INVALID_ARGUMENT', 'Pickup time must be in the future.');
    }
    const result = { state: String(request.state), version: request.version + 1 };
    const occurredAt = Timestamp.fromDate(now);
    transaction.update(ref, { confirmedPickupTime, version: result.version, updatedAt: occurredAt });
    transaction.create(database.doc(`auditEvents/${auditId}`), {
      eventType: 'rental_request.pickup_time_confirmed', actorId: actor.uid, actorType: 'staff',
      entityType: 'rentalRequest', entityId: requestId, requestId: auditId, occurredAt,
      details: { previousPickupTime: request.confirmedPickupTime ?? null, confirmedPickupTime, timeZone: 'Africa/Lagos' },
    });
    transaction.create(database.doc(`adminAuditLogs/${auditId}`), {
      actorUid: actor.uid, actorRole: actor.role, action: 'rental_request.pickup_time_confirmed',
      entityType: 'rentalRequest', entityId: requestId, occurredAt,
      details: { confirmedPickupTime, timeZone: 'Africa/Lagos' },
    });
    transaction.create(replayRef, { actorId: actor.uid, requestHash, result, createdAt: occurredAt });
    return result;
  });
}
