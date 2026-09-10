# MMG Concierge - Agent Source of Truth

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
- Cloud Scheduler region where required by service availability: `europe-west1`.
- Development Firebase project: `mmg-concierge-dev`.
- Production Firebase project: `mmg-concierge`.
- Current repository: `franklinnweke/mmgconciergeapp`.
- Integration branch: `main`.

Production is never a development or test target.

**Build invariant:** every EAS/TestFlight build must originate from `main`. Feature branches may be developed and validated, but they must be merged into `main` before any EAS build is created.

## 2. Locked product and identity rules

- Every MVP rental includes chauffeur and delivery. No self-drive.
- No live tracking in MVP.
- Renter baseline access requires an authenticated, verified-email identity.
- Full name, phone, profile photo, delivery address and similar renter details are profile enrichment, not government identity verification.
- Renter checkout does **not** require Firebase Phone Auth or SMS OTP. Contact phone is ordinary operational profile/request data.
- Never require renter government ID, driving licence, selfie or DOB.
- Government-ID and stronger phone verification belong only to owner onboarding.
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

The booking concierge desk uses capabilities rather than a new role. `bookings.manage_requests` is bounded to soft-request approval/decline and opening the payment window. It does not grant refunds, payouts, reassignment, or arbitrary paid-booking mutation.

## 3. Canonical request-first booking model

The Build 30 commercial model is request-first concierge booking:

```text
Renter selects vehicle and dates
  -> soft rental request
  -> owner or authorized MMG staff approves/declines
  -> MMG contacts renter and completes concierge checks
  -> authorized MMG staff opens payment window
  -> authoritative 30-minute availability hold starts
  -> renter initializes Paystack payment
  -> trusted provider verification
  -> confirmed booking
```

The following are non-negotiable:

1. Creating `rentalRequests/{requestId}` is soft interest. It does **not** create a booking intent, booking block, or availability lock.
2. Multiple overlapping soft requests may coexist.
3. Approval does **not** lock inventory and does **not** start the 30-minute payment clock.
4. The vehicle owner assigned to the request, or authorized MMG `support`/`super_admin`, may approve or decline the soft request.
5. Only authorized MMG `support`/`super_admin` staff may open the payment window.
6. Opening the payment window is the authoritative availability transaction. It revalidates vehicle state, pricing, availability sentinel, and overlapping blocks before creating the booking intent/block.
7. The renter-facing payment window is exactly 30 minutes.
8. Once Paystack initialization begins, the technical hold may receive a longer internal payment-in-flight protection period so the expiry worker cannot release inventory underneath a real charge. This internal protection must never be presented as extra customer payment time.
9. Untouched expired payment windows release inventory and become `payment_window_expired`.
10. A `checkout_pending` intent is payment-in-flight and must not be released by the ordinary 30-minute expiry worker. Reconciliation owns the terminal outcome.
11. Request-first trusted Paystack success creates a `confirmed` booking directly because approval happened before payment.
12. Historical pay-first intents remain compatible with `paid_pending_owner` and the historical owner-response workflow.
13. A verified payment that cannot safely secure the requested dates becomes `paid_conflict` / request `needs_attention`; never manufacture confirmation.
14. Browser/payment-provider callback is UX only, never payment truth.
15. Successful charges remain `payments.state = succeeded`, including conflict cases.
16. Do not invent refund, cancellation, top-up, reassignment, or payout economics.

Renter-facing request vocabulary should remain truthful:

- `requested`: Request received / MMG is confirming the request. No payment and no dates locked.
- `approved`: Approved / MMG will contact the renter before payment is opened. No payment window yet.
- `ready_for_payment`: Vehicle available for payment. Complete payment within 30 minutes.
- `confirmed`: Payment verified and booking secured.
- `needs_attention`: MMG Concierge is resolving the booking.
- `declined` / `payment_window_expired`: terminal and truthful, with no invented charge/refund status.

## 4. Request privacy and PII boundaries

- Raw `rentalRequests` records are server operational state and are denied to all mobile clients by Firestore Rules.
- Renter mobile must use the server-redacted `listRenterRentalRequests` callable. Owner mobile must use the server-redacted `listOwnerRentalRequests` callable.
- Renter and owner request projections are strict server allowlists, not raw Firestore documents.
- Renter-visible projection may contain vehicle, dates, broad service area, request state/version, price/status information, payment-window intent/expiry, and resulting booking ID when required by the renter journey. It must not contain owner ID, staff IDs, contact PII, internal notes, or other server-only lifecycle metadata.
- Owner-visible projection may contain vehicle, dates, broad service area, request state/version and price/status information needed to decide availability. It must never contain renter ID, owner ID, phone, email, precise address, profile details, staff IDs, or internal concierge notes.
- `rentalRequestContacts/{requestId}` stores private renter contact information for MMG operations and is denied to all mobile clients by Firestore Rules.
- Authorized Admin server code may join `rentalRequests` with `rentalRequestContacts` using the Admin SDK for the concierge desk.
- Active rental requests block renter account deletion where operational resolution is still required.
- When deletion is permitted, private rental-request contact records for that renter are removed and the purge is audited.

