import {
  createBookingIntentCommandSchema,
  createBookingIntentResultSchema,
  type CreateBookingIntentData,
  type CreateBookingIntentResult,
} from '@mmg/contracts';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

import type { BookingIntentGateway } from './booking-intent-gateway-core';

export { BookingIntentSubmissionKey } from './booking-intent-gateway-core';
export type { BookingIntentGateway } from './booking-intent-gateway-core';

export class NativeBookingIntentGateway implements BookingIntentGateway {
  private get functions() {
    return getFunctions(undefined, 'africa-south1');
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
}

export function createBookingIntentGateway(): BookingIntentGateway {
  return new NativeBookingIntentGateway();
}
