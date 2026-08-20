import { afterEach, describe, expect, it } from "vitest";
import { WebOwnerBookingRepository } from "./owner-booking-repository.web";
import type { OwnerBookingSnapshot } from "./owner-booking-repository";

const originalNodeEnv = process.env.NODE_ENV;
afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("WebOwnerBookingRepository", () => {
  it("uses visibly sample fixture mode only in development", () => {
    process.env.NODE_ENV = "development";
    let received: OwnerBookingSnapshot | undefined;
    new WebOwnerBookingRepository().subscribe(
      "owner-1",
      (snapshot) => {
        received = snapshot;
      },
      () => undefined,
    );
    expect(received).toBeDefined();
    expect(received!.source).toBe("development_fixture");
    expect(received!.bookings).toHaveLength(1);
  });
  it("fails closed in production without fixture records", () => {
    process.env.NODE_ENV = "production";
    let received: OwnerBookingSnapshot | undefined;
    let error: Error | undefined;
    new WebOwnerBookingRepository().subscribe(
      "owner-1",
      (snapshot) => {
        received = snapshot;
      },
      (caught) => {
        error = caught;
      },
    );
    expect(received).toMatchObject({ source: "unavailable", bookings: [] });
    expect(error).toBeInstanceOf(Error);
  });
});
