# MMG Concierge — Global Agent Context

This is the repository-wide operating handoff for every coding agent working on MMG Concierge. Read this file first, then the task-specific source documents before editing code.

`CLAUDE.md` remains the detailed engineering guide. `apps/admin/AGENTS.md` remains the generated Next.js-specific guide. This file is the cross-surface coordination layer and current milestone snapshot.

## 1. Project identity

- Product: Lagos-first marketplace for chauffeured luxury-car rentals.
- Firebase projects: `mmg-concierge-dev` for cloud development/integration and `mmg-concierge` for controlled/public production.
- Runtime surfaces:
  - `apps/mobile`: Expo Router React Native renter/owner app.
  - `apps/admin`: private Next.js staff operations portal.
  - `apps/functions`: Firebase Cloud Functions v2, Node 22, `africa-south1`.
  - `packages/contracts`: shared Zod schemas/DTOs/constants/errors.
  - `packages/domain`: pure money/date/privacy/state-machine logic.
  - `packages/brand`: shared MMG visual tokens.
  - `firebase`: Firestore/Storage Rules, indexes and emulator tests.

## 2. Authority and document precedence

When documents disagree, resolve them in this order:

1. Locked product rules in the current user request/conversation.
2. `docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md`.
3. Relevant detailed sequence specification, sprint handoff or accepted ADR.
4. `docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`.
5. `docs/WP0_WP2_IMPLEMENTATION_STATUS.md` and `docs/IMPLEMENTATION_PHASES.md`.
6. Older proposals, PDFs, external repositories, fixtures and screenshots as historical/reference material only.

If status documents conflict with code or Git history, report the discrepancy, verify it, and update the status source in the same bounded change when appropriate. Never silently invent a new state, role, collection, financial rule or permission.

## 3. Context map

| Task | Required context |
|---|---|
| Any task | This file, `CLAUDE.md`, current `git status`, relevant package tests |
| Product/business rule or architecture change | Architecture handoff §§2–4, 5–12, 14–16 |
| Contracts, money, dates, transitions | `packages/contracts`, `packages/domain`, ADRs 0001–0003 |
| Owner verification | Sequence 1 spec, owner Functions/Mobile/Admin files |
| Renter profile/privacy/deletion | WP1 completion plan, renter Functions/Mobile, Rules |
| Vehicle inventory/moderation | Sequence 2/3 spec, WP0/WP2 status, vehicle Functions/Admin, Rules |
| Discovery/search/detail | Architecture §§3.5, 6.5, 8.4; Firestore schema evolution S1; discovery Functions/Mobile |
| Firebase Auth/App Check/Firestore/Storage | Firestore schema plan, Firebase dev runbook, `firebase/`, Mobile Firebase core, Functions deploy entrypoint |
| WP4 Paystack/booking | `docs/implementation/WP4_PAYSTACK_BOOKING_RECONCILIATION_SPRINT.md`, `docs/implementation/WP4_R2_CHECKPOINT.md`, `docs/implementation/WP4_R3_CHECKPOINT.md`, `docs/implementation/WP4_R4_CHECKPOINT.md`, architecture §§3.7–3.10, 6–9, ADR 0005, current booking Functions/tests |
| Admin work | `apps/admin/AGENTS.md`, admin `CLAUDE.md`, auth/session and relevant gateway/service tests |
| UI/brand/motion | Overall design plan, `packages/brand`, frontend conventions |
| Wallet/refund/withdrawal | Architecture §§3.8–3.10 and 9; ADR 0005; WP6. Do not invent policy. |

## 4. Locked architecture invariants

