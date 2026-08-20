import { describe, expect, it } from "vitest";

import {
  canOwnerRespond,
  groupOwnerBooking,
  hasReachedExpectedState,
  isDeclineReasonValid,
  parseOwnerBooking,
} from "./owner-booking";

const booking = (extra: Record<string, unknown> = {}) => ({
  ownerId: "owner-1",
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
    ownerCommissionBps: 1500,
    ownerEarningsKobo: 42500000,
  },
  ...extra,
});

describe("owner booking projection", () => {
  it("rejects another owner and private/payment fields", () => {
    expect(parseOwnerBooking("b1", booking(), "owner-2")).toBeNull();
    const projected = parseOwnerBooking(
      "b1",
      {
        ...booking(),
        renterId: "renter-secret",
        paymentReference: "secret",
        blockId: "block-secret",
      },
      "owner-1",
    );
    expect(projected).not.toBeNull();
    expect(projected).not.toHaveProperty("renterId");
    expect(projected).not.toHaveProperty("paymentReference");
    expect(projected).not.toHaveProperty("blockId");
    expect(projected).not.toHaveProperty("ownerId");
  });
  it("groups trusted states and gates actions", () => {
    const pending = parseOwnerBooking("b1", booking(), "owner-1")!;
    const confirmed = parseOwnerBooking(
      "b2",
      booking({ state: "confirmed" }),
      "owner-1",
    )!;
    expect(groupOwnerBooking(pending.state)).toBe("AWAITING YOU");
    expect(groupOwnerBooking(confirmed.state)).toBe("CONFIRMED");
    expect(canOwnerRespond(pending)).toBe(true);
    expect(canOwnerRespond(confirmed)).toBe(false);
  });
  it("enforces decline reason and authoritative state acknowledgement boundaries", () => {
    const pending = parseOwnerBooking("b1", booking(), "owner-1")!;
    expect(isDeclineReasonValid("short")).toBe(false);
    expect(isDeclineReasonValid("ten chars!")).toBe(true);
    expect(isDeclineReasonValid("x".repeat(500))).toBe(true);
    expect(isDeclineReasonValid("x".repeat(501))).toBe(false);
    expect(
      hasReachedExpectedState(pending, { state: "confirmed", version: 3 }),
    ).toBe(false);
    expect(
      hasReachedExpectedState(
        { ...pending, state: "confirmed", version: 3 },
        { state: "confirmed", version: 3 },
      ),
    ).toBe(true);
  });
});
