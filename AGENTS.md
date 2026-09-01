# MMG Concierge — Global Agent Context

Repository-wide operating handoff for every coding agent working on MMG Concierge. Read this file first, then the task-specific source documents before editing code.

`CLAUDE.md` remains the detailed engineering guide. `apps/admin/AGENTS.md` remains the Next.js-specific admin guide. This file is the cross-surface source of truth for locked product rules, active implementation state, environment safety and validation gates.

## 1. Project identity and authority

- Product: Lagos-first marketplace for chauffeured luxury-car rentals.
- Mobile: React Native + TypeScript + Expo Router, EAS custom development builds, React Native Firebase. Expo Go is unsupported for acceptance testing.
- Admin: Next.js App Router.
- Backend: Firebase Auth, Firestore, Functions v2 Node 22, Storage, FCM, App Check, Cloud Logging.
- Functions region: `africa-south1`.
- Scheduler region where required: `europe-west1`.
- Admin App Hosting region: `europe-west4`.
- Development project: `mmg-concierge-dev`.
- Controlled production project: `mmg-concierge`.
- Topology: local Emulator Suite -> cloud development -> controlled production. No MVP staging project.

Resolve conflicting guidance in this order:

1. Locked rules in the current user request/conversation.
2. `docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md`.
3. Relevant sequence/sprint specification or accepted ADR.
4. `docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`.
5. Current implementation/status documents.
6. Older proposals, donor branches, screenshots and fixtures as historical/reference material only.

Never silently invent or rename a schema, state, role, collection, financial rule, security boundary or business policy.

## 2. Locked product and architecture invariants

### Product

- Every MVP rental includes chauffeur and delivery. No self-drive.
- Lagos-first. No live tracking in MVP.
- Renter profile requires full name, verified email, verified phone and delivery address. Do not require renter government ID, licence, selfie, DOB or profile photo.
- Owner verification state: `draft -> submitted -> under_review -> approved/rejected`, with `suspended/revoked` where defined.
- Vehicle moderation: `draft -> pending_review -> approved/rejected`.
- Vehicle visibility: `paused <-> active -> deleted`.
- Only approved + active + discoverable vehicles are served to renter discovery.
- Exact vehicle address/coordinates and persistent owner identifiers remain private.
- Booking dates are `YYYY-MM-DD` Africa/Lagos date-only half-open intervals `[startDate, endDate)`.
- Money is integer NGN kobo and server-authoritative.

### Canonical collections

Use the current canonical collections only unless an ADR/migration explicitly changes them:

- `users`
- `renterProfiles`
- `ownerProfiles`
- `ownerVerifications`
- `ownerPayoutProfiles`
- `vehicles`
- `vehiclePrivate`
- `vehicleRevisions`
- `vehicles/{id}/images`
- `vehicleAvailability`
- `bookingBlocks`
- `bookingIntents`
- `bookings`
- `payments`
- `paymentEvents`
- `refunds`
- `bookingCases`
- `conversations/messages`
- `wallets/entries`
- `withdrawalRequests`
- `deviceTokens`
- `notificationOutbox`
- `adminAuditLogs`
- `systemConfig/public/private`
- `dataRightsRequests`

Do not add parallel `listings`, `publicVehicles`, `vehiclePublic` or equivalent read-model collections without a reviewed ADR.

### Admin roles

Exactly:

- `support`
- `vehicle_admin`
- `verification_admin`
- `finance_admin`
- `privacy_admin`
- `super_admin`

Never introduce `booking_admin`. The architecture's non-financial “Operations admin” booking-case responsibility maps in R5 to `support` and `super_admin`. `finance_admin` remains reserved for financial/refund actions.

### Security

