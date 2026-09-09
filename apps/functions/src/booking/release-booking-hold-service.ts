import { createHash, randomUUID } from 'node:crypto';

import {
  boundedIdSchema,
  idempotencyKeySchema,
  releaseBookingHoldCommandSchema,
  releaseBookingHoldDataSchema,
  type ReleaseBookingHoldCommand,
  type ReleaseBookingHoldResult,
} from '@mmg/contracts';
import { z } from 'zod';

import { BookingCommandError } from './errors.js';

export type ReleaseBookingHoldInput = {
  renterId: string;
  intentId: string;
  requestId: string;
  requestHash: string;
  idempotencyDocumentId: string;
  now: Date;
};

export interface BookingHoldReleaseRepository {
  releaseHold(input: ReleaseBookingHoldInput): Promise<ReleaseBookingHoldResult>;
}

export type ReleaseBookingHoldDependencies = {
  repository: BookingHoldReleaseRepository;
  now?: () => Date;
  createRequestId?: () => string;
};

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

const inputSchema = z.union([
  releaseBookingHoldCommandSchema,
  z.object({
    intentId: boundedIdSchema,
  }).transform((val) => ({
    schemaVersion: 1 as const,
    idempotencyKey: `rel_${val.intentId}`,
    data: { intentId: val.intentId },
  })),
  z.object({
    data: releaseBookingHoldDataSchema,
    idempotencyKey: idempotencyKeySchema.optional(),
  }).transform((val) => ({
    schemaVersion: 1 as const,
    idempotencyKey: val.idempotencyKey ?? `rel_${val.data.intentId}`,
    data: val.data,
  })),
]);

export async function releaseBookingHold(
  untrustedCommand: unknown,
  renterId: string,
  dependencies: ReleaseBookingHoldDependencies,
): Promise<ReleaseBookingHoldResult> {
  const parsed = inputSchema.safeParse(untrustedCommand);
  if (!parsed.success) {
    throw new BookingCommandError(
      'INVALID_ARGUMENT',
      'The booking hold release request format is invalid.',
      parsed.error.flatten(),
    );
  }
  const command = parsed.data;
  const now = dependencies.now ? dependencies.now() : new Date();
  const requestId = dependencies.createRequestId ? dependencies.createRequestId() : randomUUID();
  const requestHash = stableHash({ renterId, data: command.data });
  const idempotencyDocumentId = `hold_release_${command.idempotencyKey}_${requestHash.slice(0, 32)}`;

  return dependencies.repository.releaseHold({
    renterId,
    intentId: command.data.intentId,
    requestId,
    requestHash,
    idempotencyDocumentId,
    now,
  });
}
