# MMG Concierge — Agent Source of Truth

Use this file for the few rules that must not drift. Do not turn it into a diary of every commit.

## 1. Product and stack

MMG Concierge is a Lagos-first marketplace for chauffeured luxury-car rentals.

- Mobile: React Native + TypeScript + Expo Router, EAS custom dev builds, React Native Firebase.
- Admin: Next.js App Router.
- Backend: Firebase Auth, Firestore, Functions v2 Node 22, Storage, FCM, App Check.
- Functions region: `africa-south1`.
- Development Firebase project: `mmg-concierge-dev`.
- Production Firebase project: `mmg-concierge`.
- Production is never a development/test target.

Current repository: `franklinnweke/mmgconciergeapp`.
Current branch: `codex/dev-paystack-integration`, based on merged `main` at `d2c8d4537b107705cdb77dc7f1e57d367ecd96c5`.

## 2. Locked product rules

- Every MVP rental includes chauffeur and delivery. No self-drive.
- No live tracking in MVP.
- Renter requires full name, verified email, verified phone and delivery address. Do not add renter government ID, licence, selfie or DOB.
- Booking dates are Africa/Lagos date-only half-open intervals `[startDate, endDate)`.
- Trusted money is integer NGN kobo and server-authoritative.
- Exact vehicle address/coordinates and owner-sensitive data remain private.
- Only approved, active, discoverable vehicles are renter-visible.

Canonical admin roles are exactly:

- `support`
- `vehicle_admin`
- `verification_admin`
- `finance_admin`
- `privacy_admin`
- `super_admin`

Never add `booking_admin`.

## 3. Payment and booking integrity

These safeguards are essential and must remain:

1. Server-authoritative pricing.
2. Atomic full-interval checkout hold.
3. Server-side Paystack initialization.
4. Raw-body Paystack webhook HMAC SHA-512 verification.
5. Independent Paystack transaction verification for reference, environment, status, NGN currency and exact kobo amount.
6. Idempotent payment/event processing.
7. Atomic paid-booking creation and availability conversion/reacquisition.
8. Sentinel/block concurrency protection against double booking.
9. Payment callback/browser return is UX only, never payment truth.
10. A verified successful payment produces either:
   - `paid_pending_owner`, or
   - `paid_conflict` when a late payment collides with unavailable dates.
11. Both real successful charges remain `payments.state = succeeded`, including the conflict case.
12. Owner confirmation/rejection is separate from payment success.
13. Owner rejection requires a reason, releases the paid interval and opens intervention.
14. There is no automatic owner-rejection timeout.
15. Do not invent refund, cancellation, top-up or reassignment economics.

Renter success copy is canonical:

`Payment received — confirming your ride`

Only show it after trusted R4 value delivery returns `paid_pending_owner`.

## 4. Architecture freeze after R5

R1-R5 already established the backend payment, concurrency and owner-response boundaries. Do not expand WP4 with new backend state machines, case subtypes, financial workflows, or generalized orchestration unless a concrete end-to-end blocker proves they are necessary.

Validated checkpoints:

- R2 green at `67359ba`.
- R3 green at `89f1b0c`; Storage Rules follow-up is 17/17 green.
- R4 green at `edd5a485e0f2b447df5ffddfcde388c1a9e83dd2`; Functions emulator 329/329, focused R4 transactional tests 20/20.
- R5 green at `2278ef43b4de379a4a90619a0e64bf931e288e3b`; final Functions emulator 366/366 across 45/45 files.
- R6 checkout is green; final responsive/header integration head `5709745da4d26f7246978e542923a3660265641a` passed the repository gate with 630 passed / 80 skipped root tests and was merged through PR #20.
- PR #20 merged normally into `main` at `d2c8d4537b107705cdb77dc7f1e57d367ecd96c5`, preserving the meaningful implementation history.
- No R1-R6 validation configured a Paystack secret, made a real Paystack request, deployed the WP4 payment Functions or touched production.

## 5. Current priority: one visible vertical journey

Do not create another WP4 architecture slice before this works visibly:

```text
Find vehicle
  -> select dates
  -> receive authoritative held quote
  -> Pay with Paystack test mode
  -> webhook / trusted reconcile verifies payment
  -> renter sees trusted payment outcome
  -> booking appears in renter Trips
  -> booking appears for owner
  -> owner confirms OR rejects with reason
  -> admin can see rejected/conflicted payment case
```

