import { createHash, randomUUID } from 'node:crypto';

import {
  confirmBookingCommandSchema,
  confirmBookingResultSchema,
  rejectBookingCommandSchema,
  rejectBookingResultSchema,
  type ConfirmBookingCommand,
  type ConfirmBookingResult,
  type PaidBookingState,
  type RejectBookingCommand,
  type RejectBookingResult,
} from '@mmg/contracts';
import { canTransitionPaidBooking } from '@mmg/domain';

import { BookingCommandError } from './errors.js';

export type PaidBookingActor = {
  uid: string;
  isSuperAdmin: boolean;
};

export type StoredPaidBooking = {
  bookingId: string;
  intentId: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  state: PaidBookingState;
  version: number;
  blockId: string;
};

export type StoredPaidBookingBlock = {
  blockId: string;
  bookingId: string;
  intentId: string;
  renterId: string;
  ownerId: string;
  vehicleId: string;
  startDate: string;
  endDate: string;
  state: 'held' | 'paid' | 'confirmed' | 'owner_block';
};

export type StoredPaidBookingIdempotency = {
  requestHash: string;
  result: unknown;
};

export type PaidBookingCase = {
  caseId: string;
  bookingId: string;
  vehicleId: string;
  ownerId: string;
  renterId: string;
  type: 'owner_rejection';
  status: 'open';
  ownerReason: string;
  openedAt: Date;
  openedBy: string;
  version: 1;
};

export type PaidBookingAuditEvent = {
  actorId: string;
  actorType: 'owner' | 'admin';
  entityId: string;
  entityType: 'booking' | 'bookingCase';
  eventType: 'booking.owner_confirmed' | 'booking.owner_rejected' | 'booking.case_opened';
  fromState: string | null;
  toState: string;
  requestId: string;
  occurredAt: Date;
  details: Record<string, string | boolean>;
};

export type PaidBookingOutboxEvent = {
  eventId: string;
  eventType: 'booking.owner_confirmed' | 'booking.owner_rejected';
  bookingId: string;
  ownerId: string;
  renterId: string;
  status: 'unavailable';
  reason: 'fcm_not_in_sequence_2_3';
  createdAt: Date;
};

export interface PaidBookingResponseTransaction {
  getIdempotency(documentId: string): Promise<StoredPaidBookingIdempotency | null>;
  getBooking(bookingId: string): Promise<StoredPaidBooking | null>;
  getBookingBlock(blockId: string): Promise<StoredPaidBookingBlock | null>;
  readAvailabilitySentinel(vehicleId: string): Promise<number>;
  updateBooking(
    bookingId: string,
    patch: {
      state: 'confirmed' | 'intervention_required';
      version: number;
      updatedAt: Date;
      lastOwnerDecisionReason: string | null;
    },
  ): void;
  updateBookingBlock(blockId: string, state: 'confirmed', updatedAt: Date): void;
  deleteBookingBlock(blockId: string): void;
  writeAvailabilitySentinel(vehicleId: string, version: number, updatedAt: Date): void;
  createBookingCase(record: PaidBookingCase): void;
  createAuditEvent(event: PaidBookingAuditEvent): void;
  createOutboxEvent(event: PaidBookingOutboxEvent): void;
  saveIdempotency(
    documentId: string,
    record: {
      requestHash: string;
      commandName: 'confirmBooking' | 'rejectBooking';
      actorId: string;
      result: unknown;
    },
    createdAt: Date,
  ): void;
}

export interface PaidBookingResponseRepository {
  runTransaction<T>(work: (transaction: PaidBookingResponseTransaction) => Promise<T>): Promise<T>;
}

type PaidBookingResponseDependencies = {
  repository: PaidBookingResponseRepository;
  now?: () => Date;
  createId?: () => string;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function requireBookingActor(booking: StoredPaidBooking, actor: PaidBookingActor): void {
  if (booking.ownerId !== actor.uid && !actor.isSuperAdmin) {
    throw new BookingCommandError('FORBIDDEN', 'You cannot manage this booking.', {
      reason: 'not_vehicle_owner',
    });
  }
}

function requirePaidPendingOwner(
  booking: StoredPaidBooking,
  expectedVersion: number,
  target: 'confirmed' | 'intervention_required',
): void {
  if (booking.version !== expectedVersion) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'This booking changed. Refresh and try again.',
      { reason: 'stale_version' },
    );
  }
  if (
    booking.state !== 'paid_pending_owner' ||
    !canTransitionPaidBooking(booking.state, target)
  ) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'Only a paid booking can be confirmed or declined.',
      { reason: 'not_paid' },
    );
  }
}

