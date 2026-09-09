# MMG Concierge — Agent Source of Truth

This file contains the durable rules, validated milestones, active release state, and major blockers that must not drift across agents. Do not turn it into a diary of every command or commit.

For live cross-agent handoffs, use GitHub Issue #35: **MMG agent coordination and current handoff**.

## 0. Multi-agent coordination protocol

All substantial work by ChatGPT, Codex CLI, Antigravity CLI, or the VPS agent must follow the same coordination model:

- `AGENTS.md` = durable product, architecture, release, and safety truth.
- GitHub Issue #35 = live append-only handoffs and operational status.
- Pull requests = code ownership and review.
- GitHub CI = objective validation.
- Git history = what actually landed.

Before substantial work:

1. Read this file.
2. Fetch `main` and record the exact base SHA.
3. Check Issue #35 for active work that could overlap.
4. Use a narrow branch/task scope.

When starting, blocking, or completing substantial work, comment on Issue #35 using:

```text
AGENT: <ChatGPT | Codex | Antigravity | VPS>
BASE: <exact SHA>
BRANCH: <branch or none>
SCOPE: <narrow task>
STATUS: <starting | blocked | completed>
CHANGED: <files/behavior or none>
VALIDATION: <actual commands/results>
DEPLOYED: <exact environment/resources or none>
PRODUCTION: untouched | explicitly authorized
BLOCKERS: <none or concrete blocker>
NEXT: <recommended next action>
```

Never treat another agent's unpushed local work as integrated state. Do not create additional heartbeat/status files unless this protocol proves insufficient.

## 1. Product and stack

MMG Concierge is a Lagos-first marketplace for chauffeured luxury-car rentals.

- Mobile: React Native + TypeScript + Expo Router, EAS custom development builds, React Native Firebase.
- Admin: Next.js App Router.
- Backend: Firebase Auth, Firestore, Functions v2 Node 22, Storage, FCM, App Check.
- Primary Functions/data-plane region: `africa-south1`.
- Cloud Scheduler region for owner SLA jobs: `europe-west1` where required by service availability.
- Development Firebase project: `mmg-concierge-dev`.
- Production Firebase project: `mmg-concierge`.
- Current repository: `franklinnweke/mmgconciergeapp`.
- Integration branch: `main`.

Production is never a development or test target.

**Build invariant:** every EAS/TestFlight build must originate from `main`. Feature branches may be developed and validated, but they must be merged into `main` before any EAS build is created.

## 2. Locked product rules

- Every MVP rental includes chauffeur and delivery. No self-drive.
- No live tracking in MVP.
- Renter baseline access requires an authenticated, verified-email identity.
- Full name, phone, profile photo, delivery address and similar renter details are profile enrichment, not government identity verification.
- Never require renter government ID, driving licence, selfie or DOB.
- Government-ID verification belongs only to owner onboarding.
- Booking dates are Africa/Lagos date-only half-open intervals `[startDate, endDate)`.
- Trusted money is integer NGN kobo and server-authoritative.
- Exact vehicle address/coordinates and owner-sensitive data remain private.
- Only approved, active, discoverable vehicles are renter-visible.
- Signed-out `Rent a car` versus `List a car` is session intent, not a permanent navigation role.
- Every verified authenticated MMG account can use the renter experience.
- Listing vehicles is an additional owner application/capability on the same identity.
- Firestore `users.accountType` is compatibility metadata. It must not block renter access or force an existing owner into owner-only navigation.
- A verified renter compatibility account may create and submit its own owner application without mutating `users.accountType`.
- Staff approval remains mandatory before owner operational capability is approved.
- Vehicle creation/uploads and owner operations remain restricted to trusted approved-owner/vehicle-ownership state.
- Email/password, Google, and Apple are authentication entry methods only. They do not bypass owner verification, booking/payment authority, or staff authorization.
- Cross-provider account collisions fail safely and direct the user to the existing sign-in method. Do not silently merge MMG identities.

