import {
  confirmBookingResultSchema,
  confirmBookingCommandSchema,
  rejectBookingCommandSchema,
  rejectBookingResultSchema,
  type ConfirmBookingResult,
  type RejectBookingResult,
} from "@mmg/contracts";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";

import { parseCallableResult } from "../../../core/firebase/parse-callable-result";

export type OwnerBookingGateway = {
  confirm(
    bookingId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ): Promise<ConfirmBookingResult>;
  reject(
    bookingId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<RejectBookingResult>;
};

function command(idempotencyKey: string, data: Record<string, unknown>) {
  return { schemaVersion: 1, idempotencyKey, data };
}

export class NativeOwnerBookingGateway implements OwnerBookingGateway {
  private get functions() {
    return getFunctions(undefined, "africa-south1");
  }

  async confirm(
    bookingId: string,
    expectedVersion: number,
    idempotencyKey: string,
  ) {
    const callable = httpsCallable(this.functions, "confirmBooking");
    const response = await callable(
      confirmBookingCommandSchema.parse(
        command(idempotencyKey, { bookingId, expectedVersion }),
      ),
    );
    return parseCallableResult(
      confirmBookingResultSchema,
      response.data,
      "confirmBooking",
    );
  }

  async reject(
    bookingId: string,
    expectedVersion: number,
    reason: string,
    idempotencyKey: string,
  ) {
    const callable = httpsCallable(this.functions, "rejectBooking");
    const response = await callable(
      rejectBookingCommandSchema.parse(
        command(idempotencyKey, { bookingId, expectedVersion, reason }),
      ),
    );
    return parseCallableResult(
      rejectBookingResultSchema,
      response.data,
      "rejectBooking",
    );
  }
}

export const createOwnerBookingGateway = (): OwnerBookingGateway =>
  new NativeOwnerBookingGateway();