async function requireExactPaidBookingBlock(
  transaction: PaidBookingResponseTransaction,
  booking: StoredPaidBooking,
): Promise<StoredPaidBookingBlock> {
  const block = await transaction.getBookingBlock(booking.blockId);
  if (!block) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'The paid booking availability record is missing.',
      { reason: 'paid_block_missing' },
    );
  }

  if (
    block.state !== 'paid' ||
    block.bookingId !== booking.bookingId ||
    block.intentId !== booking.intentId ||
    block.renterId !== booking.renterId ||
    block.ownerId !== booking.ownerId ||
    block.vehicleId !== booking.vehicleId ||
    block.startDate !== booking.startDate ||
    block.endDate !== booking.endDate
  ) {
    throw new BookingCommandError(
      'FAILED_PRECONDITION',
      'The paid booking availability record is inconsistent.',
      { reason: 'paid_block_mismatch' },
    );
  }
  return block;
}

export async function confirmBooking(
  untrustedCommand: unknown,
  actor: PaidBookingActor,
  dependencies: PaidBookingResponseDependencies,
): Promise<ConfirmBookingResult> {
  if (!actor.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to respond to booking requests.');
  }
  const parsed = confirmBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Confirm booking command is invalid.');
  }
  const command: ConfirmBookingCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actor.uid,
    commandName: 'confirmBooking',
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return confirmBookingResultSchema.parse(replay.result);
    }

    const booking = await transaction.getBooking(command.data.bookingId);
    if (!booking) throw new BookingCommandError('NOT_FOUND', 'Booking not found.');
    requireBookingActor(booking, actor);
    requirePaidPendingOwner(booking, command.data.expectedVersion, 'confirmed');

    const block = await requireExactPaidBookingBlock(transaction, booking);
    const availabilityVersion = await transaction.readAvailabilitySentinel(booking.vehicleId);
    const nextVersion = booking.version + 1;
    transaction.updateBooking(booking.bookingId, {
      state: 'confirmed',
      version: nextVersion,
      updatedAt: now,
      lastOwnerDecisionReason: null,
    });
    transaction.updateBookingBlock(block.blockId, 'confirmed', now);
    transaction.writeAvailabilitySentinel(booking.vehicleId, availabilityVersion + 1, now);
    transaction.createAuditEvent({
      actorId: actor.uid,
      actorType: actor.isSuperAdmin ? 'admin' : 'owner',
      entityId: booking.bookingId,
      entityType: 'booking',
      eventType: 'booking.owner_confirmed',
      fromState: 'paid_pending_owner',
      toState: 'confirmed',
      requestId,
      occurredAt: now,
      details: { vehicleId: booking.vehicleId },
    });
    transaction.createOutboxEvent({
      eventId: (dependencies.createId ?? randomUUID)(),
      eventType: 'booking.owner_confirmed',
      bookingId: booking.bookingId,
      ownerId: booking.ownerId,
      renterId: booking.renterId,
      status: 'unavailable',
      reason: 'fcm_not_in_sequence_2_3',
      createdAt: now,
    });

    const result = confirmBookingResultSchema.parse({
      requestId,
      result: {
        bookingId: booking.bookingId,
        fromState: 'paid_pending_owner',
        toState: 'confirmed',
        decidedAt: now.toISOString(),
        version: nextVersion,
      },
    });
    transaction.saveIdempotency(idempotencyDocumentId, {
      requestHash,
      commandName: 'confirmBooking',
      actorId: actor.uid,
      result,
    }, now);
    return result;
  });
}