Canonical admin roles are exactly:

- `support`
- `vehicle_admin`
- `verification_admin`
- `finance_admin`
- `privacy_admin`
- `super_admin`

Never add `booking_admin`.

## 3. Payment and booking integrity

These safeguards are essential:

1. Server-authoritative pricing.
2. Atomic full-interval checkout hold.
3. Server-side Paystack initialization.
4. Raw-body Paystack webhook HMAC SHA-512 verification.
5. Independent Paystack transaction verification for reference, environment, status, NGN currency, and exact kobo amount.
6. Idempotent payment/event processing.
7. Atomic paid-booking creation and availability conversion/reacquisition.
8. Sentinel/block concurrency protection against double booking.
9. Browser/payment-provider callback is UX only, never payment truth.
10. Verified successful payment produces `paid_pending_owner` or `paid_conflict` if a late payment collides with unavailable dates.
11. Successful charges remain `payments.state = succeeded`, including conflict cases.
12. Owner confirmation/rejection is separate from payment success.
13. Owner rejection requires a reason, releases the interval, and opens intervention.
14. There is no automatic owner-rejection timeout.
15. Do not invent refund, cancellation, top-up, reassignment, or payout economics.

Canonical renter success copy after trusted value delivery:

`Payment received — confirming your ride`

## 4. Architecture freeze / MVP scope

The payment, concurrency, owner-response, owner-verification, and intervention foundations already exist. Do not expand the MVP with new generalized state machines or speculative orchestration unless an observed end-to-end blocker requires it.

Explicitly defer until after the current acceptance phase:

- chat / broad FCM product work;
- wallet/ledger;
- automated payouts;
- automated refund orchestration;
- replacement negotiation machinery;
- live tracking;
- self-drive;
- multi-currency;
- broad mobile redesign.

## 5. Current acceptance priority

Prove one visible vertical journey:

```text
Authenticate
  -> Find vehicle
  -> select dates
  -> authoritative held quote
  -> checkout readiness / verified phone
  -> Paystack test payment
  -> trusted payment verification
  -> renter Trips
  -> owner response
  -> staff intervention when needed
```

Rules for the journey:

- Home owns selected dates and passes them through Vehicle Detail to Booking Review.
- Rental duration supports the continuous 1–30 day range.
- Booking Review creates the hold.
- Payment initialization uses the existing server callable.
- Returning from Paystack/browser does not imply success.
- `paid_pending_owner` shows the canonical success copy.
- `paid_conflict` remains visible and truthful; do not invent a refund.
- Abandoned, failed, and expired-hold states remain truthful and recoverable.
- Manual staff operations are acceptable for the first MVP intervention desk.

## 6. Current validated integration and build state

Validated Build 29 source checkpoint:

`013a547909642dfe27cbe2c6861dd319850b4511`

This checkpoint is a green `main` revision and includes:

- native Email/Google/Apple authentication and main-only EAS build policy;
- unified renter access and owner-capability onboarding;
- precision Home → Vehicle Detail → Booking Review journey;
- renter checkout readiness with inline Firebase Auth SMS verification and profile synchronization;
- App Check fail-closed production boundary;
- development Paystack booking/payment operations;
- graceful sign-out and renter profile-photo handling;
- PR #27 Trips precision: real vertical scrolling, compact status-first rows, canonical imagery, and historical recovery;
- PR #25 Admin consolidation: shared operations shell and read-only booking intervention presentation;
- GitHub CI/CD scaffolding and CI stabilization.

Build 29 was created from the exact checkpoint above:

- build number: `29`
- EAS build ID: `1f9f077b-d73c-4605-942b-4bcae3d5d52a`
- submission ID: `36f81594-247b-4d90-ac3b-4280139f15cc`
- development Firebase config selected

Build 28 remains historical and predates PR #27 Trips UI changes.

Current known acceptance gaps / boundaries:

