import type { CreateBookingIntentData, CreateBookingIntentResult } from '@mmg/contracts';

export interface BookingIntentGateway {
  createIntent(
    data: CreateBookingIntentData,
    idempotencyKey: string,
  ): Promise<CreateBookingIntentResult>;
}

type IdempotencyKeyFactory = () => string;

function defaultIdempotencyKeyFactory(): string {
  return `booking_intent_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function fingerprint(data: CreateBookingIntentData): string {
  return JSON.stringify([data.vehicleId, data.startDate, data.endDate]);
}

/**
 * Keeps retries of one unchanged submission on the same server idempotency key.
 * A new journey selection, or a completed intent, starts a new operation.
 */
export class BookingIntentSubmissionKey {
  private activeFingerprint: string | null = null;
  private activeKey: string | null = null;

  constructor(private readonly createKey: IdempotencyKeyFactory = defaultIdempotencyKeyFactory) {}

  forData(data: CreateBookingIntentData): string {
    const nextFingerprint = fingerprint(data);
    if (this.activeFingerprint !== nextFingerprint || !this.activeKey) {
      this.activeFingerprint = nextFingerprint;
      this.activeKey = this.createKey();
    }
    return this.activeKey;
  }

  markSucceeded(): void {
    this.activeFingerprint = null;
    this.activeKey = null;
  }
}
