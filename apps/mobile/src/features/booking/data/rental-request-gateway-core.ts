import type {
  CreateRentalRequestData,
  CreateRentalRequestResult,
  ReleaseRentalRequestPaymentHoldResult,
  RenterVisibleRentalRequest,
} from '@mmg/contracts/rental-request';

export interface RentalRequestGateway {
  createRequest(data: CreateRentalRequestData, idempotencyKey: string): Promise<CreateRentalRequestResult>;
  getRequest(requestId: string): Promise<RenterVisibleRentalRequest | null>;
  releasePaymentHold(requestId: string): Promise<ReleaseRentalRequestPaymentHoldResult>;
}

type KeyFactory = () => string;

function defaultKey(): string {
  return `rental_request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function fingerprint(data: CreateRentalRequestData): string {
  return JSON.stringify([
    data.vehicleId,
    data.startDate,
    data.endDate,
    data.contactPhone,
    data.serviceAreaLabel,
  ]);
}

export class RentalRequestSubmissionKey {
  private activeFingerprint: string | null = null;
  private activeKey: string | null = null;

  constructor(private readonly createKey: KeyFactory = defaultKey) {}

  forData(data: CreateRentalRequestData): string {
    const next = fingerprint(data);
    if (!this.activeKey || this.activeFingerprint !== next) {
      this.activeFingerprint = next;
      this.activeKey = this.createKey();
    }
    return this.activeKey;
  }

  markSucceeded(): void {
    this.activeFingerprint = null;
    this.activeKey = null;
  }
}