- Real SMS OTP delivery has not yet been proven on the user's physical device. Do not treat this as proof that the implementation is broken.
- The PR #27 `createBookingIntent` server-side canonical image snapshot change must be confirmed deployed to `mmg-concierge-dev` before calling fresh-booking image snapshots accepted.
- Automatic development CD remains intentionally disabled until Google Workload Identity variables are configured. This is infrastructure work, not an MVP functional blocker.
- The Android local-validation/config-selection work reported by a local agent was validated locally but was not integrated into GitHub `main` as of the Build 29 checkpoint. Do not assume local agent work landed unless GitHub proves it.
- Production `mmg-concierge` and live Paystack remain untouched.

Current auth/UI expectations:

- Google authentication uses the Firebase-environment-matched OAuth client.
- Apple authentication uses nonce hashing, Firebase credential exchange, first-login name persistence when supplied, cancellation handling, and Expo's native Apple button.
- Social sign-in presentation should place Google first and Apple immediately underneath on supported iOS devices.
- Authenticated verified users land in renter/Home by default regardless of compatibility `accountType`.
- `List your car` carries owner intent into owner onboarding.

Apple public-release work still pending:

- private email relay/operator-domain verification as applicable;
- Apple token revocation on account deletion before public App Store release.

## 7. Validation discipline

Use focused tests while coding. Run the full repository/emulator/Rules gate at meaningful milestones, before integration/deploy, and before merge.

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

Firebase Emulator Suite requires Java 21+.

**Build gate:** never run `eas build` from a feature branch. Merge validated work into `main`, verify the exact `main` SHA, then build from that SHA.

Agents must never claim tests, deployments, EAS state, Android Studio state, Firebase state, or VPS state without actual evidence.

## 8. Engineering and security rules

- Deny client access by default; critical writes stay server-authoritative.
- Never log secrets, provider payloads, exact coordinates, bank data, or unnecessary PII.
- Paystack secrets stay server-side only.
- No live Paystack requests in automated tests.
- Generate durable IDs outside retryable Firestore transaction callbacks.
- Availability-changing transactions must read valid sentinel and relevant blocks before writes.
- Fail closed rather than recreating missing payment/availability invariants.
- Preserve existing contracts/state names unless an ADR/migration is genuinely required.
- Do not add future-state modelling simply because it might be useful later.
- Do not touch production without Franklin's explicit authorization for that production action.

## 9. Agent/tool ownership guidance

Prefer the agent with direct access to the system being tested:

- ChatGPT/GitHub: repository state, PR review/merge, CI, release coordination, source-of-truth reconciliation.
- Codex CLI: local repo execution, broad code changes, Firebase CLI, EAS CLI, repository test suites.
- Antigravity CLI: Android Studio, Gradle, `adb`, emulator, Logcat, native Android validation.
- VPS agent: server provisioning, HTTPS/reverse proxy, process supervision, firewall, Admin deployment/health.
- Franklin: physical iPhone acceptance, real OTP receipt, Paystack human interaction, renter/owner/staff human workflow.

VPS agents must not patch application code on the server to fix product defects. Report product defects back through GitHub.

## 10. Commit and documentation policy

Prefer a sensible number of meaningful commits. Do not split tiny imports, formatting, or test edits into artificial activity commits.

Update this file only when one of these changes:

- architecture/source-of-truth rule;
- validated milestone/build checkpoint;
- active integration/deployment state;
- major blocker;
- next product priority.

Use Issue #35 for routine work handoffs instead of adding status files or diary entries here.

## 11. Definition of done for the current phase

The current phase is done when a real human can use a development build created from `main`, complete the core journey in Paystack test mode, and see the resulting trusted booking consistently across renter, owner, and authorized staff surfaces where applicable.

A sandbox MVP pilot and a public paid launch are separate gates. Production configuration, live Paystack, App Store release/security/privacy checks, and real-money operational policies require explicit launch approval.
