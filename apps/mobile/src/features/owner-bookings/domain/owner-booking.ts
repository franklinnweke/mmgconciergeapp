import {
  ownerVisibleBookingSchema,
  type OwnerVisibleBooking,
  type PaidBookingState,
} from "@mmg/contracts";

export type OwnerBookingGroup =
  "AWAITING YOU" | "CONFIRMED" | "NEEDS ATTENTION" | "OTHER";

export function groupOwnerBooking(state: PaidBookingState): OwnerBookingGroup {
  if (state === "paid_pending_owner") return "AWAITING YOU";
  if (state === "confirmed") return "CONFIRMED";
  if (state === "intervention_required") return "NEEDS ATTENTION";
  return "OTHER";
}

export function canOwnerRespond(booking: OwnerVisibleBooking): boolean {
  return booking.state === "paid_pending_owner";
}

export function parseOwnerBooking(
  id: string,
  value: unknown,
  ownerId: string,
): OwnerVisibleBooking | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  // The query is owner-scoped, but keep this check before parsing so a malformed
  // or accidentally broad query cannot leak another owner's record to UI state.
  if (data.ownerId !== ownerId) return null;
  const vehicle = data.vehicleSnapshot;
  const price = data.priceSnapshot;
  if (
    !vehicle ||
    typeof vehicle !== "object" ||
    !price ||
    typeof price !== "object"
  )
    return null;
  const vehicleData = vehicle as Record<string, unknown>;
  const priceData = price as Record<string, unknown>;
  // Project first, then strict-parse. Raw booking documents may contain
  // renter/payment/provider fields, but none are allowed into this DTO.
  const parsed = ownerVisibleBookingSchema.safeParse({
    id,
    vehicleId: data.vehicleId,
    startDate: data.startDate,
    endDate: data.endDate,
    state: data.state,
    version: data.version,
    vehicleSnapshot: {
      displayName: vehicleData.displayName,
      areaLabel: vehicleData.areaLabel,
      categoryLabel: vehicleData.categoryLabel,
      ...(vehicleData.imageKey !== undefined
        ? { imageKey: vehicleData.imageKey }
        : {}),
      ...(vehicleData.imageUrl !== undefined
        ? { imageUrl: vehicleData.imageUrl }
        : {}),
    },
    priceSnapshot: {
      currency: priceData.currency,
      ownerDailyRateKobo: priceData.ownerDailyRateKobo,
      baseRentalKobo: priceData.baseRentalKobo,
      ownerCommissionBps: priceData.ownerCommissionBps,
      ownerEarningsKobo: priceData.ownerEarningsKobo,
    },
  });
  return parsed.success ? parsed.data : null;
}

export function isDeclineReasonValid(reason: string): boolean {
  const length = reason.trim().length;
  return length >= 10 && length <= 500;
}

export function hasReachedExpectedState(
  booking: OwnerVisibleBooking | null,
  expected: { state: "confirmed" | "intervention_required"; version: number },
): boolean {
  return (
    booking?.state === expected.state && booking.version >= expected.version
  );
}

export function groupOwnerBookings(bookings: readonly OwnerVisibleBooking[]) {
  return {
    awaiting: bookings.filter(
      (booking) => groupOwnerBooking(booking.state) === "AWAITING YOU",
    ),
    confirmed: bookings.filter(
      (booking) => groupOwnerBooking(booking.state) === "CONFIRMED",
    ),
    attention: bookings.filter(
      (booking) => groupOwnerBooking(booking.state) === "NEEDS ATTENTION",
    ),
    other: bookings.filter(
      (booking) => groupOwnerBooking(booking.state) === "OTHER",
    ),
  };
}
