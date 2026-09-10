# WP4 Paystack and Trusted Booking Reconciliation Sprint

**Branch:** `codex/wp4-paystack-booking-reconciliation`  
**Base:** `main` at `87ad89e`  
**Date:** 2026-08-31  
**Status:** Historical pay-first compatibility reference; superseded for new Build 30 request-first work by `AGENTS.md`.
**Donor branch:** `codex/wp4-booking-operations` at `7c698db` is reference-only and must not be merged or cherry-picked wholesale.

## 1. Sprint objective

Complete the payment-first booking path from an already-created, server-priced booking intent through Paystack sandbox payment verification to a trusted `paid_pending_owner` booking, while preserving the current availability/owner-response foundation and the final architecture invariants.

The sprint does **not** make production Paystack live. Development integration targets `mmg-concierge-dev` and Paystack test mode only. Production `mmg-concierge` and live Paystack keys are out of scope unless separately authorized.

## 2. Source-of-truth invariants

1. The renter pays before the owner is notified.
2. Booking intervals are date-only `Africa/Lagos` half-open `[startDate, endDate)` ranges.
3. All trusted money is integer NGN kobo and server-authoritative.
4. A checkout hold blocks the full requested interval atomically.
5. Paystack initialization happens server-side and returns hosted checkout data to the client.
6. Client callback/deep-link return is UX only and never creates value.
7. Successful payment value is delivered only after a trusted server payment event.
8. Paystack webhooks are public signed HTTP endpoints. Verify `x-paystack-signature` using HMAC SHA-512 before processing the event.
9. Before transitioning a payment to success, independently verify reference, transaction status, currency and exact amount with Paystack.
10. Payment processing and booking creation are idempotent. Duplicate webhook/reconcile events must not create duplicate bookings, blocks, notifications or ledger effects.
11. A verified payment becomes `paid_pending_owner`, not `confirmed`.
12. For historical pay-first records, renter-facing copy after verified payment is “Payment received — confirming your ride”. Request-first direct confirmation uses confirmed-booking copy.
13. Owner rejection requires a reason, releases the vehicle block and opens `intervention_required`; it never silently cancels a paid booking.
14. There is no automatic owner-rejection timeout. SLA timers alert operations only.
15. If payment verifies after the hold expired and the dates have been taken, record `paid_conflict`; never double-book.
16. Chat and wallet value remain locked until their own WP5/WP6 gates.
17. Admin roles remain the canonical six-role set. Do not reintroduce `booking_admin`.
18. Do not invent renter cancellation/refund policy. Refund/cancellation work requires an explicit approved policy or admin intervention path.

## 3. Current main foundation to preserve

Current `main` already owns the authoritative implementations for:

- `createBookingIntent` with server pricing, availability checks and atomic hold creation;
- owner/renter calendar queries and owner availability blocks;
- owner `confirmBooking` and `rejectBooking` restricted to server-established `paid_pending_owner`;
- rejection transition to intervention and date release;
- strict owner booking projection and native owner bookings desk;
- hardened Auth/App Check/Firestore/Storage development environment.

WP4 payment work must extend those contracts/repositories instead of replacing them with the donor branch’s older copies.

## 4. Donor branch audit

The donor branch is 56 commits behind current `main`. Use it only as a code source for ideas and tests.

### Salvage/adapt

- `PaymentPort` / gateway abstraction shape.
- Paystack server initialization and verify HTTP adapter structure.
- Test payment adapter concepts, restricted to test/emulator paths.
- Booking repository transaction patterns for payment records and paid-booking creation.
- Idempotency and duplicate-payment tests.
- Mobile checkout gateway shell and hosted authorization URL flow.
- Admin booking gateway patterns where they conform to canonical staff roles and current schemas.

### Rewrite before use

- Payment contracts: fit current canonical errors, current booking records and no owner identity leakage.
- Paystack adapter: include `access_code`, preserve provider reference, parse domain/currency/status accurately and fail closed on malformed responses.
- Payment-success processing: webhook/reconcile server truth only, with event dedupe and independent verify of reference/status/currency/amount.
- Firestore repository: adapt to current sentinel + interval booking block design and current intent schema/versioning.
- Admin intervention: use canonical staff roles and current audit requirements.
- Mobile checkout UX: preserve current discovery/booking screens and truthful post-payment `paid_pending_owner` language.

### Reject

- `booking_admin` role additions.
- Authenticated renter “verify payment” as the direct value-delivery path.
- Any callback/deep-link transition to `paid` or `paid_pending_owner`.
- Any cancellation/refund rules invented only by the donor branch.
- Any auto owner-rejection timeout.
- Old seed scripts, fixture fleet expansion, unrelated assets and UI changes.
- Wholesale donor branch merge/cherry-pick.

## 5. Sprint slices

### R0 — Reconciliation and contract lock

Deliver this sprint document and update `AGENTS.md` with the active branch, donor restrictions and exit gates.

Exit: source-of-truth and donor acceptance/rejection decisions are explicit.