The renter path stays simple:

- existing booking review screen creates the hold;
- initialize payment through the existing callable;
- open the server-returned `https://checkout.paystack.com/...` URL;
- returning from the browser does not imply success;
- renter can check payment status through the existing trusted `reconcilePayment` callable;
- provider `success` without R4 value delivery remains a checking state;
- `paid_pending_owner` shows the canonical success copy;
- `paid_conflict` explains that MMG will resolve the booking manually;
- abandoned, failed and expired-hold states remain truthful and recoverable;
- CTA buttons do not use decorative arrows.

For MVP intervention, manual operations are acceptable. Staff can inspect the case and contact the renter. Do not implement automated replacement negotiation, top-ups, partial refunds or complex sourcing/resolution flows before real-user testing.

## 6. Development integration

Active integration branch: `codex/dev-paystack-integration`.

Current state:

- merged code already defines `PAYSTACK_SECRET_KEY` with Firebase `defineSecret()` and binds it only to the payment Functions that require it;
- the Paystack adapter is hard-locked to `requiredEnvironment: 'test'`, so a live secret fails closed;
- payment initialization, webhook ingestion, independent verification, R4 value delivery and trusted reconciliation are already implemented;
- no callback relay is required for the first native smoke: browser return is UX-only and the app reconciles trusted state after foreground return or explicit status check;
- the development Paystack secret has not yet been configured and the WP4 payment Functions have not yet been deployed.

Use the fixed dev-only commands from the repository root:

```bash
npm run firebase:paystack:secret:dev
npm run firebase:deploy:booking-payment-dev
```

The deployment command is deliberately pinned to `mmg-concierge-dev` and deploys only the current booking/payment journey surface: `createBookingIntent`, `initializeBookingPayment`, `paystackWebhook`, `processPaystackPaymentEvent`, `reconcilePayment`, `confirmBooking`, and `rejectBooking`.

After deployment:

1. Use the exact `paystackWebhook` HTTPS URL printed by Firebase CLI as the Paystack **test-mode** webhook URL.
2. Complete one native iOS or Android dev-build checkout.
3. Confirm the sandbox webhook reaches development Firebase.
4. Confirm one trusted paid outcome is created exactly once.
5. Confirm renter and owner both see the resulting booking.
6. Confirm owner confirm/reject works against that exact record.
7. Confirm rejected/paid-conflict cases are visible to staff/admin for manual handling.
8. Confirm callback/browser return without trusted provider success creates zero value.
9. Keep `mmg-concierge` production and live Paystack credentials untouched.

## 7. Validation discipline

Use focused tests while coding. Run the full repository/emulator/Rules gate at meaningful milestones, before integration/deploy, and before merge. Do not create a new checkpoint document for every small change.

Core gate:

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

Firebase Emulator Suite requires Java 21+. Temurin 25 is known-good.

## 8. Engineering rules

- Deny client access by default; critical writes stay server-authoritative.
- Never log secrets, full provider payloads, exact coordinates, bank data or unnecessary PII.
- Paystack secrets stay server-side only.
- No real/live Paystack request in automated tests.
- Generate durable IDs outside retryable Firestore transaction callbacks.
- Availability-changing transactions must read the existing valid sentinel and relevant blocks before writes.
- Fail closed rather than recreating missing payment/availability invariants.
- Preserve existing contracts/state names unless an ADR/migration is genuinely required.
- Do not add future-state modelling just because it might be useful later.

## 9. Commit and documentation policy

Prefer a sensible number of meaningful commits. A substantial product slice may naturally be 3-7 commits, but do not split imports, tiny test edits or formatting into artificial activity commits.

Update this `AGENTS.md` only when one of these changes:

- architecture/source-of-truth rule;
- validated milestone;
- active integration/deployment state;
- major blocker or next product priority.

Do not require an `AGENTS.md` edit in every implementation commit. Do not create new status documents when the code/tests and this file already express the state.

## 10. Definition of done for the current phase

The current phase is done when a real human can use a development build and complete the core journey with Paystack test mode, and the resulting trusted booking is visible to renter, owner and staff where applicable.

Only after that should the project expand automated intervention/refund machinery, WP5 chat/FCM, WP6 wallet/ledger or other future operational layers.
