import { describe, expect, it } from "vitest";
import { WebOwnerBookingGateway } from "./owner-booking-gateway.web";

describe("WebOwnerBookingGateway", () => {
  it("fails closed for fixture actions in development", async () => {
    await expect(
      new WebOwnerBookingGateway().confirm("booking-1", 1, "key-1"),
    ).rejects.toThrow("Sample bookings do not change live data");
    await expect(
      new WebOwnerBookingGateway().reject(
        "booking-1",
        1,
        "A valid decline reason",
        "key-2",
      ),
    ).rejects.toThrow("Sample bookings do not change live data");
  });
});