## 5. Payment and booking integrity

These safeguards are essential:

1. Server-authoritative pricing.
2. Atomic full-interval availability hold only when MMG opens the payment window.
3. Server-side Paystack initialization.
4. Raw-body Paystack webhook HMAC SHA-512 verification.
5. Independent Paystack transaction verification for reference, environment, status, NGN currency, and exact kobo amount.
6. Idempotent payment/event processing.
7. Atomic booking creation and availability conversion/reconciliation.
8. Sentinel/block concurrency protection against double booking.
9. Browser/payment-provider callback is UX only, never payment truth.
10. Request-first verified success produces `confirmed`; historical pay-first success may still produce `paid_pending_owner`.
11. Late/unavailable successful payment produces `paid_conflict` and intervention, not false confirmation.
12. Successful charges remain `payments.state = succeeded`, including conflict cases.
13. Historical owner confirmation/rejection remains separate from payment success for historical pay-first records.
14. There is no automatic owner-rejection timeout.
15. Do not invent refund, cancellation, top-up, reassignment, or payout economics.

The historical product copy `Payment received — confirming your ride` belongs only to flows that are actually still awaiting owner confirmation. Request-first direct-confirmation UI must use truthful confirmed-booking copy instead.

## 6. Architecture freeze / MVP scope

The payment, concurrency, owner verification, request approval, request privacy, Admin concierge, and intervention foundations should remain narrow. Do not expand the MVP with new generalized state machines or speculative orchestration unless an observed end-to-end blocker requires it.

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

## 7. Current acceptance priority

Prove one visible development journey:

```text
Authenticate with verified email
  -> find vehicle
  -> select dates
  -> send soft rental request with ordinary contact phone
  -> owner or MMG approves
  -> MMG contacts renter
  -> MMG opens 30-minute payment window
  -> renter sees ready-for-payment state
  -> Paystack test payment
  -> trusted payment verification
  -> confirmed renter trip
  -> staff sees the same request/booking truth
```

Rules for the journey:

- Home owns selected dates and passes them through Vehicle Detail to Booking Review.
- Rental duration supports the continuous 1–30 day range.
- Booking Review submits a **soft request**, not an inventory hold.
- No renter SMS/OTP step belongs in this checkout flow.
- The owner or MMG approval state must be visible truthfully before payment is opened.
- MMG staff must follow `docs/operations/REQUEST_FIRST_CONCIERGE_RUNBOOK.md`: call the renter first and leave the request `approved` if the renter is unreachable or not ready to pay.
- MMG staff explicitly opens the payment window only after concierge contact/readiness.
- Payment initialization uses the dedicated request-first server callable.
- Returning from Paystack/browser does not imply success.
- Request-first trusted success displays confirmed-booking truth.
- `paid_conflict` / `needs_attention` remains visible and truthful; do not invent a refund.
- Abandoned, failed, declined, and expired-window states remain truthful and recoverable.
- Manual staff operations are acceptable for the first MVP concierge desk. FCM/chat/automated call orchestration remain deferred.

## 8. Current validated integration and build state

Validated Build 29 source checkpoint:

`013a547909642dfe27cbe2c6861dd319850b4511`

Build 29 was created from the exact checkpoint above:

- build number: `29`
- EAS build ID: `1f9f077b-d73c-4605-942b-4bcae3d5d52a`
- submission ID: `36f81594-247b-4d90-ac3b-4280139f15cc`
- development Firebase config selected

Build 29 is historical acceptance evidence only. It predates the request-first Build 30 architecture and must not be used as evidence that the new flow is integrated.

Post-Build-29 baseline before request-first integration began:

`df15b2d33e318965425303caf2f41942d31408eb`

Validated Build 30 source checkpoint merged to `main`:

`9d629c2d87325edf0e85e6975bd5b468a2633b21`

Consolidation and merge sequence:
- PR #40 (`codex/pr39-renter-release-action`) merged into PR #39.
- PR #39 (`antigravity/build30-request-first-mobile`) merged into PR #38.
- PR #38 (`feat/build30-request-first-concierge`) merged into `main`.
- Validated tree: `7b2dfc06d01d9ffee9a7a97ec1315faa2d05150c`.
- Post-merge CI #77 (`34425965734`) passed green across all jobs.