- Firebase is the backend: Auth, Firestore, Storage, Functions v2, App Check, FCM, Crashlytics and Cloud Logging.
- Topology: Emulator Suite locally, `mmg-concierge-dev` for cloud development/integration and `mmg-concierge` for controlled/public production. No MVP staging project.
- Firestore client access is deny-by-default; trusted state is written through Admin SDK/services.
- Renter vehicle list/search/detail crosses authenticated, App-Check-protected Functions. Trusted vehicle/image records are never renter-readable Firestore documents.
- Do not add parallel `listings`, `publicVehicles` or duplicate vehicle read-model collections without a reviewed ADR.
- All money is integer NGN kobo and server-authoritative.
- Dates are `YYYY-MM-DD` in `Africa/Lagos`; intervals are half-open `[startDate, endDate)`.
- Mutations are contract-first, authorized, schema-validated, transactional where needed, audited and idempotent.
- Owner/vehicle approval precedes public discoverability.
- Exact addresses/coords, plates, persistent owner IDs, private storage paths, IDs, moderation notes, payout data and processing internals never cross renter discovery DTOs.
- Admin roles are exactly `support`, `vehicle_admin`, `verification_admin`, `finance_admin`, `privacy_admin`, `super_admin` unless a reviewed architecture change says otherwise.
- Every MVP rental includes chauffeur and delivery.
- Payment-first: server price/hold -> server Paystack initialization -> verified provider event -> `paid_pending_owner` -> owner confirm/reject.
- Callback/deep links are UX only and never payment truth.
- Paystack transaction references are generated server-side and must satisfy the shared `paymentReferenceSchema`: ASCII alphanumeric characters plus `-`, `.`, and `=` only. Do not use `_`, `/`, spaces or a second validator.
- Paystack webhooks are public HTTP transport but trusted only after raw-body HMAC SHA-512 verification using `x-paystack-signature`.
- Signed webhook ingestion persists only minimal normalized event facts plus a body digest. Do not persist full provider payloads or signatures.
- `charge.success` is still independently verified through Paystack Verify Transaction before any booking-value transition.
- Independent verification must match local payment reference, configured environment, `success` status, `NGN` currency and exact authoritative kobo amount.
- R3 `verified_success` is evidence only. R4 is the first boundary allowed to atomically transition trusted payment and booking value.
- R4 value delivery has exactly two trusted outcomes: `paid_pending_owner` when the dates are atomically secured, or `paid_conflict` when a real late payment collides with another blocking interval. Both outcomes record the payment as `succeeded`; neither may claim owner confirmation.
- R4 value delivery accepts only a persisted verified payment-event ID at the service boundary. Reference, amount, currency, dates, and target states are re-read server-side and are never accepted from the client or provider callback payload as transition input.
- IDs used by the R4 transaction are generated once before entering Firestore transaction retry scope so retries remain stable and duplicate-safe.
- R4 active-hold delivery atomically owns payment success, intent `paid`, held-block conversion to `paid`, version-1 `paid_pending_owner` booking creation, availability-sentinel advancement, audit evidence, one owner outbox record, and payment-event consumption.
- R4 paid bookings preserve the immutable intent `priceSnapshot` and renter-safe `vehicleSnapshot`, and carry `intentId` so the renter Trips layer suppresses the superseded intent card. The booking uses the existing `blockId` convention required by owner confirm/reject.
- If the original checkout hold has expired, R4 re-reads the availability sentinel plus overlapping blocks inside the same transaction. If no active blocker remains, it reacquires the exact interval as `paid`; otherwise it records `paid_conflict`, opens one urgent booking case, and creates no booking.
- The intent's preexisting block, when present at R4 value delivery, must still be the exact matching `held` block for that intent/renter/owner/vehicle/date interval. Any other state or binding is an integrity failure and must fail closed with no partial value writes.
- R4 requires an existing vehicle availability sentinel with a safe nonnegative integer version. A missing or malformed sentinel is never treated as version zero at value delivery.
- Two overlapping late verified payments must serialize through the sentinel and block reads so exactly one can reacquire the dates. The losing charge is still `succeeded` and must become `paid_conflict`; never downgrade a real provider payment to failed/abandoned and never double-book.
- R4 idempotency is payment/value scoped: same-event retry and a second distinct `verified_success` event for the same succeeded payment must reuse the original booking/conflict effect rather than create a second booking, block, outbox or audit effect.
- R3-to-R4 orchestration must re-read durable event state after verification. A retry after `verified_success` was already committed can finish R4 without another provider verification or duplicate value effect.
- Authenticated renter reconciliation invokes the same trusted R3-to-R4 processor. There is no separate renter verify-to-paid path.
- `paymentEvents` is server-only and client unreadable/unwritable.
- Duplicate payment events must never duplicate bookings, blocks, notifications, refunds or financial effects.
- Late verified payment after hold expiry may become `paid_conflict`; never double-book.
- Owner rejection requires a reason, releases the interval and opens intervention. No automatic owner-rejection timeout.
- Do not invent renter cancellation/refund economics.
- Checkout requires Firebase-authenticated phone evidence plus matching active renter profile data. A manually stored phone string alone is not sufficient payment eligibility.
- Development payment integration is test-mode only. A live Paystack key must be rejected before any provider request until a separate controlled-production change explicitly enables live mode.
- Hosted checkout URLs are valid only while their atomic booking hold remains active; idempotent replay after hold expiry fails closed.
- Emulator-backed Functions suites that share the same Firestore project/collections must run with file parallelism disabled. Do not rely on destructive per-file cleanup while Vitest runs emulator files concurrently.
- Event-driven payment verification may retry transient failures, so processors must remain idempotent and terminal mismatch states must complete without retry loops.
- Storage Rules cross-service Firestore lookups must guard nullable documents/data before dereferencing fields. Keep Storage Rules within Firebase's two Firestore document-access calls per evaluation.
- Storage Rules emulator fixtures must use `mmg-concierge-dev`, matching `firebase/.firebaserc`; cross-service Storage/Firestore tests must never split data across different emulator project IDs.
- Chat is payment-gated; wallet value is completion-gated. WP5/WP6 remain separate exit gates.
- Expo Go is unsupported for native Firebase acceptance testing.
- Decorative arrows are not permitted in CTA/button labels; arrows are reserved for functional navigation.

