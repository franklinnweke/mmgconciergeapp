import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeOwnerBookingGateway } from "./owner-booking-gateway";

const mocks = vi.hoisted(() => ({
  getFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));
vi.mock("@react-native-firebase/functions", () => mocks);

describe("NativeOwnerBookingGateway", () => {
  beforeEach(() => vi.clearAllMocks());
  it("targets africa-south1 and validates the command and response", async () => {
    mocks.getFunctions.mockReturnValue("functions");
    const callable = vi.fn(async (_command: unknown) => ({
      data: {
        requestId: "req-1",
        result: {
          bookingId: "booking-1",
          fromState: "paid_pending_owner",
          toState: "confirmed",
          decidedAt: "2026-09-01T00:00:00.000Z",
          version: 2,
        },
      },
    }));
    mocks.httpsCallable.mockReturnValue(callable);
    const result = await new NativeOwnerBookingGateway().confirm(
      "booking-1",
      1,
      "confirm-key-000001",
    );
    expect(mocks.getFunctions).toHaveBeenCalledWith(undefined, "africa-south1");
    expect(mocks.httpsCallable).toHaveBeenCalledWith(
      "functions",
      "confirmBooking",
    );
    expect(result.result.toState).toBe("confirmed");
    expect(callable).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: 1,
        idempotencyKey: "confirm-key-000001",
      }),
    );
  });
  it("rejects malformed input before invoking the callable", async () => {
    mocks.getFunctions.mockReturnValue("functions");
    const callable = vi.fn();
    mocks.httpsCallable.mockReturnValue(callable);
    await expect(
      new NativeOwnerBookingGateway().reject(
        "booking-1",
        1,
        "short",
        "reject-key-000001",
      ),
    ).rejects.toThrow();
    expect(callable).not.toHaveBeenCalled();
  });
});