export async function rejectBooking(
  untrustedCommand: unknown,
  actor: PaidBookingActor,
  dependencies: PaidBookingResponseDependencies,
): Promise<RejectBookingResult> {
  if (!actor.uid) {
    throw new BookingCommandError('UNAUTHENTICATED', 'Sign in to respond to booking requests.');
  }
  const parsed = rejectBookingCommandSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError('INVALID_ARGUMENT', 'Reject booking command is invalid.');
  }
  const command: RejectBookingCommand = parsed.data;
  const now = (dependencies.now ?? (() => new Date()))();
  const requestId = (dependencies.createRequestId ?? randomUUID)();
  const createId = dependencies.createId ?? randomUUID;
  const requestHash = stableHash(command.data);
  const idempotencyDocumentId = stableHash({
    actorId: actor.uid,
    commandName: 'rejectBooking',
    idempotencyKey: command.idempotencyKey,
  });

  return dependencies.repository.runTransaction(async (transaction) => {
    const replay = await transaction.getIdempotency(idempotencyDocumentId);
    if (replay) {
      if (replay.requestHash !== requestHash) {
        throw new BookingCommandError(
          'IDEMPOTENCY_CONFLICT',
          'This idempotency key was already used for a different request.',
        );
      }
      return rejectBookingResultSchema.parse(replay.result);
    }

    const booking = await transaction.getBooking(command.data.bookingId);
    if (!booking) throw new BookingCommandError('NOT_FOUND', 'Booking not found.');
    requireBookingActor(booking, actor);
    requirePaidPendingOwner(booking, command.data.expectedVersion, 'intervention_required');

    const block = await requireExactPaidBookingBlock(transaction, booking);
    const availabilityVersion = await transaction.readAvailabilitySentinel(booking.vehicleId);
    const caseId = createId();
    const nextVersion = booking.version + 1;
    transaction.updateBooking(booking.bookingId, {
      state: 'intervention_required',
      version: nextVersion,
      updatedAt: now,
      lastOwnerDecisionReason: command.data.reason,
    });
    transaction.deleteBookingBlock(block.blockId);
    transaction.writeAvailabilitySentinel(booking.vehicleId, availabilityVersion + 1, now);
    transaction.createBookingCase({
      caseId,
      bookingId: booking.bookingId,
      vehicleId: booking.vehicleId,
      ownerId: booking.ownerId,
      renterId: booking.renterId,
      type: 'owner_rejection',
      status: 'open',
      ownerReason: command.data.reason,
      openedAt: now,
      openedBy: actor.uid,
      version: 1,
    });
    transaction.createAuditEvent({
      actorId: actor.uid,
      actorType: actor.isSuperAdmin ? 'admin' : 'owner',
      entityId: booking.bookingId,
      entityType: 'booking',
      eventType: 'booking.owner_rejected',
      fromState: 'paid_pending_owner',
      toState: 'intervention_required',
      requestId,
      occurredAt: now,
      details: { vehicleId: booking.vehicleId, caseId },
    });
    transaction.createAuditEvent({
      actorId: actor.uid,
      actorType: actor.isSuperAdmin ? 'admin' : 'owner',
      entityId: caseId,
      entityType: 'bookingCase',
      eventType: 'booking.case_opened',
      fromState: null,
      toState: 'open',
      requestId,
      occurredAt: now,
      details: { bookingId: booking.bookingId, vehicleId: booking.vehicleId },
    });
    transaction.createOutboxEvent({
      eventId: createId(),
      eventType: 'booking.owner_rejected',
      bookingId: booking.bookingId,
      ownerId: booking.ownerId,
      renterId: booking.renterId,
      status: 'unavailable',
      reason: 'fcm_not_in_sequence_2_3',
      createdAt: now,
    });

    const result = rejectBookingResultSchema.parse({
      requestId,
      result: {
        bookingId: booking.bookingId,
        caseId,
        fromState: 'paid_pending_owner',
        toState: 'intervention_required',
        decidedAt: now.toISOString(),
        version: nextVersion,
      },
    });
    transaction.saveIdempotency(idempotencyDocumentId, {
      requestHash,
      commandName: 'rejectBooking',
      actorId: actor.uid,
      result,
    }, now);
    return result;
  });
}