## 5. Current milestone snapshot

Snapshot date: **2026-09-01**.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| Phase 1 | ✅ Complete | Experience foundation |
| Sequence 1 | ✅ Merged | Owner verification pipeline |
| Sequence 3 | ✅ Foundation complete | Renter trips/booking foundation |
| WP0 | 🔶 Mostly complete | Client quote preview can still diverge from versioned server pricing |
| WP1 | 🔶 Foundation complete | Phone verification UX/linking, erasure workflow and MFA remain |
| WP2 | 🔶 Core complete | Vehicle inventory/moderation/image pipeline/fleet UI delivered; vehicle-upload GC remains |
| WP3 | ✅ S1 hardening complete | Discovery/storage hardening green; Storage Rules standard gate 17/17 |
| WP4 | 🔶 Active sprint | R0/R1/R2/R3 complete; R4 implementation complete and awaiting exact publication-commit validation |
| WP5 | ⏳ Not started | FCM/chat/lifecycle |
| WP6 | ⏳ Not started | Ledger/wallets/withdrawals |
| WP7 | 🔶 Partial | Admin modules incomplete |
| WP8 | ⏳ Not started | Release hardening |

### Firebase development checkpoint

`mmg-concierge-dev` currently has:

1. Registered iOS, Android and Admin web apps; Email/Password and Google Auth enabled.
2. Standard/Native Firestore in `africa-south1` with hardened S1 Rules/indexes.
3. 22 Node 22 Functions in `africa-south1`, including protected discovery detail/search. R2/R3/R4 payment Functions remain undeployed.
4. Private owner-verification cleanup scheduler via OIDC.
5. Default Storage bucket `mmg-concierge-dev.firebasestorage.app` in `africa-south1` with Storage Rules.
6. Verified native iOS App Check/Auth discovery smoke and live media metadata-strip/promotion/demotion/cleanup lifecycle.

