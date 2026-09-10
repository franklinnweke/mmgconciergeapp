import {
  cancelRentalRequestCommandSchema,
  cancelRentalRequestResultSchema,
  type CancelRentalRequestResult,
} from '@mmg/contracts/cancellation';
import {
  approveRentalRequestCommandSchema,
  approveRentalRequestResultSchema,
  createRentalRequestCommandSchema,
  createRentalRequestResultSchema,
  declineRentalRequestCommandSchema,
  declineRentalRequestResultSchema,
  listOwnerRentalRequestsCommandSchema,
  listOwnerRentalRequestsResultSchema,
  listRenterRentalRequestsCommandSchema,
  listRenterRentalRequestsResultSchema,
  releaseRentalRequestPaymentHoldCommandSchema,
  releaseRentalRequestPaymentHoldResultSchema,
  type ApproveRentalRequestResult,
  type CreateRentalRequestData,
  type CreateRentalRequestResult,
  type DeclineRentalRequestResult,
  type ListOwnerRentalRequestsResult,
  type ListRenterRentalRequestsResult,
  type ReleaseRentalRequestPaymentHoldResult,
} from '@mmg/contracts/rental-request';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import type { RentalRequestGateway } from './rental-request-gateway-core';

export { RentalRequestSubmissionKey } from './rental-request-gateway-core';
export type { RentalRequestGateway } from './rental-request-gateway-core';

function command(idempotencyKey: string, data: Record<string, unknown>) {
  return { schemaVersion: 1, idempotencyKey, data };
}

function cancellationKey(requestId: string): string {
  return `cancel_rental_request_${requestId.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 120);
}

export class NativeRentalRequestGateway implements RentalRequestGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async createRequest(
    data: CreateRentalRequestData,
    idempotencyKey: string,
  ): Promise<CreateRentalRequestResult> {
    const parsed = createRentalRequestCommandSchema.parse(command(idempotencyKey, data));
    const callable = httpsCallable(this.functions, 'createRentalRequest');
    const response = await callable(parsed);
    return parseCallableResult(createRentalRequestResultSchema, response.data, 'createRentalRequest');
  }

  async listRenterRequests(): Promise<ListRenterRentalRequestsResult> {
    const parsed = listRenterRentalRequestsCommandSchema.parse({ schemaVersion: 1 });
    const callable = httpsCallable(this.functions, 'listRenterRentalRequests');
    const response = await callable(parsed);
    return parseCallableResult(
      listRenterRentalRequestsResultSchema,
      response.data,
      'listRenterRentalRequests',
    );
  }

  async listOwnerRequests(): Promise<ListOwnerRentalRequestsResult> {
    const parsed = listOwnerRentalRequestsCommandSchema.parse({ schemaVersion: 1 });
    const callable = httpsCallable(this.functions, 'listOwnerRentalRequests');
    const response = await callable(parsed);
    return parseCallableResult(
      listOwnerRentalRequestsResultSchema,
      response.data,
      'listOwnerRentalRequests',
    );
  }

  async approveRequest(
    requestId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ApproveRentalRequestResult> {
    const parsed = approveRentalRequestCommandSchema.parse(
      command(idempotencyKey, { requestId, expectedVersion }),
    );
    const callable = httpsCallable(this.functions, 'approveRentalRequest');
    const response = await callable(parsed);
    return parseCallableResult(approveRentalRequestResultSchema, response.data, 'approveRentalRequest');
  }

  async declineRequest(
    requestId: string,
    expectedVersion: number,
    idempotencyKey: string,
    reason?: string,
  ): Promise<DeclineRentalRequestResult> {
    const parsed = declineRentalRequestCommandSchema.parse(
      command(idempotencyKey, {
        requestId,
        expectedVersion,
        ...(reason ? { reason } : {}),
      }),
    );
    const callable = httpsCallable(this.functions, 'declineRentalRequest');
    const response = await callable(parsed);
    return parseCallableResult(declineRentalRequestResultSchema, response.data, 'declineRentalRequest');
  }

  async cancelRequest(requestId: string, expectedVersion: number): Promise<CancelRentalRequestResult> {
    const parsed = cancelRentalRequestCommandSchema.parse(
      command(cancellationKey(requestId), { requestId, expectedVersion }),
    );
    const callable = httpsCallable(this.functions, 'cancelRentalRequest');
    const response = await callable(parsed);
    return parseCallableResult(cancelRentalRequestResultSchema, response.data, 'cancelRentalRequest');
  }

  async releasePaymentHold(requestId: string): Promise<ReleaseRentalRequestPaymentHoldResult> {
    const parsed = releaseRentalRequestPaymentHoldCommandSchema.parse(
      command(`release_rental_request_${requestId.replace(/[^A-Za-z0-9_-]/g, '_')}`, { requestId }),
    );
    const callable = httpsCallable(this.functions, 'releaseRentalRequestPaymentHold');
    const response = await callable(parsed);
    return parseCallableResult(
      releaseRentalRequestPaymentHoldResultSchema,
      response.data,
      'releaseRentalRequestPaymentHold',
    );
  }
}

export function createRentalRequestGateway(): RentalRequestGateway {
  return new NativeRentalRequestGateway();
}
