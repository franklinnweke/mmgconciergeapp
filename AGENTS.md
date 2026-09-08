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
Validated auth + Apple integration merged through PR #23.
Unified account access, renter precision redesign, and owner-capability repair merged through PR #24 at `490f565a9258212116c555a50e6ce27f86f930b4`.

**Build invariant:** every EAS/TestFlight build must originate from `main`. Feature branches may be developed and validated, but they must be merged into `main` before any EAS build is created.

## 2. Locked product rules

- Every MVP rental includes chauffeur and delivery. No self-drive.
- No live tracking in MVP.
- Renter requires full name, verified email, verified phone and delivery address. Do not add renter government ID, licence, selfie or DOB.
- Booking dates are Africa/Lagos date-only half-open intervals `[startDate, endDate)`.
- Trusted money is integer NGN kobo and server-authoritative.
- Exact vehicle address/coordinates and owner-sensitive data remain private.
- Only approved, active, discoverable vehicles are renter-visible.
- Signed-out onboarding asks how the person wants to start: rent a car or list a car. This is a session intent, not a permanent navigation role.
- Every verified authenticated MMG account can use the renter experience.
- Listing vehicles is an additional owner application/capability on the same identity.
- Firestore `users.accountType` remains compatibility metadata. It must not block renter access or force an existing owner into owner-only navigation.
- Normal registration creates a compatibility profile directly. Legacy authenticated users missing `/users/{uid}` are repaired to the baseline renter compatibility profile.
- Email/password, Google and Apple are authentication entry methods only. They do not bypass renter phone/address requirements, owner phone/ID/verification, booking/payment authority, or staff authorization.
- Cross-provider account collisions fail safely and direct the user to the existing sign-in method. Do not silently create or merge MMG identities.
- A verified renter compatibility account may create and submit its own trusted owner application without mutating `users.accountType`.
- Owner verification upload permission is based on a server-created draft/rejected owner application for the same authenticated UID.
- Vehicle creation, vehicle uploads/documents, and owner operational capabilities remain restricted to trusted approved-owner/vehicle-ownership state. Applying to become an owner never grants blanket owner privileges.
- Staff approval remains mandatory before owner operational capability is considered approved.

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

- Home owns the selected journey dates and passes them through vehicle detail into booking review.
- Rental duration supports the full continuous 1–30 day range.
- Existing booking review creates the hold.
- Initialize payment through the existing callable.
- Open the server-returned `https://checkout.paystack.com/...` URL.
- Returning from the browser does not imply success.
- Renter can check payment status through the existing trusted `reconcilePayment` callable.
- Provider `success` without R4 value delivery remains a checking state.
- `paid_pending_owner` shows the canonical success copy.
- `paid_conflict` explains that MMG will resolve the booking manually.
- Abandoned, failed and expired-hold states remain truthful and recoverable.
- CTA buttons do not use decorative arrows.

For MVP intervention, manual operations are acceptable. Staff visibility is read-only for the first live desk. Staff must not inherit the fixture desk's owner confirm/reject controls. Owner booking response remains an owner responsibility.

## 6. Current integration state

PR #24 merged the validated three-commit stack into `main`:

1. `d86418267c76f43379b2677d73633ef805b88f5f` — unified authenticated account access.
2. `c9f6f04986e0913765005f8e90470553c665c33e` — precision redesign for Home → Vehicle Detail → Booking Review.
3. `7682f3d33e33fff602969561e19b02d66b65894e` — owner capability-boundary repair and restored full journey selection.

PR #24 merge commit: `490f565a9258212116c555a50e6ce27f86f930b4`.

Final validated feature-head gate before merge:

- root Vitest: 90 passed files, 12 skipped; 688 passed tests, 93 skipped;
- Functions unit tests: 36 passed files, 9 skipped; 334 passed tests, 43 skipped;
- Admin tests: 10 passed files; 66 passed tests;
- mobile typecheck/lint: 0 errors, 0 warnings;
- Functions typecheck/build: passed;
- Admin typecheck/lint: 0 errors, 0 warnings;
- `git diff --check`: passed.

Development deployment completed before merge:

- `mmg-concierge-dev` Storage Rules updated for trusted owner-application verification uploads;
- affected owner onboarding Functions updated in `africa-south1`;
- production `mmg-concierge` untouched;
- Paystack live credentials untouched.

Current auth/capability behavior:

- registration/profile mutations do not publish intermediate Firebase auth snapshots to the router;
- failed registration/profile creation signs out transient Firebase sessions and preserves form recovery;
- Google authentication uses the Firebase-environment-matched OAuth client;
- Apple authentication uses raw nonce + SHA-256 nonce correctly, persists first-login name data when supplied, handles cancellation cleanly, and uses Expo's native Apple button;
- authenticated verified users land in renter/Home by default regardless of legacy `accountType`;
- choosing `List your car` carries owner intent through successful authentication into owner onboarding;
- universal sign-in and `Rent a car` land in renter/Home;
- a renter compatibility account may create/update/submit its own owner application without changing `users.accountType`;
- owner verification document upload is allowed only for the authenticated user's server-created draft/rejected application;
- vehicle asset/listing permissions remain restricted to approved owner capability and vehicle ownership;
- same-email cross-provider collisions remain explicit and are not automatically linked;
- Apple private email relay remains pending operator domain verification before public App Store launch;
- Apple-authenticated account deletion must include Apple token revocation before public App Store release.

Current UI/product behavior:

- artificial 1.3-second splash delay is removed;
- ordinary press interactions no longer haptic by default;
- Home uses a compact location/date summary instead of stacked repetitive booking controls;
- selected dates persist Home → Vehicle Detail → Booking Review;
- rental duration supports 1–30 days;
- Vehicle Detail uses a more practical landscape gallery and reduced decorative chrome;
- Booking Review prioritizes car, dates, quote truth and the hold action;
- nested screens may use contextual titles rather than repeating the full MMG wordmark.

Email verification remains required before entering live renter discovery and owner-application surfaces because the trusted backend still enforces that boundary.

Historical build note: build 22 was created from feature-branch commit `7d9314f` before the builds-from-main-only invariant was adopted. Do not repeat that pattern.

The development-only payment configuration/deployment commands remain:

```bash
npm run firebase:paystack:secret:dev
npm run firebase:deploy:booking-payment-dev
```

The next gates are:

1. Create the next iOS development TestFlight build from the current `main` SHA only.
2. On a physical iPhone, validate Email, Google and Apple authentication, including existing-owner → Rent a car and existing-renter → List your car behavior.
3. Validate the redesigned Home → Vehicle Detail → Booking Review journey, including continuous 1–30 day date selection and exact date continuity.
4. Smoke-test renter owner-application creation/upload/submission against `mmg-concierge-dev` and confirm renter identities do not gain approved-owner vehicle powers.
5. Connect the minimal authorized, masked, read-only staff booking/case desk.
6. Prove one complete Paystack test journey across renter, owner and staff.
7. Keep production `mmg-concierge` and live Paystack credentials untouched.

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
