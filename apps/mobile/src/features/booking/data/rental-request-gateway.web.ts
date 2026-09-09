import {
  createRentalRequestCommandSchema,
  createRentalRequestResultSchema,
  releaseRentalRequestPaymentHoldCommandSchema,
  releaseRentalRequestPaymentHoldResultSchema,
  renterVisibleRentalRequestSchema,
  type CreateRentalRequestData,
  type CreateRentalRequestResult,
  type ReleaseRentalRequestPaymentHoldResult,
  type RenterVisibleRentalRequest,
} from '@mmg/contracts/rental-request';
import { doc, getDoc, getFirestore } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';
import type { RentalRequestGateway } from './rental-request-gateway-core';

export { RentalRequestSubmissionKey } from './rental-request-gateway-core';
export type { RentalRequestGateway } from './rental-request-gateway-core';

function iso(value: unknown): string | undefined {
  if (typeof value === 'string') return new Date(value).toISOString();
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { toDate?: () => Date };
  return typeof candidate.toDate === 'function' ? candidate.toDate().toISOString() : undefined;
}

export class WebRentalRequestGateway implements RentalRequestGateway {
  private get functions() { return getFunctions(undefined, 'africa-south1'); }

  async createRequest(data: CreateRentalRequestData, idempotencyKey: string): Promise<CreateRentalRequestResult> {
    const command = createRentalRequestCommandSchema.parse({ schemaVersion: 1, idempotencyKey, data });
    const response = await httpsCallable(this.functions, 'createRentalRequest')(command);
    return parseCallableResult(createRentalRequestResultSchema, response.data, 'createRentalRequest');
  }

  async getRequest(requestId: string): Promise<RenterVisibleRentalRequest | null> {
    const snapshot = await getDoc(doc(getFirestore(), 'rentalRequests', requestId));
    if (!snapshot.exists()) return null;
    const raw = snapshot.data() as Record<string, unknown>;
    const parsed = renterVisibleRentalRequestSchema.safeParse({
      ...raw,
      requestId: typeof raw.requestId === 'string' ? raw.requestId : snapshot.id,
      createdAt: iso(raw.createdAt), updatedAt: iso(raw.updatedAt),
      ...(raw.holdExpiresAt === undefined ? {} : { holdExpiresAt: iso(raw.holdExpiresAt) }),
    });
    return parsed.success ? parsed.data : null;
  }

  async releasePaymentHold(requestId: string): Promise<ReleaseRentalRequestPaymentHoldResult> {
    const safe = requestId.replace(/[^A-Za-z0-9_-]/g, '_');
    const command = releaseRentalRequestPaymentHoldCommandSchema.parse({
      schemaVersion: 1, idempotencyKey: `release_request_${safe}`, data: { requestId },
    });
    const response = await httpsCallable(this.functions, 'releaseRentalRequestPaymentHold')(command);
    return parseCallableResult(releaseRentalRequestPaymentHoldResultSchema, response.data, 'releaseRentalRequestPaymentHold');
  }
}

export function createRentalRequestGateway(): RentalRequestGateway { return new WebRentalRequestGateway(); }