Production `mmg-concierge` is not a development target. Do not seed, reprovision, loosen, deploy to or clean production during ordinary sprint work.

### Current GitHub baseline and active sprint

- `main` baseline: `87ad89e`, squash merge of PR #19 (`security(discovery): harden renter data boundary and development storage`).
- Active branch: `codex/wp4-paystack-booking-reconciliation`, created from that exact baseline.
- Sprint source: `docs/implementation/WP4_PAYSTACK_BOOKING_RECONCILIATION_SPRINT.md`.
- R0 is complete: architecture/donor reconciliation is committed and locked.
- R1 adds `@mmg/contracts/payment`, a narrow `PaymentGateway` interface and a server-only Paystack initialize/verify adapter. The shell gate at `caf1efa` passed: Functions 268 tests with 7 skipped, root 543 tests with 42 skipped, Admin 66 tests, typecheck/lint/build/check and `git diff --check` clean. No live Paystack call or Firebase mutation occurred.
- The Paystack transaction-reference correction at `c923c8a` was revalidated: Functions 268 passed / 7 skipped, root 545 passed / 42 skipped, Admin 66 passed, all typecheck/lint/build/check gates clean, no deployment or live Paystack call.
- R2 adds server-authoritative `initializeBookingPayment`, deterministic provider-safe payment identity, verified renter email/phone matching, active-hold enforcement, Firestore `payments` binding, `intent_created -> checkout_pending`, a 30-second initialization lease, idempotent pending-checkout replay, provider-result finalization, audit records, App Check-protected callable wiring, Firebase Secret Manager binding and test-mode-only Paystack enforcement. It does not create a paid booking or process webhook value.
- R2 is fully green at `67359ba`: Functions 277 passed / 12 skipped; serialized Functions emulator 289 passed across 32 files; root 554 passed / 47 skipped; Admin 66 passed; Functions/Mobile/Admin typecheck/lint/build/check and `git diff --check` clean. Payment initialization remained 5/5 and booking-intent emulator coverage 7/7 in the aggregate run. No secret, Paystack request, Firebase deploy or production mutation occurred.
- R2 validation was performed from a clean clone of `franklinnweke/mmgconciergeapp` because an unrelated older local checkout pointed to `franklinnweke/mmgconciergeweb` and had a corrupt local ref. Do not use that unhealthy checkout as repository truth.
- R3 adds raw-body signed `paystackWebhook`, a 256 KiB body limit, semantic event dedupe in server-only `paymentEvents`, retryable independent verification, owner-scoped App Check reconciliation, and exact reference/environment/status/currency/amount comparison. R3 intentionally leaves `payments.state` as `pending` and creates no booking value.
- R3 is fully green at `89f1b0c`: Functions 289 passed / 18 skipped; serialized Functions emulator 307/307 across 36 files; root 568 passed / 55 skipped; Admin 66/66; Firestore Rules 20/20; webhook 7/7; payment-verification service 5/5; R3 verification repository emulator 5/5; terminal verification emulator 1/1; payment-events Rules 2/2; all typecheck/lint/build/check and `git diff --check` gates passed. No secret, real Paystack request, Firebase deployment, booking value transition, owner notification or production mutation occurred.
- The unrelated Storage Rules regression exposed during R3 was repaired in two bounded commits: nullable cross-service Firestore lookups now fail closed, and the Storage Rules fixture uses the same `mmg-concierge-dev` project as the emulator command. The standard `npm run test:storage-rules` gate is green 17/17 with `git diff --check` clean.
- R4 starts from validated branch head `1c06896`. Its contract boundary permits only `paid_pending_owner`/intent `paid` with a booking ID, or `paid_conflict`/intent `paid_conflict` with a case ID, with payment `succeeded` in either branch.
- R4 trusted consumption service accepts only a persisted event ID, generates stable transaction IDs server-side, and validates the repository's returned transition against the canonical shared contract.
- R4 Firestore value delivery handles active holds, expired-hold reacquisition and date conflicts atomically. It records payment success exactly once, preserves immutable intent snapshots, and creates either one `paid_pending_owner` booking or one urgent `paid_conflict` case.
- R4 emulator coverage proves same-event and distinct-event success replay do not duplicate booking/outbox/audit effects; generated bookings are accepted unchanged by the existing owner response transaction.
- R4 late-payment coverage includes a two-renter concurrent race where exactly one booking and one urgent case result while both provider-confirmed payments remain `succeeded`.
- R4 now fails closed when the intent block is not the exact matching `held` block, when the availability sentinel is missing, or when the sentinel version is malformed; the attempted transaction leaves no partial value-delivery effects.
- R4 runtime orchestration wires both the retryable webhook processor and authenticated renter reconciliation through the same trusted R3-to-R4 value processor. Post-success verification recognizes `succeeded` payments without reopening value delivery.
- `docs/implementation/WP4_R4_CHECKPOINT.md` is the validation handoff. R4 is not green until the exact cleaned publication commit passes the full repository/unit/emulator/Rules gate.
- Firebase Emulator Suite requires Java 21+; machines with an older default Java must select an installed Java 21+ runtime rather than weakening/skipping the emulator gate.
- Old branch `codex/wp4-booking-operations` is **donor/reference only**. It is 56 commits behind current `main` and must not be merged or cherry-picked wholesale.
- Donor code may be manually salvaged only after reconciliation with current contracts, roles, booking-block model and architecture.
- Specifically reject donor `booking_admin`, renter-triggered verify-to-paid as payment truth, invented cancellation/refund policy, auto owner rejection timeout, unrelated seed/asset/UI changes and old schema copies.