- Firestore/Storage client access is deny-by-default.
- Critical state writes are server-authoritative through trusted Functions/Admin SDK services.
- Renter discovery crosses authenticated, App-Check-protected Functions. Renter clients never directly read trusted vehicle/private image records.
- Use Secret Manager for provider secrets.
- Never log or prompt with secrets, full provider payloads, exact coordinates, government IDs, bank data, chat content or other unnecessary PII.
- Strip EXIF/GPS from renter-visible vehicle media.
- Admin money/privacy/approval/access mutations require audit evidence and a reason where applicable.
- MFA remains required before admin release.

## 3. Booking/payment source of truth

Payment-first flow:

```text
server-priced intent
  -> atomic full-interval checkout hold
  -> server Paystack initialization
  -> hosted checkout
  -> signed webhook / authenticated reconciliation
  -> independent Paystack verification
  -> exact reference + environment + success + NGN + kobo amount match
  -> atomic payment value delivery
  -> paid_pending_owner
  -> owner confirm OR owner reject + intervention
```

Locked payment rules:

- Callback/deep link is UX only and never payment truth.
- Paystack transaction references are server-generated and must satisfy shared `paymentReferenceSchema`: ASCII alphanumeric plus `-`, `.`, `=` only.
- Webhook signatures use raw-body HMAC SHA-512 via `x-paystack-signature` before JSON processing.
- Persist only normalized provider facts needed for reconciliation plus a body digest. Never persist the full webhook payload or signature.
- `charge.success` is independently verified through Paystack Verify Transaction before value delivery.
- Development payment integration is test-mode only. A live key must be rejected before any provider network request until a separate controlled-production change enables live mode.
- Duplicate payment events must never duplicate bookings, blocks, notifications, refunds or other financial effects.
- No automated test may charge live Paystack or mutate production.

### R2 trusted checkout initialization

- Client supplies only `intentId` plus command envelope/idempotency key.
- Server derives renter identity/email/phone, amount, currency and reference.
- Checkout requires Firebase-authenticated email + phone evidence matching the active renter profile.
- Stable payment/reference is reserved transactionally before the Paystack network call.
- Hosted checkout replay is allowed only while the hold remains active.
- Paystack network calls never occur inside Firestore transaction retry scope.

### R3 trusted verification

- `paymentEvents` is server-only and client unreadable/unwritable.
- R3 `verified_success` is evidence only. It does not itself deliver booking value.
- Provider verification matches local reference, configured environment, `success`, `NGN` and exact authoritative amount.
- Event processing is idempotent and retry-safe. Terminal mismatches must not loop indefinitely.

### R4 trusted value delivery

R4 consumes only persisted `verified_success` evidence. It has exactly two successful-charge outcomes:

1. `payments.state = succeeded`, intent `paid`, exact interval secured as `paid`, booking `paid_pending_owner`.
2. `payments.state = succeeded`, intent `paid_conflict`, one urgent intervention case when a late verified payment collides with another blocking interval.

Neither outcome can claim owner confirmation.

R4 invariants:

- Service input is only a persisted payment-event ID. Reference, amount, currency, dates and target states are re-read server-side.
- IDs used by retryable Firestore transactions are generated before transaction retry scope.
- Active-hold delivery atomically owns payment success, intent state, paid block, booking/case, availability sentinel, audit/outbox and event-consumption effects.
- R4 booking preserves immutable `priceSnapshot`, renter-safe `vehicleSnapshot`, `intentId`, `paymentId`, reference and existing `blockId` convention.
- A preexisting checkout block must still be the exact matching `held` block for the intent/renter/owner/vehicle/date interval before R4 overwrites it.
- The availability sentinel must already exist with a safe nonnegative integer version. Missing/malformed sentinel never becomes version zero.
- Expired hold may be atomically reacquired only if no competing blocking interval exists.
- Two overlapping late verified payments serialize through the sentinel + block reads. Exactly one can win the dates; the other becomes `paid_conflict`. Both real payments remain `succeeded`.
- Same-event retry and distinct verified-success events for the same succeeded payment reuse the original value effect.
- Durable R3 `verified_success` retry can finish R4 without another provider verification.
- Authenticated renter reconciliation uses the same R3-to-R4 processor. No renter-specific verify-to-paid path exists.

