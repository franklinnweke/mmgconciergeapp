import {
  approveRentalRequestCommandSchema,
  approveRentalRequestResultSchema,
  declineRentalRequestCommandSchema,
  declineRentalRequestResultSchema,
  listOwnerRentalRequestsCommandSchema,
  listOwnerRentalRequestsResultSchema,
  type ApproveRentalRequestResult,
  type DeclineRentalRequestResult,
  type ListOwnerRentalRequestsResult,
} from '@mmg/contracts/rental-request';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

export type OwnerRentalRequestGateway = {
  listRequests(): Promise<ListOwnerRentalRequestsResult>;
  approve(requestId: string, expectedVersion: number): Promise<ApproveRentalRequestResult>;
  decline(requestId: string, expectedVersion: number, reason?: string): Promise<DeclineRentalRequestResult>;
};

export class NativeOwnerRentalRequestGateway implements OwnerRentalRequestGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
  }

  async listRequests(): Promise<ListOwnerRentalRequestsResult> {
    const command = listOwnerRentalRequestsCommandSchema.parse({
      schemaVersion: 1,
    });
    const callable = httpsCallable(this.functions, 'listOwnerRentalRequests');
    const response = await callable(command);
    return parseCallableResult(
      listOwnerRentalRequestsResultSchema,
      response.data,
      'listOwnerRentalRequests',
    );
  }

  async approve(requestId: string, expectedVersion: number): Promise<ApproveRentalRequestResult> {
    const safeKey = requestId.replace(/[^A-Za-z0-9_-]/g, '_');
    const command = approveRentalRequestCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: `owner_approve_${safeKey}_v${expectedVersion}`,
      data: { requestId, expectedVersion },
    });
    const callable = httpsCallable(this.functions, 'approveRentalRequest');
    const response = await callable(command);
    return parseCallableResult(
      approveRentalRequestResultSchema,
      response.data,
      'approveRentalRequest',
    );
  }

  async decline(requestId: string, expectedVersion: number, reason?: string): Promise<DeclineRentalRequestResult> {
    const safeKey = requestId.replace(/[^A-Za-z0-9_-]/g, '_');
    const command = declineRentalRequestCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: `owner_decline_${safeKey}_v${expectedVersion}`,
      data: { requestId, expectedVersion, reason: reason ?? 'Vehicle unavailable for requested dates' },
    });
    const callable = httpsCallable(this.functions, 'declineRentalRequest');
    const response = await callable(command);
    return parseCallableResult(
      declineRentalRequestResultSchema,
      response.data,
      'declineRentalRequest',
    );
  }
}

export function createOwnerRentalRequestGateway(): OwnerRentalRequestGateway {
  return new NativeOwnerRentalRequestGateway();
}
