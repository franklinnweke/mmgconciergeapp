import { describe, expect, it, vi, beforeEach } from "vitest";
import { NativeOwnerBookingRepository } from "./owner-booking-repository";

const mocks = vi.hoisted(() => ({
  collection: vi.fn(() => "bookings-ref"),
  getFirestore: vi.fn(() => "db"),
  query: vi.fn((...args: unknown[]) => args),
  where: vi.fn((...args: unknown[]) => args),
  onSnapshot: vi.fn(),
}));

vi.mock("@react-native-firebase/firestore", () => mocks);

const valid = (ownerId = "owner-1") => ({
  ownerId,
  vehicleId: "vehicle-1",
  startDate: "2026-09-01",
  endDate: "2026-09-03",
  state: "paid_pending_owner",
  version: 2,
  vehicleSnapshot: {
    displayName: "Prado Pearl",
    areaLabel: "Ikoyi",
    categoryLabel: "Executive Prado SUV",
    imageKey: "pearl-suv",
  },
  priceSnapshot: {
    currency: "NGN",
    ownerDailyRateKobo: 25000000,
    baseRentalKobo: 50000000,
    deliveryFeeKobo: 0,
    serviceFeeBps: 800,
    serviceFeeFixedKobo: 0,
    serviceFeeKobo: 4000000,
    ownerCommissionBps: 1500,
    ownerCommissionKobo: 7500000,
    ownerEarningsKobo: 42500000,
    renterTotalKobo: 54000000,
    configVersion: "v1",
    termsVersion: "v1",
    cancellationPolicyVersion: "v1",
  },
});

describe("NativeOwnerBookingRepository", () => {
  beforeEach(() => vi.clearAllMocks());
  it("queries only the authenticated owner and skips malformed records", () => {
    let emit:
      | ((snapshot: {
          forEach: (
            callback: (doc: { id: string; data: () => unknown }) => void,
          ) => void;
        }) => void)
      | undefined;
    mocks.onSnapshot.mockImplementation(
      (_query: unknown, callback: typeof emit) => {
        emit = callback;
        return () => undefined;
      },
    );
    const updates: unknown[] = [];
    new NativeOwnerBookingRepository().subscribe(
      "owner-1",
      (snapshot) => updates.push(snapshot),
      vi.fn(),
    );
    expect(mocks.where).toHaveBeenCalledWith("ownerId", "==", "owner-1");
    emit!({
      forEach: (callback) => {
        callback({ id: "good", data: () => valid() });
        callback({ id: "bad", data: () => ({ ownerId: "owner-1" }) });
        callback({ id: "other", data: () => valid("owner-2") });
      },
    });
    expect(updates).toEqual([
      {
        bookings: [expect.objectContaining({ id: "good" })],
        skippedInvalidCount: 2,
        source: "live",
      },
    ]);
  });
  it("forwards provider errors without fabricating an empty success", () => {
    let providerError: ((error: Error) => void) | undefined;
    mocks.onSnapshot.mockImplementation(
      (_query: unknown, _success: unknown, error: typeof providerError) => {
        providerError = error;
        return () => undefined;
      },
    );
    const errors: Error[] = [];
    new NativeOwnerBookingRepository().subscribe("owner-1", vi.fn(), (error) =>
      errors.push(error),
    );
    providerError!(new Error("provider unavailable"));
    expect(errors[0]?.message).toBe("provider unavailable");
  });
});