The following are not live merely because R2/R3/R4 code exists:

1. Paystack production payments.
2. `initializeBookingPayment`, `paystackWebhook`, `processPaystackPaymentEvent`, or `reconcilePayment` in cloud development. They remain undeployed until validation and explicit test-secret setup/deployment.
3. R4 paid-booking value delivery is implemented but not validated or deployed. Do not treat it as green/live until the publication commit passes the R4 checkpoint.
4. Refund settlement.
5. In-app chat or production push notifications.
6. Ledger, wallets or withdrawals.

## 6. WP4 sprint gate

Run at the start/end of bounded tasks:

```bash
git status -sb
git log --oneline --decorate -8
```

Minimum repository gate for WP4 cross-package changes:

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

`npm run test:functions:emulator` is serialized at the Vitest file level because emulator suites currently share a Firestore project/collection namespace. It requires Java 21+.

When Firestore/Storage Rules or indexes change, also run:

```bash
npm run test:rules
npm run test:storage-rules
```

For the R4 publication checkpoint, run both Rules suites even though R4 does not intentionally change Rules.

Payment-specific acceptance must include:

- Paystack initialize/verify adapter tests for provider failure and malformed payloads.
- Paystack reference contract accepts only alphanumeric plus `-`, `.`, `=` and rejects `_`, `/`, spaces and other unsupported characters.
- R2 Firestore emulator: exact intent amount/currency binding, one payment per intent, idempotent replay, active hold enforcement and verified-profile matching.
- Development runtime rejects a live Paystack key before making a network request.
- R3 webhook HMAC tests: valid, missing/invalid signature, malformed body, oversized body, unrelated signed event, duplicate/replay.
- R3 Firestore verification: exact success leaves payment pending before R4, duplicate event one document, wrong reference/environment/currency/amount rejects, non-success stays non-paid, and post-R4 succeeded payments remain verifiable without being downgraded.
- `paymentEvents` renter/staff-client/anonymous read/list/write denial in the Firestore Rules emulator.
- R4 contract rejects any value-delivery result that overstates owner confirmation or mixes paid-booking and conflict fields.
- R4 trusted service accepts only a persisted event ID and generates transaction IDs server-side.
- R4 active-hold delivery creates exactly one paid booking/outbox/audit effect, preserves trusted snapshots, converts the hold to `paid`, and is accepted by the existing owner response path.
- R4 same-event and distinct-event verified-success replays reuse the original payment value effect and cannot create duplicate booking/block/outbox/audit effects.
- R4 expired-hold delivery reacquires only when the interval is still free; otherwise it creates one urgent `paid_conflict` case with no booking and no invented refund.
- R4 concurrent late-payment test proves one overlapping payment wins the dates and the other becomes `paid_conflict`, with both `payments.state == succeeded`.
- R4 inconsistent preexisting intent blocks, missing sentinels and malformed sentinel versions fail closed with zero partial value-delivery writes.
- R3 durable `verified_success` retry can complete R4 without another provider verification, and authenticated reconciliation invokes the same trusted R4 processor.
- Callback/deep-link-only path proves zero value delivery.

