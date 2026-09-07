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
Current integration branch: `main`.
Validated auth + Apple integration merged through PR #23 at `55ffd2c39b619d2779b6f5b93d87f1f929b2a603`.

**Build invariant:** every EAS/TestFlight build must originate from `main`. Feature branches may be developed and validated, but they must be merged into `main` before any EAS build is created.

## 2. Locked product rules

- Every MVP rental includes chauffeur and delivery. No self-drive.
- No live tracking in MVP.
- Renter requires full name, verified email, verified phone and delivery address. Do not add renter government ID, licence, selfie or DOB.
- Booking dates are Africa/Lagos date-only half-open intervals `[startDate, endDate)`.
- Trusted money is integer NGN kobo and server-authoritative.
- Exact vehicle address/coordinates and owner-sensitive data remain private.
- Only approved, active, discoverable vehicles are renter-visible.
- Signed-out onboarding asks renter versus owner intent before registration. Existing sign-in remains universal, and an existing Firestore `accountType` always wins over entry-path intent.
- Normal registration creates the selected immutable account profile directly. The post-auth account-type chooser is recovery-only for legacy authenticated users whose profile is missing.
- Email/password, Google and Apple are authentication entry methods only. They do not bypass renter phone/address requirements, owner phone/ID/verification, booking/payment authority, or staff authorization.
- Cross-provider account collisions fail safely and direct the user to their existing sign-in method. Do not silently create or merge MMG identities.

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
10. A verified successful payment produces either `paid_pending_owner` or `paid_conflict` when a late payment collides with unavailable dates.
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

Validated historical checkpoints remain:

- R2 green at `67359ba`.
- R3 green at `89f1b0c`; Storage Rules follow-up 17/17 green.
- R4 green at `edd5a485e0f2b447df5ffddfcde388c1a9e83dd2`; Functions emulator 329/329, focused R4 transactional tests 20/20.
- R5 green at `2278ef43b4de379a4a90619a0e64bf931e288e3b`; Functions emulator 366/366 across 45 files.
- R6 responsive/header integration head `5709745da4d26f7246978e542923a3660265641a` passed the repository gate and was merged through PR #20.
- PR #20 merged normally into `main` at `d2c8d4537b107705cdb77dc7f1e57d367ecd96c5`.

## 5. Current priority: one visible vertical journey

Do not create another WP4 architecture slice before this works visibly:

```text
Authenticate with email, Google or Apple
  -> Find vehicle
  -> select dates
  -> receive authoritative held quote
  -> Pay with Paystack test mode
  -> webhook / trusted reconcile verifies payment
  -> renter sees trusted payment outcome
  -> booking appears in renter Trips
  -> booking appears for owner
  -> owner confirms OR rejects with reason
  -> authorized staff can see masked rejected/conflicted booking or case data
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

For MVP intervention, manual operations are acceptable. Staff visibility is read-only for the first live desk. Staff must not inherit the fixture desk's owner confirm/reject controls. Owner booking response remains an owner responsibility.

## 6. Current integration state

Authentication is merged into `main` through PR #23.

Validated before merge at feature head `e45ef8a610cdf71b66f4767ba383c57b88498c11`:

- root Vitest: 89 passed, 12 skipped files; 642 passed, 80 skipped tests;
- Functions unit tests: 36 passed, 9 skipped files; 323 passed, 43 skipped tests;
- Admin tests: 10 passed files; 66 passed tests;
- focused auth tests: 4 passed files; 15 passed tests;
- mobile, Functions and Admin typecheck/lint passed;
- `git diff --check` passed;
- Firebase emulator/Rules suites were not rerun in the final auth validation because the available local JDK was 17; auth changes do not alter the previously validated booking/payment backend or Rules architecture.

Current auth behavior:

- registration/profile mutations do not publish intermediate Firebase auth snapshots to the router;
- failed registration/profile creation signs out any transient Firebase session and keeps the local auth form able to surface errors and preserve inputs;
- native Firebase environment selection is idempotent and development/production selection remains explicit;
- Google authentication uses the Firebase-environment-matched web OAuth client;
- Apple authentication uses a cryptographically random raw nonce, SHA-256 nonce sent to Apple, and the raw nonce for Firebase credential exchange;
- Apple first-login name data is persisted to Firebase Auth when supplied and reloaded before MMG profile creation;
- Apple cancellation is a clean cancellation, not a false error;
- Apple uses Expo's native `AppleAuthenticationButton`;
- returning provider users preserve persisted Firestore `accountType`; first-time role-specific registration creates the selected profile;
- same-email cross-provider collisions remain explicit and are not automatically linked;
- Apple Sign in with Apple capability and the development Firebase provider are configured; private email relay remains pending operator domain verification before public launch;
- Apple-authenticated account deletion must include Apple token revocation before public App Store release;
- production `mmg-concierge` and live payment credentials remain untouched.

Historical build note: build 22 was created from feature-branch commit `7d9314f` before the builds-from-main-only invariant was adopted. Do not repeat that pattern.

The development-only payment configuration/deployment commands remain:

```bash
npm run firebase:paystack:secret:dev
npm run firebase:deploy:booking-payment-dev
```

The next gates are:

1. Create the next development TestFlight build from `main` at or after `55ffd2c39b619d2779b6f5b93d87f1f929b2a603` only.
2. On a physical iPhone, validate email, Google and Apple registration/sign-in/cancellation/session/error recovery.
3. Connect the minimal authorized, masked, read-only staff booking/case desk.
4. Prove one complete Paystack test journey across renter, owner and staff.
5. Keep production `mmg-concierge` and live Paystack credentials untouched.

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

**Build gate:** never run `eas build` from a feature branch. After the full gate and any required native acceptance prerequisites pass, merge into `main`, verify the exact `main` SHA, then build from that SHA.

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

The current phase is done when a real human can use a development build created from `main` and complete the core journey with Paystack test mode, and the resulting trusted booking is visible to renter, owner and authorized staff where applicable.

Only after that should the project expand automated intervention/refund machinery, WP5 chat/FCM, WP6 wallet/ledger or other future operational layers.
