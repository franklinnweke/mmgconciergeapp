import { cancelUnpaidBookingIntentCommandSchema, cancelUnpaidBookingIntentResultSchema } from '@mmg/contracts/cancellation';
import { getFunctions, httpsCallable } from '@react-native-firebase/functions';
import { randomUUID } from 'expo-crypto';

import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

const keys = new Map<string, string>();

export async function cancelUnpaidHold(intentId: string) {
  const key = keys.get(intentId) ?? `cancel_unpaid_hold_${randomUUID()}`;
  keys.set(intentId, key);
  const command = cancelUnpaidBookingIntentCommandSchema.parse({ schemaVersion: 1, idempotencyKey: key, data: { intentId } });
  const response = await httpsCallable(getFunctions(undefined, 'africa-south1'), 'cancelUnpaidBookingIntent')(command);
  const result = parseCallableResult(cancelUnpaidBookingIntentResultSchema, response.data, 'cancelUnpaidBookingIntent');
  if (result.result.intentId !== intentId) throw new Error('Cancellation result does not match these held dates.');
  return result;
}