No automated test may charge live Paystack or mutate production.

## 7. Agent execution protocol

### Commit/status synchronization policy

Every agent-authored commit must update this root `AGENTS.md` in the same commit so downstream agents can reconstruct roadmap and operational state. Do not record a commit's own SHA inside that same commit. GitHub merge commits are the exception; the first following agent commit reconciles this file.

1. Start with `git status -sb`; preserve unrelated changes.
2. Declare bounded scope before editing.
3. Read required context and nearest tests.
4. Change contracts/domain first, then server/repository/Rules, then Admin/Mobile consumers.
5. Prefer existing injectable gateways/repositories and canonical services.
6. Financial/payment state changes require idempotency and audit evidence.
7. Provider callbacks are not trusted state transitions.
8. Fake/test payment adapters must be impossible to select in production.
9. For production paths, fail closed; never silently replace failed live calls with fixtures.
10. Emulator-backed Functions suites sharing Firestore state must use the serialized emulator runner unless they are explicitly isolated by project/namespace.
11. Signed webhook handlers must authenticate raw bytes before JSON parsing and acknowledge only after durable event ingestion.
12. Event-driven verification retries transient provider failures; terminal mismatches must be recorded and return without retry loops.
13. Storage Rules cross-service Firestore reads must null-guard missing documents/data, stay within the two-access-call limit, and use the same emulator project ID as the Storage test fixture.
14. R4 must consume persisted `verified_success` evidence server-side; it must never trust client-supplied payment facts when transitioning value.
15. Generate IDs outside retryable Firestore transaction callbacks when those IDs are part of durable R4 records.
16. R4 availability-changing transactions must read an existing valid vehicle sentinel and overlapping booking blocks before writes; payment, intent, block, booking/case, sentinel, audit/outbox, and event-consumption effects must commit atomically.
17. Never coerce a missing/malformed R4 sentinel to version zero and never overwrite a non-`held` intent block to manufacture a successful delivery path.
18. In a late-payment race, sentinel/block transaction retries are the serialization mechanism. Never resolve a collision by overwriting another renter's blocking record or by marking a successful provider charge failed.
19. Webhook retry and renter reconciliation must converge on the same trusted R3-to-R4 processor; never add a client-specific value transition.
20. Run narrow tests, then the full gate when crossing package/security/financial boundaries.
21. Update this file and detailed status docs when evidence changes milestone state.
22. End with summary, files changed, tests run, assumptions, risks, blockers and next task.

## 8. Definition of done

A feature is not complete because a screen renders. Contracts, domain transitions, authorization, provider verification, Rules/indexes, server read/write boundaries, client states, tests, docs and operational failure behavior must agree.

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

WP4 may make **development Paystack test-mode** payment real. It must not imply live production settlement or WP5/WP6 completion.
