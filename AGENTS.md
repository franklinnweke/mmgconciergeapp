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
| WP4 Paystack/booking | `docs/implementation/WP4_PAYSTACK_BOOKING_RECONCILIATION_SPRINT.md`, architecture §§3.7–3.10, 6–9, ADR 0005, current booking Functions/tests |
| Admin work | `apps/admin/AGENTS.md`, admin `CLAUDE.md`, auth/session and relevant gateway/service tests |
| UI/brand/motion | Overall design plan, `packages/brand`, frontend conventions |
| Wallet/refund/withdrawal | Architecture §§3.8–3.10 and 9; ADR 0005; WP6. Do not invent policy. |

## 4. Locked architecture invariants

- Firebase is the backend: Auth, Firestore, Storage, Functions v2, App Check, FCM, Crashlytics and Cloud Logging.
- Topology: Emulator Suite locally, `mmg-concierge-dev` for cloud development/integration, `mmg-concierge` for controlled/public production. No MVP staging project.
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
- Paystack webhooks require HMAC SHA-512 signature verification and independent server verification of reference, status, currency and exact amount before value delivery.
- Duplicate payment events must never duplicate bookings, blocks, notifications, refunds or financial effects.
- Late verified payment after hold expiry may become `paid_conflict`; never double-book.
- Owner rejection requires a reason, releases the interval and opens intervention. No automatic owner-rejection timeout.
- Do not invent renter cancellation/refund economics.
- Chat is payment-gated; wallet value is completion-gated. WP5/WP6 remain separate exit gates.
- Expo Go is unsupported for native Firebase acceptance testing.
- Decorative arrows are not permitted in CTA/button labels; arrows are reserved for functional navigation.

## 5. Current milestone snapshot

Snapshot date: **2026-08-31**.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| Phase 1 | ✅ Complete | Experience foundation |
| Sequence 1 | ✅ Merged | Owner verification pipeline |
| Sequence 3 | ✅ Foundation complete | Renter trips/booking foundation |
| WP0 | 🔶 Mostly complete | Client quote preview can still diverge from versioned server pricing |
| WP1 | 🔶 Foundation complete | Phone verification, erasure workflow and MFA remain |
| WP2 | 🔶 Core complete | Vehicle inventory/moderation/image pipeline/fleet UI delivered; vehicle-upload GC remains |
| WP3 | ✅ S1 hardening complete | Functions-backed discovery + hardened Rules live in development |
| WP4 | 🔶 Active sprint | R0 locked; R1 green at `caf1efa`; Paystack reference-format correction applied and must be revalidated before R2 |
| WP5 | ⏳ Not started | FCM/chat/lifecycle |
| WP6 | ⏳ Not started | Ledger/wallets/withdrawals |
| WP7 | 🔶 Partial | Admin modules incomplete |
| WP8 | ⏳ Not started | Release hardening |

### Firebase development checkpoint

`mmg-concierge-dev` currently has:

1. Registered iOS, Android and Admin web apps; Email/Password and Google Auth enabled.
2. Standard/Native Firestore in `africa-south1` with hardened S1 Rules/indexes.
3. 22 Node 22 Functions in `africa-south1`, including protected discovery detail/search.
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
- Post-gate review found that R1's generic payment-reference schema and underscore fixtures did not match Paystack's transaction-reference alphabet. The correction exports and tightens `paymentReferenceSchema`, replaces underscore fixtures, and adds positive/negative contract coverage. Re-run the R1 gate before starting R2.
- Old branch `codex/wp4-booking-operations` is **donor/reference only**. It is 56 commits behind current `main` and must not be merged or cherry-picked wholesale.
- Donor code may be manually salvaged only after reconciliation with current contracts, roles, booking-block model and architecture.
- Specifically reject donor `booking_admin`, renter-triggered verify-to-paid as payment truth, invented cancellation/refund policy, auto owner rejection timeout, unrelated seed/asset/UI changes and old schema copies.

The following are not live merely because donor code or R1 adapter code exists:

1. Paystack production payments.
2. A callable that initializes booking payment in Firestore.
3. Verified webhook processing that creates a trusted paid booking.
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
npm test
npm run typecheck
npm run lint
npm run admin:typecheck
npm run admin:lint
npm run admin:test
npm run check
git diff --check
```

When Firestore/Storage Rules or indexes change, also run:

```bash
npm run test:rules
npm run test:storage-rules
```

Payment-specific acceptance must include:

- Paystack initialize/verify adapter tests for provider failure and malformed payloads.
- Paystack reference contract accepts only alphanumeric plus `-`, `.`, `=` and rejects `_`, `/`, spaces and other unsupported characters.
- Valid/missing/invalid webhook signature tests.
- Duplicate/replayed event tests.
- Wrong reference, wrong currency and wrong amount tests.
- Concurrent hold/payment tests.
- Callback/deep-link-only path proves zero value delivery.
- Late payment after expired hold + dates taken produces `paid_conflict`, not a double booking.

No automated test may charge live Paystack or mutate production.

## 7. Agent execution protocol

### Commit/status synchronization policy

Every agent-authored commit must update this root `AGENTS.md` in the same commit so downstream agents can reconstruct roadmap and operational state. Do not record a commit’s own SHA inside that same commit. GitHub merge commits are the exception; the first following agent commit reconciles this file.

1. Start with `git status -sb`; preserve unrelated changes.
2. Declare bounded scope before editing.
3. Read required context and nearest tests.
4. Change contracts/domain first, then server/repository/Rules, then Admin/Mobile consumers.
5. Prefer existing injectable gateways/repositories and canonical services.
6. Financial/payment state changes require idempotency and audit evidence.
7. Provider callbacks are not trusted state transitions.
8. Fake/test payment adapters must be impossible to select in production.
9. For production paths, fail closed; never silently replace failed live calls with fixtures.
10. Run narrow tests, then the full gate when crossing package/security/financial boundaries.
11. Update this file and detailed status docs when evidence changes milestone state.
12. End with summary, files changed, tests run, assumptions, risks, blockers and next task.

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
