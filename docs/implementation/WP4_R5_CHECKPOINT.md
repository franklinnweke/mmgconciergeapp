# WP4 R5 Owner Response and Intervention Checkpoint

**Branch:** `codex/wp4-paystack-booking-reconciliation`  
**Validated base:** R4 at `edd5a485e0f2b447df5ffddfcde388c1a9e83dd2`  
**Date:** 2026-09-01  
**Status:** Implemented, awaiting exact clean-head validation

## Objective

Reconcile the existing Sequence 3 owner-response foundation with trusted R4 paid bookings, add the architecture-defined owner-response SLA operations signal, and provide one bounded non-financial intervention action without inventing cancellation/refund/reassignment policy.

R5 does not deploy Functions, configure Paystack, call a real provider, implement FCM delivery, initiate refunds, select replacement vehicles, collect top-ups, or mutate production.

## Preserved R5 commits

The R5 implementation is intentionally split into meaningful commits:

1. `e130994` — `fix(booking): harden owner response availability integrity`
2. `0aa7b2d` — `feat(booking): add owner response SLA operations alerts`
3. `b591972` — `feat(booking): add audited intervention sourcing command`
4. Final documentation/handoff commit containing this checkpoint

Temporary connector/WIP commits are not part of the published branch history.

## R5 boundary 1: owner response integrity

A trusted R4 `paid_pending_owner` booking may be confirmed/rejected only when:

- its referenced booking block exists;
- the block state is exactly `paid`;
- block `bookingId`, `intentId`, `renterId`, `ownerId`, `vehicleId`, `startDate`, and `endDate` exactly match the booking;
- `vehicleAvailability/{vehicleId}` already exists;
- its availability version is a safe nonnegative integer;
- optimistic booking version matches the command.

Failure is closed and atomic. Missing/mismatched block or missing/malformed sentinel cannot partially update booking, block, case, audit, outbox, or sentinel state.

Confirmation:

```text
paid_pending_owner booking
+ exact paid block
+ valid sentinel
  -> booking confirmed
  -> paid block confirmed
  -> sentinel +1
  -> one audit event
  -> one outbox event
```

Owner rejection:

```text
paid_pending_owner booking
+ exact paid block
+ valid sentinel
+ required owner reason
  -> intervention_required
  -> paid block deleted / dates released
  -> sentinel +1
  -> owner_rejection case open
  -> audit evidence
  -> renter/admin outbox signal
```

No refund state is created by owner rejection.

## R5 boundary 2: owner response SLA signal

Architecture source of truth:

- configurable private `ownerResponseSlaMinutes`;
- default 30 minutes;
- scheduled scan every 5 minutes;
- exceeding SLA creates an admin/operations alert only;
- it never automatically rejects, cancels, refunds, releases dates, or changes booking state.

Implementation:

- reads `systemConfig/private.ownerResponseSlaMinutes` when present;
- uses 30 only when that config field is absent;
- a present malformed/non-positive/non-integer value fails closed;
- scans `paid_pending_owner` bookings;
- transactionally rechecks state and age before recording an alert;
- creates deterministic `notificationOutbox/owner-response-sla-{bookingId}`;
- creates one audit event;
- writes `ownerResponseSlaAlertedAt` / `ownerResponseSlaMinutes` metadata only;
- repeat scans are no-ops;
- a booking that was confirmed/rejected before the transaction recheck is a no-op;
- scheduled export is `emitOwnerResponseSlaAlerts` in `europe-west1` with `Africa/Lagos` time zone.

FCM/admin delivery is not implemented in WP4, so the durable outbox signal is recorded as unavailable rather than claiming delivery.

## R5 boundary 3: bounded intervention sourcing

The architecture describes `resolveBookingCase` as an Operations admin responsibility but the canonical claim set has no `operations_admin` or `booking_admin`.

R5 maps this **non-financial** responsibility to:

- `support`
- `super_admin`

It explicitly does not grant this command to `finance_admin`, `vehicle_admin`, `verification_admin`, or `privacy_admin`.

The only implemented intervention command is:

```text
startBookingCaseSourcing
open -> sourcing_alternative
```

The shared contract accepts only:

- case ID
- expected case version
- normal command schema/idempotency envelope

The command cannot accept:

- refund amount/state
- Paystack reference
- alternative vehicle
- price difference
- top-up
- renter acceptance
- reassignment
- case closure
- booking/payment/block target state

The transition is idempotent and atomically writes:

- case `status = sourcing_alternative`
- case version +1
- actor/action metadata
- domain `auditEvents` evidence
- append-only `adminAuditLogs` evidence
- idempotency record

It works for both `owner_rejection` and `paid_conflict` open cases and does not touch payment/refund/booking/block economics.

## Explicitly not implemented in R5

Do not treat these as implied by the sourcing command:

- alternative vehicle selection or locking;
- `sourcing_alternative -> awaiting_renter`;
- renter acceptance;
- `intervention_required -> confirmed` reassignment;
- lower-price difference refund/credit;
- higher-price top-up;
- full/partial Paystack refund;
- `refund_pending -> refunded`;
- `closed_no_action`;
- automatic owner timeout/rejection/cancellation.

Those operations remain bounded by the architecture's explicit availability, renter-acceptance and financial rules and require separate implementation/validation.

## Required validation gate

Use Java 21+. Temurin 25 is known-good.

Run from a clean clone at the exact published R5 checkpoint:

```bash
npm run functions:typecheck
npm run functions:build
npm run functions:test
npm run test:functions:emulator
npm test
npm run typecheck
npm run lint
npm run admin:typecheck
npm run admin:lint
npm run admin:test
npm run check
npm run test:rules
npm run test:storage-rules
git diff --check
```

Do not deploy anything during this gate.

## Focused R5 evidence to report

Confirm these suites and exact counts:

- `paid-booking-response-service.test.ts`
- `firestore-paid-booking-response-repository.emulator.test.ts`
- `owner-response-sla-service.test.ts`
- `firestore-owner-response-sla-repository.emulator.test.ts`
- `booking-case.test.ts`
- `callable-auth.test.ts`
- `booking-case-sourcing-service.test.ts`
- `firestore-booking-case-sourcing-repository.emulator.test.ts`

Also confirm:

1. Existing R4 owner-confirm and owner-reject compatibility remains green.
2. Missing paid block fails closed with zero partial effects.
3. Mismatched paid block fails closed.
4. Missing/malformed sentinel fails closed with zero partial effects.
5. Owner rejection still releases the block and creates intervention with no refund state.
6. SLA default is 30 minutes when config is absent.
7. Explicit private SLA configuration is honored.
8. Invalid configured SLA fails closed.
9. SLA repeat scan emits one outbox/audit effect only.
10. SLA alert does not change booking/payment/block state.
11. No automatic owner timeout transition exists anywhere in R5.
12. Only support/super_admin receive booking operations authorization.
13. Finance/vehicle/verification/privacy claims do not inherit sourcing authority.
14. Case sourcing accepts only `open -> sourcing_alternative`.
15. Sourcing is idempotent and writes both domain/admin audit evidence exactly once.
16. Paid-conflict sourcing creates no refund/payment mutation.
17. Client input cannot smuggle refund/alternative/top-up/confirmation fields.
18. No deployment, secret configuration, real Paystack request, live payment, or production access occurs.

## Exit decision

R5 is green only after the exact clean publication head passes the full gate above.

A green R5 does **not** mean complete intervention resolution/refund workflows are implemented. It means the owner response boundary, SLA alerting, and policy-neutral start-sourcing operation are reconciled safely with R4 and ready for the next bounded slice.
