import {
  confirmBookingCompletionCommandSchema,
  confirmBookingCompletionEnvelopeSchema,
  type ConfirmBookingCompletionResult,
} from '@mmg/contracts/earnings';
import { parseCallableResult } from '../../../core/firebase/parse-callable-result';

export interface RenterCompletionGateway {
  confirmCompletion(bookingId: string): Promise<ConfirmBookingCompletionResult>;
}

/** One command key per booking for retries, including an ambiguous network result. */
export function createCompletionGateway(
  invoke: (command: unknown) => Promise<unknown>,
  createKey = () => `trip_complete_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`,
): RenterCompletionGateway {
  const keys = new Map<string, string>();
  return {
    async confirmCompletion(bookingId) {
      const key = keys.get(bookingId) ?? createKey();
      const command = confirmBookingCompletionCommandSchema.parse({
        schemaVersion: 1, idempotencyKey: key, data: { bookingId },
      });
      keys.set(bookingId, key);
      const envelope = parseCallableResult(
        confirmBookingCompletionEnvelopeSchema, await invoke(command), 'confirmBookingCompletion',
      );
      if (envelope.result.bookingId !== command.data.bookingId) {
        throw new Error('Trip completion returned a different booking. Refresh Trips before continuing.');
      }
      return envelope.result;
    },
  };
}