### R1 — Payment contracts and Paystack adapter

Deliver:

- canonical payment state schema: `initialized -> pending -> succeeded -> refund_pending -> refunded`, with `failed`, `abandoned`, `refund_failed` branches;
- payment initialization command/result including hosted `authorizationUrl`, `accessCode`, `reference`, amount/currency snapshot and environment;
- server verification result carrying provider reference, `status`, `amountKobo`, `currency`, provider domain/environment and paid timestamp when present;
- `PaymentGateway` interface;
- Paystack test-mode adapter with deterministic unit tests for initialize/verify errors and malformed responses.

Exit: adapter cannot produce “succeeded” unless Paystack verify response says success; no client value transition exists.

### R2 — Trusted payment initialization

Deliver `initializeBookingPayment` callable:

- App Check + authenticated renter;
- validates renter owns intent;
- intent is unexpired and still payable;
- server revalidates profile, vehicle, dates, current config and price before gateway initialization;
- reference/access code persisted exactly once and bound to the intent;
- repeated idempotency key returns the same initialized payment record;
- no secret/provider payload leakage.

Exit: sandbox initialization can return hosted checkout data without marking any booking paid.

### R3 — Signed webhook and authorized reconciliation

Deliver:

- `paystackWebhook` public HTTP Function;
- raw-body HMAC SHA-512 signature validation before parsing/processing;
- strict payload/body limits and event-shape validation;
- stable event dedupe in `paymentEvents`;
- independent Paystack verify call for `charge.success` before value delivery;
- `reconcilePayment` callable restricted to intent owner for status refresh without unsafe value delivery, or staff/system where reconciliation can trigger the same trusted processor;
- exact reference, `success` status, `NGN` currency and exact expected amount checks.

Exit: duplicate events are no-ops; wrong amount/currency/reference cannot create a paid booking.

### R4 — Atomic paid-booking creation and late-payment conflict

Deliver one transactional processor for trusted verified payment:

- payment `succeeded` recorded once;
- booking intent `paid` recorded once;
- valid hold converts to blocking `paid_pending_owner` booking/block;
- owner/admin notification outbox emitted once;
- if hold expired and dates remain available, reacquire atomically and continue;
- if hold expired and dates are no longer available, intent becomes `paid_conflict` and an urgent admin case is created;
- never double-book or silently refund.

Exit: concurrency tests cover two renters, duplicate success and late verified payment after hold expiry.

### R5 — Owner response and intervention reconciliation

Reconcile existing current-main owner confirm/reject path with the new trusted paid records:

- owner confirm only from `paid_pending_owner`;
- owner reject requires reason, releases interval and opens intervention;
- no automatic rejection timeout;
- SLA alert creates operations signal only;
- admin case actions are audited and use canonical staff roles.

Alternative/reassignment/refund implementation is bounded by approved policy. Do not invent cancellation economics.

### R6 — Renter checkout UX

Deliver:

- initialize payment through callable;
- open Paystack hosted checkout;
- callback/deep link shows “checking payment” only;
- poll/reconcile read path until trusted state resolves;
- success copy: “Payment received — confirming your ride”;
- explicit pending, abandoned, failed, expired-hold and paid-conflict states;
- no decorative arrows in CTA labels.

### R7 — Development integration and exit gate

Required evidence before merge:

- root/function/mobile/admin typecheck, lint and tests green;
- payment adapter tests: initialize, verify, malformed response, provider failure;
- webhook HMAC tests: valid signature, invalid/missing signature, replay/duplicate;
- exact amount/currency/reference negative tests;
- concurrency tests for hold/payment races;
- development Paystack test-mode hosted checkout from native iOS or Android dev build;
- sandbox webhook reaches `mmg-concierge-dev` and creates exactly one trusted outcome;
- callback without trusted provider success creates no value;
- production project and live Paystack credentials untouched.

## 6. Security and operational rules

- Paystack secret keys live server-side only, preferably Secret Manager for deployed Functions.
- Never log secret keys, full provider payloads, renter PII, payment authorization data or card data.
- Store only the provider facts necessary for reconciliation/audit.
- Webhook must acknowledge quickly; durable processing must be idempotent because Paystack retries failed deliveries.
- No automated production payment test.
- Any deploy command must name `--project mmg-concierge-dev` during this sprint.
- Firestore/Rules changes require emulator negative tests before development deployment.

## 7. Sprint completion definition

WP4 payment reconciliation is complete only when a real Paystack **test-mode** payment can travel through:

```text
server-priced intent
  -> atomic checkout hold
  -> server Paystack initialize
  -> hosted checkout
  -> signed webhook / trusted reconcile
  -> independent provider verify
  -> exact amount + NGN + reference validation
  -> idempotent paid booking creation
  -> paid_pending_owner
  -> owner confirm OR owner reject + intervention
```

and the non-negotiable duplicate, wrong-value, callback-only, expired-hold and concurrency cases all fail safely.
