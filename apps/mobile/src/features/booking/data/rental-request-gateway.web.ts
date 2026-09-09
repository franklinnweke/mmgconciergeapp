import type {
  ApproveRentalRequestResult,
  CreateRentalRequestData,
  CreateRentalRequestResult,
  DeclineRentalRequestResult,
  ListOwnerRentalRequestsResult,
  ListRenterRentalRequestsResult,
} from '@mmg/contracts/rental-request';

import type { RentalRequestGateway } from './rental-request-gateway-core';

export { RentalRequestSubmissionKey } from './rental-request-gateway-core';
export type { RentalRequestGateway } from './rental-request-gateway-core';

export class WebRentalRequestGateway implements RentalRequestGateway {
  private unavailable(action: string): never {
    throw new Error(
      process.env.NODE_ENV === 'production'
        ? 'Rental requests are unavailable in this web release.'
        : `Sample ${action} does not change live data. Use a native build for request-first booking.`,
    );
  }

  async createRequest(
    _data: CreateRentalRequestData,
    _idempotencyKey: string,
  ): Promise<CreateRentalRequestResult> {
    this.unavailable('requests');
  }

  async listRenterRequests(): Promise<ListRenterRentalRequestsResult> {
    return { requests: [] };
  }

  async listOwnerRequests(): Promise<ListOwnerRentalRequestsResult> {
    return { requests: [] };
  }

  async approveRequest(
    _requestId: string,
    _expectedVersion: number,
    _idempotencyKey: string,
  ): Promise<ApproveRentalRequestResult> {
    this.unavailable('owner approval');
  }

  async declineRequest(
    _requestId: string,
    _expectedVersion: number,
    _idempotencyKey: string,
    _reason?: string,
  ): Promise<DeclineRentalRequestResult> {
    this.unavailable('owner decline');
  }
}

export function createRentalRequestGateway(): RentalRequestGateway {
  return new WebRentalRequestGateway();
}
