# ADR 0002: Server-authoritative integer-kobo pricing

- Status: Accepted
- Date: 2026-08-16

## Context

The architecture requires all money to be calculated server-side using integer kobo. A client-side preview existed that hardcoded 8% service fee without a fixed-fee component and used `Math.round` directly instead of the server's basis-point rounding.

## Decision

- All monetary amounts are integer kobo (`number`, safe integer, non-negative).
- Percentage fields use basis points (1,500 = 15%).
- `calculateAuthoritativePrice` in `@mmg/domain` is the single canonical pricing path.
- Client preview uses `calculateBookingQuote`, which delegates to `calculateAuthoritativePrice` with `DEFAULT_SERVICE_FEE_BPS`, `DEFAULT_SERVICE_FEE_FIXED_KOBO`, and `DEFAULT_OWNER_COMMISSION_BPS`.
- `roundBasisPointsHalfUp` rounds to nearest kobo, ties up.
- The server re-validates price before any payment; the client never submits a trusted total.
- Fee inputs are read from versioned `systemConfig/booking` at booking time and snapshotted immutably.

## Consequences

- Parity tests prove `calculateBookingQuote` and `calculateAuthoritativePrice` produce identical outputs for identical inputs.
- Changing fee values in system config does not retroactively affect existing bookings.