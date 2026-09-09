import type {
  ApproveRentalRequestResult,
  CreateRentalRequestData,
  CreateRentalRequestResult,
  DeclineRentalRequestResult,
  ListOwnerRentalRequestsResult,
  ListRenterRentalRequestsResult,
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
}

type IdempotencyKeyFactory = () => string;

function defaultIdempotencyKeyFactory(): string {
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

  constructor(private readonly createKey: IdempotencyKeyFactory = defaultIdempotencyKeyFactory) {}

  forData(data: CreateRentalRequestData): string {
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