Current state:
- Request-first architecture: merged to `main`
- Renter release-payment-window action: merged to `main`
- Mobile renter/owner integration: merged to `main`
- Admin concierge controls: merged to `main`
- Main CI: green
- Production `mmg-concierge`: untouched
- Firebase development deployment (`mmg-concierge-dev`): pending
- EAS/TestFlight Build 30: not created yet
- Android native validation: explicitly deferred for this iOS-first Build 30 path

Do not call Build 30 deployed or release-ready until the required development Functions/Rules/indexes are deployed to `mmg-concierge-dev`, Admin is deployed by the VPS/Admin agent, and end-to-end human acceptance has been completed.

Current auth/UI expectations:

- Google authentication uses the Firebase-environment-matched OAuth client.
- Apple authentication uses nonce hashing, Firebase credential exchange, first-login name persistence when supplied, cancellation handling, and Expo's native Apple button.
- Social sign-in presentation should place Google first and Apple immediately underneath on supported iOS devices.
- Authenticated verified users land in renter/Home by default regardless of compatibility `accountType`.
- `List your car` carries owner intent into owner onboarding.
- Renter checkout does not use Firebase Phone Auth. Owner onboarding may still do so.

Apple public-release work still pending:

- private email relay/operator-domain verification as applicable;
- Apple token revocation on account deletion before public App Store release.

Automatic development CD remains intentionally disabled until Google Workload Identity variables are configured. This is infrastructure work, not an MVP functional blocker. Production Firebase and live Paystack remain out of scope without explicit authorization.

## 9. Validation discipline

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

## 10. Engineering and security rules

- Deny client access by default; critical writes stay server-authoritative.
- Never log secrets, provider payloads, exact coordinates, bank data, or unnecessary PII.
- Paystack secrets stay server-side only.
- No live Paystack requests in automated tests.
- Generate durable IDs outside retryable Firestore transaction callbacks.
- Availability-changing transactions must read a valid sentinel and relevant blocks before writes.
- Fail closed rather than recreating missing payment/availability invariants.
- Preserve canonical contracts/state names unless an ADR/migration is genuinely required.
- Do not add future-state modelling simply because it might be useful later.
- Do not touch production without Franklin's explicit authorization for that production action.

## 11. Agent/tool ownership guidance

Prefer the agent with direct access to the system being tested:

- ChatGPT/GitHub: repository state, backend/contracts/rules/Admin integration, PR review/merge, CI, release coordination, source-of-truth reconciliation.
- Codex CLI: local repo execution, broad code changes, Firebase CLI, EAS CLI, repository test suites.
- Antigravity CLI: React Native native-integration work when paired with Android Studio, Gradle, `adb`, emulator, Logcat, and Android device validation.
- VPS agent: server provisioning, HTTPS/reverse proxy, process supervision, firewall, Admin deployment/health.
- Franklin: physical iPhone acceptance, Paystack human interaction, renter/owner/staff human workflow.

For Build 30, Antigravity's preferred lane is the renter/owner React Native request-first surface plus Android/native validation. Antigravity must not redesign backend state machines, payment semantics, Firestore rules, or Admin financial authority unless it reports a concrete blocker through Issue #35.

VPS agents must not patch application code on the server to fix product defects. Report product defects back through GitHub.

## 12. Commit and documentation policy

Prefer a sensible number of meaningful commits. Do not split tiny imports, formatting, or test edits into artificial activity commits.

Update this file only when one of these changes:

- architecture/source-of-truth rule;
- validated milestone/build checkpoint;
- active integration/deployment state;
- major blocker;
- next product priority.

Use Issue #35 for routine work handoffs instead of adding status files or diary entries here.

## 13. Definition of done for the current phase

The current phase is done when a real human can use a development build created from merged green `main` and complete the request-first flow in Paystack test mode:

1. renter authenticates with verified email;
2. renter sends a soft request with contact phone and broad Lagos service area;
3. owner or MMG approves without locking inventory;
4. MMG contacts the renter and explicitly opens the 30-minute payment window;
5. renter completes Paystack test payment;
6. trusted verification creates a confirmed booking or truthful intervention state;
7. renter, owner, and authorized staff surfaces agree on the trusted state;
8. overlapping dates cannot double-book under concurrency.

A sandbox MVP pilot and a public paid launch are separate gates. Production configuration, live Paystack, App Store release/security/privacy checks, and real-money operational policies require explicit launch approval.