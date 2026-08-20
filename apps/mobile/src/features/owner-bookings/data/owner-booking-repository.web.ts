import type { OwnerVisibleBooking } from "@mmg/contracts";
import type { OwnerBookingRepository } from "./owner-booking-repository";

const previewBookings: OwnerVisibleBooking[] = [
  {
    id: "preview-owner-booking-1",
    vehicleId: "preview-prado-pearl",
    startDate: "2026-09-10",
    endDate: "2026-09-13",
    state: "paid_pending_owner",
    version: 1,
    vehicleSnapshot: {
      displayName: "Prado Pearl",
      areaLabel: "Ikoyi",
      categoryLabel: "Executive Prado SUV",
      imageKey: "pearl-suv",
    },
    priceSnapshot: {
      currency: "NGN",
      ownerDailyRateKobo: 25000000,
      baseRentalKobo: 75000000,
      ownerCommissionBps: 1500,
      ownerEarningsKobo: 63750000,
    },
  },
];

export class WebOwnerBookingRepository implements OwnerBookingRepository {
  subscribe(
    ownerId: string,
    onSnapshot: Parameters<OwnerBookingRepository["subscribe"]>[1],
    onError: Parameters<OwnerBookingRepository["subscribe"]>[2],
  ) {
    if (process.env.NODE_ENV === "production") {
      onSnapshot({
        bookings: [],
        skippedInvalidCount: 0,
        source: "unavailable",
      });
      onError(
        new Error("Owner booking records are unavailable in this web release."),
      );
      return () => undefined;
    }
    onSnapshot({
      bookings: previewBookings,
      skippedInvalidCount: 0,
      source: "development_fixture",
    });
    return () => undefined;
  }
}

export const createOwnerBookingRepository = (): OwnerBookingRepository =>
  new WebOwnerBookingRepository();