## 4. Owner response, intervention and renter checkout rules

- Owner confirm/reject is allowed only from `paid_pending_owner`.
- Owner rejection requires a meaningful reason, releases the paid interval and opens `intervention_required` / an intervention case.
- There is no automatic owner-rejection timeout.
- Owner response SLA is private configuration `ownerResponseSlaMinutes`; architecture default is 30 minutes.
- Exceeding owner response SLA creates an idempotent operations alert only. It must not change booking/payment/block state and must recheck booking state transactionally before recording the alert.
- R5 treats the R4 paid availability record as an integrity boundary. A `paid_pending_owner` booking may advance only when its exact `paid` block exists and matches booking/intent/renter/owner/vehicle/date bindings.
- R5 owner response requires an existing valid availability sentinel. Missing/malformed sentinel fails closed with no partial booking, block, case, audit or outbox writes.
- R5 non-financial case handling implements only `open -> sourcing_alternative`, authorized to `support`/`super_admin`, idempotent, and audited in both domain and `adminAuditLogs` records.
- `startBookingCaseSourcing` cannot accept a refund amount, replacement vehicle, top-up, reassignment, close-case result or other financial/resolution input.
- R6 mobile checkout may initialize payment and request reconciliation, but it never supplies trusted amount/currency/reference/state and never treats browser return/callback as payment truth.
- R6 presents “Payment received — confirming your ride” only when trusted reconciliation returns R4 `paid_pending_owner` value delivery.
- Provider `success` without R4 value-delivery outcome remains a checking state and cannot render success.
- Reconciliation polling uses fresh command keys so each poll can observe advancing provider state; payment initialization retries for the same intent reuse one initialization idempotency key.
- Do not invent reassignment, cancellation or refund economics. Alternative locking, renter acceptance, top-up and refund actions remain separately gated by approved policy/financial implementation.

## 5. Current implementation status

Snapshot: **2026-09-01**.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| Phase 1 | ✅ Complete | Experience foundation |
| Sequence 1 | ✅ Merged | Owner verification pipeline |
| Sequence 3 | ✅ Foundation complete | Renter trips, availability and owner-response foundation |
| WP0 | 🔶 Mostly complete | Remaining quote-preview/versioned-pricing cleanup |
| WP1 | 🔶 Foundation complete | Phone UX/linking, erasure workflow, MFA remain |
| WP2 | 🔶 Core complete | Vehicle upload GC remains |
| WP3 | ✅ S1 hardening complete | Discovery/storage boundary validated |
| WP4 | 🔶 Active sprint | R0-R5 validated; R6 renter checkout UX active |
| WP5 | ⏳ Not started | FCM/chat/lifecycle |
| WP6 | ⏳ Not started | Ledger/wallets/withdrawals |
| WP7 | 🔶 Partial | Admin modules incomplete |
| WP8 | ⏳ Not started | Release hardening |

### Validated WP4 checkpoints

