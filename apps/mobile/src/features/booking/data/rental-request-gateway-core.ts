import type { CancelRentalRequestResult } from '@mmg/contracts/cancellation';
import {
  createRentalRequestDataSchema,
  type ApproveRentalRequestResult,
  type CreateRentalRequestData,
  type CreateRentalRequestResult,
  type DeclineRentalRequestResult,
  type ListOwnerRentalRequestsResult,
  type ListRenterRentalRequestsResult,
  type ReleaseRentalRequestPaymentHoldResult,
} from '@mmg/contracts/rental-request';

export interface RentalRequestGateway {
  createRequest(
    data: CreateRentalRequestData,
    idempotencyKey: string,
  ): Promise<CreateRentalRequestResult>;
  listRenterRequests(): Promise<ListRenterRentalRequestsResult>;
  listOwnerRequests(): Promise<ListOwnerRentalRequestsResult>;
  approveRequest(
    requestId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ApproveRentalRequestResult>;
  declineRequest(
    requestId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason?: string,
  ): Promise<DeclineRentalRequestResult>;
  cancelRequest(requestId: string, expectedVersion: number): Promise<CancelRentalRequestResult>;
  /** Legacy release-only action retained for compatibility with Build 31. */
  releasePaymentHold(requestId: string): Promise<ReleaseRentalRequestPaymentHoldResult>;
}

type IdempotencyKeyFactory = () => string;

function defaultIdempotencyKeyFactory(): string {
  return `rental_request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function rentalRequestFingerprint(data: CreateRentalRequestData): string {
  // Schema parsing normalizes field order/trim behavior and includes the entire
  // command payload, including coordinates and entrance instructions.
  return JSON.stringify(createRentalRequestDataSchema.parse(data));
}

export class RentalRequestSubmissionKey {
  private activeFingerprint: string | null = null;
  private activeKey: string | null = null;

  constructor(private readonly createKey: IdempotencyKeyFactory = defaultIdempotencyKeyFactory) {}

  forData(data: CreateRentalRequestData): string {
    const nextFingerprint = rentalRequestFingerprint(data);
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
