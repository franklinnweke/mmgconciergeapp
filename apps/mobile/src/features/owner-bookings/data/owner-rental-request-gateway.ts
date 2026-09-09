import {
  approveRentalRequestCommandSchema,
  approveRentalRequestResultSchema,
  declineRentalRequestCommandSchema,
  declineRentalRequestResultSchema,
  type ApproveRentalRequestResult,
  type DeclineRentalRequestResult,
} from '@mmg/contracts/rental-request';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '@/core/firebase/parse-callable-result';

export class OwnerRentalRequestGateway {
  private get functions() { return getFunctions(undefined, 'africa-south1'); }

  async approve(requestId: string, expectedVersion: number): Promise<ApproveRentalRequestResult> {
    const safe = requestId.replace(/[^A-Za-z0-9_-]/g, '_');
    const command = approveRentalRequestCommandSchema.parse({
      schemaVersion: 1, idempotencyKey: `approve_${safe}_${expectedVersion}`, data: { requestId, expectedVersion },
    });
    const response = await httpsCallable(this.functions, 'approveRentalRequest')(command);
    return parseCallableResult(approveRentalRequestResultSchema, response.data, 'approveRentalRequest');
  }

  async decline(requestId: string, expectedVersion: number): Promise<DeclineRentalRequestResult> {
    const safe = requestId.replace(/[^A-Za-z0-9_-]/g, '_');
    const command = declineRentalRequestCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: `decline_${safe}_${expectedVersion}`,
      data: { requestId, expectedVersion, reason: 'Owner declined request' },
    });
    const response = await httpsCallable(this.functions, 'declineRentalRequest')(command);
    return parseCallableResult(declineRentalRequestResultSchema, response.data, 'declineRentalRequest');
  }
}
