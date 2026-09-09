import {
  createBookingIntentCommandSchema,
  createBookingIntentResultSchema,
  releaseBookingHoldCommandSchema,
  releaseBookingHoldResultSchema,
  type CreateBookingIntentData,
  type CreateBookingIntentResult,
  type ReleaseBookingHoldResult,
} from '@mmg/contracts';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import type { BookingIntentGateway } from './booking-intent-gateway-core';

export { BookingIntentSubmissionKey } from './booking-intent-gateway-core';
export type { BookingIntentGateway } from './booking-intent-gateway-core';

export class WebBookingIntentGateway implements BookingIntentGateway {
  constructor(private readonly customFunctions?: Functions) {}

  private get functions(): Functions {
    return this.customFunctions ?? getFunctions(undefined, 'africa-south1');
  }

  async createIntent(
    data: CreateBookingIntentData,
    idempotencyKey: string,
  ): Promise<CreateBookingIntentResult> {
    const command = createBookingIntentCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey,
      data,
    });
    const callable = httpsCallable(this.functions, 'createBookingIntent');
    const response = await callable(command);
    return parseCallableResult(
      createBookingIntentResultSchema,
      response.data,
      'createBookingIntent',
    );
  }

  async releaseHold(intentId: string): Promise<ReleaseBookingHoldResult> {
    const command = releaseBookingHoldCommandSchema.parse({
      schemaVersion: 1,
      idempotencyKey: `release_${intentId.replace(/[^A-Za-z0-9_-]/g, '_')}`,
      data: { intentId },
    });
    const callable = httpsCallable(this.functions, 'releaseBookingHold');
    const response = await callable(command);
    return parseCallableResult(
      releaseBookingHoldResultSchema,
      response.data,
      'releaseBookingHold',
    );
  }
}

export function createBookingIntentGateway(): BookingIntentGateway {
  return new WebBookingIntentGateway();
}