- R1 adapter/contracts green after Paystack reference correction.
- R2 green at `67359ba`: Functions 277 passed / 12 skipped; serialized Functions emulator 289 passed across 32 files; root 554 passed / 47 skipped; Admin 66 passed; all typecheck/lint/build/check gates clean.
- R3 green at `89f1b0c`: Functions 289 passed / 18 skipped; serialized Functions emulator 307/307 across 36 files; root 568 passed / 55 skipped; Admin 66/66; Firestore Rules 20/20; webhook 7/7; verification service 5/5; verification repository 5/5; terminal verification 1/1; payment-event Rules 2/2.
- Storage Rules follow-up is green 17/17 under the standard repository command after null-guard and emulator-project alignment fixes.
- R4 green at `edd5a485e0f2b447df5ffddfcde388c1a9e83dd2`: Functions unit 299 passed / 30 skipped; serialized Functions emulator 329/329 across 40 files; root 583 passed / 67 skipped; Admin 66/66; Firestore Rules 20/20; Storage Rules 17/17; all Functions/Mobile/Admin typechecks, Functions build, Mobile/Admin lint, `npm run check` and `git diff --check` passed. Focused R4 unit 28/28 and transactional emulator 20/20.
- R5 green at `2278ef43b4de379a4a90619a0e64bf931e288e3b`: parent checkpoint validation passed Functions typecheck/build, Functions unit 323 passed / 43 skipped, focused R5 unit 46/46, focused R5 emulator 13/13, root 610 passed / 80 skipped, Admin 66/66, Mobile/Admin typecheck/lint, `npm run check`, Firestore Rules 20/20, Storage Rules 17/17 and `git diff --check`; the test-only canonical R4 fixture follow-up then passed the serialized Functions emulator **366/366 across 45/45 files**, with clean working tree and `git diff --check`.
- No R1-R5 validation configured a Paystack secret, made a real Paystack request, deployed Firebase or mutated production.

### R6 active checkpoint

R6 starts from validated R5 head `2278ef43`.

Checkpoint 1 implements the client trust boundary and awaits validation:

- native and web `PaymentCheckoutGateway` implementations call only `initializeBookingPayment` and `reconcilePayment` in `africa-south1`;
- shared payment schemas parse every callable command/result;
- initialization retries for one intent reuse an idempotency key;
- reconciliation polls use fresh command keys so provider status can advance;
- pure checkout-state mapping covers pending/checking, payment received, paid conflict, abandoned, failed/reversed and expired hold;
- a succeeded provider/payment result without `valueDeliveryOutcome` fails safe to `checking`;
- no hosted-browser callback is treated as truth.

R6 still needs hosted checkout opening, bounded reconciliation polling, renter-facing screen states, callback/deep-link checking route, no-arrow CTA cleanup and exact-head validation.

## 6. Firebase development checkpoint

`mmg-concierge-dev` currently has:

1. Registered iOS, Android and Admin web apps.
2. Email/Password and Google Auth enabled.
3. Standard/Native Firestore in `africa-south1` with hardened Rules/indexes.
4. 22 Node 22 Functions in `africa-south1`, including protected discovery Functions.
5. Default Storage bucket `mmg-concierge-dev.firebasestorage.app` in `africa-south1` with validated Rules.
6. Native iOS App Check/Auth discovery smoke passed.
7. Media metadata-strip/promotion/demotion/cleanup lifecycle passed.
8. Owner verification cleanup scheduler exists.

R2-R6 payment/paid-booking changes remain **undeployed**. Production `mmg-concierge` remains untouched and is not a development target.

## 7. Active branch and donor restrictions

- Active repository: `franklinnweke/mmgconciergeapp`.
- Active branch: `codex/wp4-paystack-booking-reconciliation`.
- R6 base: validated R5 head `2278ef43b4de379a4a90619a0e64bf931e288e3b`.
- Sprint source: `docs/implementation/WP4_PAYSTACK_BOOKING_RECONCILIATION_SPRINT.md`.
- Checkpoints: `docs/implementation/WP4_R2_CHECKPOINT.md`, `WP4_R3_CHECKPOINT.md`, `WP4_R4_CHECKPOINT.md`, `WP4_R5_CHECKPOINT.md`.
- Old `codex/wp4-booking-operations` is donor/reference only and must not be merged/cherry-picked wholesale.
- Reject donor `booking_admin`, renter verify-to-paid as payment truth, invented cancellation/refund policy, automatic owner-rejection timeout, old seed/schema copies and unrelated fleet/UI work.

An unrelated local checkout previously pointed to `franklinnweke/mmgconciergeweb` and had a corrupt local ref. Do not use it as repository truth. Validation should use a clean clone of `mmgconciergeapp` when necessary.

