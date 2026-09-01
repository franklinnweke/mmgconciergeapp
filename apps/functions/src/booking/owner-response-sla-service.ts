import { BookingCommandError } from './errors.js';

export const DEFAULT_OWNER_RESPONSE_SLA_MINUTES = 30;

export type OwnerResponseSlaCandidate = {
  bookingId: string;
  ownerId: string;
  renterId: string;
  vehicleId: string;
  state: 'paid_pending_owner';
  createdAt: Date;
};

export interface OwnerResponseSlaRepository {
  getConfiguredSlaMinutes(): Promise<number | null>;
  listPaidPendingOwnerBookings(): Promise<readonly OwnerResponseSlaCandidate[]>;
  recordExceededSla(input: {
    bookingId: string;
    cutoff: Date;
    slaMinutes: number;
    now: Date;
  }): Promise<'created' | 'noop'>;
}

export type OwnerResponseSlaDependencies = {
  repository: OwnerResponseSlaRepository;
  now?: () => Date;
};

function resolveSlaMinutes(configured: number | null): number {
  if (configured === null) return DEFAULT_OWNER_RESPONSE_SLA_MINUTES;
  if (!Number.isSafeInteger(configured) || configured <= 0) {
    throw new BookingCommandError(
      'CONFIGURATION_UNAVAILABLE',
      'Owner response SLA configuration is invalid.',
    );
  }
  return configured;
}

/**
 * Emit durable operations signals for overdue `paid_pending_owner` bookings.
 *
 * This service never changes booking/payment/block state. A missing config uses
 * the architecture default of 30 minutes; a present malformed value fails
 * closed rather than silently choosing a different operations policy.
 */
export async function emitOwnerResponseSlaSignals(
  dependencies: OwnerResponseSlaDependencies,
): Promise<{ slaMinutes: number; scanned: number; alerted: number }> {
  const now = (dependencies.now ?? (() => new Date()))();
  const slaMinutes = resolveSlaMinutes(await dependencies.repository.getConfiguredSlaMinutes());
  const cutoff = new Date(now.getTime() - slaMinutes * 60_000);
  const candidates = await dependencies.repository.listPaidPendingOwnerBookings();

  let alerted = 0;
  for (const candidate of candidates) {
    if (candidate.createdAt.getTime() > cutoff.getTime()) continue;
    const result = await dependencies.repository.recordExceededSla({
      bookingId: candidate.bookingId,
      cutoff,
      slaMinutes,
      now,
    });
    if (result === 'created') alerted += 1;
  }

  return { slaMinutes, scanned: candidates.length, alerted };
}
