import {
  type ConfirmBookingResult,
  type RejectBookingResult,
} from "@mmg/contracts";
import type { OwnerBookingGateway } from "./owner-booking-gateway";

export class WebOwnerBookingGateway implements OwnerBookingGateway {
  private unavailable(): never {
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "Booking actions are unavailable in this web release."
        : "Sample bookings do not change live data. Use a native build for live owner actions.",
    );
  }
  async confirm(
    _bookingId: string,
    _expectedVersion: number,
    _idempotencyKey: string,
  ): Promise<ConfirmBookingResult> {
    return this.unavailable();
  }
  async reject(
    _bookingId: string,
    _expectedVersion: number,
    _reason: string,
    _idempotencyKey: string,
  ): Promise<RejectBookingResult> {
    return this.unavailable();
  }
}

export const createOwnerBookingGateway = (): OwnerBookingGateway =>
  new WebOwnerBookingGateway();