## 8. Validation gates

Firebase Emulator Suite requires Java 21+. Temurin 25 is known-good.

Minimum cross-package WP4 gate:

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
git diff --check
```

`npm run test:functions:emulator` must remain serialized at the Vitest file level while emulator suites share a Firestore project/collection namespace.

For publication validation, also run when applicable:

```bash
npm run test:rules
npm run test:storage-rules
```

Payment/booking acceptance includes:

- no client-supplied trusted amount/currency/reference/payment state;
- Paystack supported reference alphabet only;
- live key rejected in development before network call;
- raw-body webhook signature validation before parsing;
- exact independent provider verification;
- `paymentEvents` client denial;
- one payment at most one booking/conflict value effect;
- late-payment concurrency produces one winner and one `paid_conflict`, both payments succeeded;
- callback/browser-return-only path produces zero value;
- owner confirm/reject accepts R4 booking/block unchanged;
- owner response cannot proceed with missing/mismatched paid block or missing/malformed sentinel;
- owner rejection opens intervention without automatic refund;
- SLA alert is idempotent and state-neutral;
- no automatic owner-response timeout;
- case sourcing allows only support/super_admin, `open -> sourcing_alternative`, and writes both domain/admin audit evidence;
- case sourcing cannot initiate refund, select an alternative, alter booking/payment/block state or close a case;
- renter checkout success copy is gated by trusted R4 value-delivery outcome, never by Paystack browser return or provider status alone.

## 9. Agent execution protocol

Every clean agent-authored commit must update this root `AGENTS.md` in the same commit so downstream agents can reconstruct state. Temporary connector/WIP commits may exist only while assembling a bounded checkpoint and must be rewritten out before publication.

1. Start from the current branch/head and preserve unrelated changes.
2. Declare bounded scope.
3. Read this file, the relevant sprint/architecture docs and nearest tests.
4. Change contracts/domain first when contracts change, then server/repository/Rules, then Admin/Mobile consumers.
5. Prefer existing injectable gateways/repositories and canonical services.
6. Financial/payment changes require server authority, idempotency, transaction safety and audit evidence.
7. Never trust provider callback/client state for value delivery.
8. Generate durable IDs outside retryable Firestore transaction callbacks.
9. Availability-changing transactions read existing valid sentinel + relevant blocks before writes.
10. Fail closed rather than recreating missing financial/availability invariants.
11. Do not silently replace provider failures with fixtures.
12. No fake/test adapter may be selectable in production.
13. No automatic refund, cancellation economics or owner-timeout transition without approved policy.
14. Use only canonical staff roles; map product-language roles onto those claims explicitly rather than adding claims.
15. SLA schedulers may alert operations but never mutate booking state automatically.
16. Intervention commands must stay bounded to approved lifecycle transitions and must not smuggle financial policy through generic case updates.
17. Mobile checkout/browser return may trigger reconciliation only; never infer payment success client-side.
18. Run narrow tests first, then the full gate for cross-package/security/financial checkpoints.
19. Update detailed status docs when milestone evidence changes.
20. End with summary, files changed, tests/evidence, risks/blockers and next task.

## 10. Definition of done

A feature is not complete because code exists or a screen renders. Contracts, domain transitions, authorization, provider verification, Rules/indexes, server boundaries, client states, tests, documentation and operational failure behavior must agree.

Controlled commercial flow:

```text
approved owner
  -> approved active chauffeured vehicle
  -> Lagos discovery
  -> atomic date hold
  -> server-priced Paystack checkout
  -> signed/verified payment truth
  -> paid_pending_owner
  -> owner confirmation or intervention
  -> completed rental
  -> immutable ledger credit
  -> admin-approved manual withdrawal
```

WP4 may make **development Paystack test-mode** payment real. It does not imply production settlement, completed refund economics, WP5 chat/FCM, or WP6 wallet/ledger completion.
