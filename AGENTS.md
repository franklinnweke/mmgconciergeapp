# MMG Concierge — Global Agent Context

This is the repository-wide operating handoff for every coding agent working on MMG Concierge. Read this file first, then read the context documents required by the task before editing code.

`CLAUDE.md` remains the detailed engineering guide. `apps/admin/AGENTS.md` remains the generated Next.js-specific guide. This file is the cross-surface coordination layer and milestone snapshot.

## 1. Project identity

- Product: Lagos-first marketplace for chauffeured luxury-car rentals.
- Firebase projects: `mmg-concierge-dev` for cloud development/integration and `mmg-concierge` for controlled/public production.
- Runtime surfaces:
  - `apps/mobile`: Expo Router React Native app for renter and owner experiences.
  - `apps/admin`: private Next.js App Router staff operations portal.
  - `apps/functions`: Firebase Cloud Functions v2, Node 22, region `africa-south1`.
  - `packages/contracts`: shared Zod schemas, DTOs, constants, and canonical safe errors.
  - `packages/domain`: pure money, date, privacy, and state-machine logic; no Firebase/I/O.
  - `packages/brand`: shared MMG visual tokens.
  - `firebase`: Authentication-adjacent configuration, Firestore/Storage rules, indexes, and emulator tests.

## 2. Authority and document precedence

When documents disagree, resolve them in this order:

1. Locked product rules in the current user request/conversation.
2. [`docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md`](docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md) — final architecture and product source of truth.
3. The relevant detailed sequence specification or accepted ADR.
4. [`docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`](docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md) — work-package order and exit gates.
5. [`docs/WP0_WP2_IMPLEMENTATION_STATUS.md`](docs/WP0_WP2_IMPLEMENTATION_STATUS.md) and [`docs/IMPLEMENTATION_PHASES.md`](docs/IMPLEMENTATION_PHASES.md) — implementation status and historical checkpoints.
6. Older proposals, PDFs, external repositories, fixtures, and screenshots — historical/reference material only.

If a status document conflicts with code or Git history, report the discrepancy, verify with tests and `git log`, and update the status document in the same bounded change when appropriate. Never silently invent a new state or collection.

## 3. Context map: what to read for each task

| Task | Required context |
|---|---|
| Any task | This file, `CLAUDE.md`, current `git status`, relevant package tests |
| Product/business rule or architecture change | Architecture handoff §§2–4, 5–12, and 14–16 |
| Contracts, errors, money, dates, transitions | `packages/contracts`, `packages/domain`, ADRs 0001–0003, and the architecture handoff state-machine sections |
| Owner verification | `docs/implementation/SEQUENCE_1_OWNER_VERIFICATION_SPEC.md`, owner files under `apps/functions/src/owner`, `apps/mobile/src/features/owner`, and `apps/admin/src/features/owners` |
| Renter profile/privacy/deletion | WP1 in completion plan, `packages/contracts`, `packages/domain`, `apps/functions/src/renter`, `apps/mobile/src/features/account`, and Firestore rules |
| Vehicle inventory/moderation | `docs/implementation/SEQUENCE_2_3_VEHICLE_INVENTORY_AND_OWNER_OPERATIONS_SPEC.md`, `docs/WP0_WP2_IMPLEMENTATION_STATUS.md`, `apps/functions/src/vehicle`, `apps/admin/src/features/vehicles`, and Firebase rules/indexes |
| Renter trips/booking operations | `docs/implementation/SEQUENCE_3_COMPLETION_AGENT_HANDOFF.md`, `docs/implementation/ANTIGRAVITY_SEQUENCE_1_3_WORKPLAN.md`, `apps/mobile/src/features/booking`, and `apps/functions/src/booking` |
| Discovery/search/detail | Architecture handoff §§3.5, 6.5, 8.4; `docs/architecture/FIRESTORE_SCHEMA_EVOLUTION_PLAN.md` S1; mobile discovery feature files; Functions discovery service/tests |
| Firebase Auth/App Check/Firestore/Storage | `docs/architecture/FIRESTORE_SCHEMA_EVOLUTION_PLAN.md`, `docs/operations/FIREBASE_DEVELOPMENT_ENVIRONMENT.md`, `firebase/`, `apps/mobile/src/core/firebase`, Functions deployment entrypoint, and `CLAUDE.md` security invariants |
| Admin route or server action | `apps/admin/AGENTS.md` first, then `apps/admin/CLAUDE.md`, session helpers, and the corresponding gateway/service tests |
| UI/brand/motion | `docs/design/MMG_CONCIERGE_OVERALL_DESIGN_PLAN.md`, `packages/brand`, and `CLAUDE.md` mobile/frontend conventions |
| Paystack, wallets, refunds, withdrawals | Architecture handoff §§3.8–3.10 and 9; ADR 0005; WP4/WP6. These remain deliberately unavailable unless the task explicitly changes the boundary. |

## 4. Locked architecture invariants

- Firebase is the backend: Authentication, Firestore, Storage, Functions v2, App Check, FCM, Crashlytics, and Cloud Logging.
- Firebase topology is two-tier: use emulators locally, `mmg-concierge-dev` for cloud development/integration, and `mmg-concierge` for controlled/public production. No dedicated staging project is required for MVP (ADR 0008).
- Firestore client access is deny-by-default. Trusted state is written through Admin SDK/services, not direct client writes.
- Renter vehicle list/search/detail must cross authenticated, App-Check-protected Functions. Trusted `vehicles`, `vehiclePrivate`, vehicle revisions, and vehicle image documents are never renter-readable Firestore documents.
- Do not add a parallel `listings`, `publicVehicles`, or other duplicate vehicle read-model collection without a reviewed ADR. The canonical vehicle aggregate remains the current trusted collection family.
- All money is integer NGN kobo. Pricing is server-authoritative and uses the canonical domain calculation.
- Dates are date-only `YYYY-MM-DD` and intervals are half-open `[startDate, endDate)`.
- Mutations are contract-first, authorized, schema-validated, transactional where needed, audited, and idempotent.
- Owner/vehicle approval precedes public discoverability. Only approved + active + discoverable vehicles may be serialized into renter discovery DTOs.
- Exact addresses, exact coordinates, plates, persistent owner IDs, private storage paths, government IDs, moderation/admin notes, payout data, and image-processing internals never cross renter discovery DTO boundaries.
- Admin sessions require a fresh verified Firebase identity and an allowed staff claim. Fixture mode must be development-only and visibly non-production.
- Every rental includes chauffeur and delivery in the MVP.
- Paystack, real payment confirmation, escrow, payouts, MFA, live tracking, chat, and wallet settlement are not live until their explicit work-package exit gates pass. Unimplemented paths must fail honestly, never claim success.
- Expo Go is not a supported Firebase-auth runtime; use an EAS or local native development build.
- Decorative arrows are not permitted in CTA/button labels. Arrows are reserved for functional navigation controls such as back, carousel, pagination, or directions.

## 5. Current milestone snapshot

Snapshot date: **2026-08-31**. Verify against `git status`, `git log`, [`docs/reviews/2026-08-20_APPLICATION_DEEP_REVIEW.md`](docs/reviews/2026-08-20_APPLICATION_DEEP_REVIEW.md), [`docs/architecture/FIRESTORE_SCHEMA_EVOLUTION_PLAN.md`](docs/architecture/FIRESTORE_SCHEMA_EVOLUTION_PLAN.md), and [`docs/operations/FIREBASE_DEVELOPMENT_ENVIRONMENT.md`](docs/operations/FIREBASE_DEVELOPMENT_ENVIRONMENT.md) before relying on it.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| Phase 1 — experience foundation | ✅ Complete | Expo workspace, brand system, navigation, discovery foundation |
| Sequence 1 — owner verification | ✅ Merged | Owner contracts, rules, Functions, mobile flow, Admin desk |
| Sequence 3 — renter trips/booking foundation | ✅ Foundation complete | Trusted read-only boundaries, truthful trip states, booking intent foundation |
| WP0 — foundation corrections | 🔶 Mostly complete | Terms, masking, CSRF, pagination and ADRs are present; client quote defaults can diverge from versioned server pricing |
| WP2 A–C — vehicle contracts, rules, Functions | ✅ Complete | Vehicle draft/upload/finalize/submit/review/visibility foundations |
| WP2 D — image processing/promotion | ✅ Complete in current implementation | Sharp variants, EXIF/GPS removal, approved-object promotion |
| WP2 F — Admin vehicle moderation | ✅ Complete | Live gateway, review command, storage promotion, checklist and Admin tests |
| WP2 E — owner mobile fleet UI | ✅ Complete | Fleet list, create/submit wizard, image pipeline, visibility controls |
| WP1 — renter profile/privacy/MFA | 🔶 Foundation complete | Profile/address/terms and deletion-request commands exist; verified phone, completed deletion/erasure workflow and MFA remain |
| WP3 — live Lagos discovery | ✅ S1 Hardening complete | Strict wire contracts, authenticated Functions (including getVehicleDetails), and hardened Firestore Rules deployed to mmg-concierge-dev; renter direct-Firestore reads denied |
| WP4 — availability and Paystack-ready booking | 🔶 Calendar + owner-response slice complete | Atomic intents/holds and owner-response services exist; trusted paid-booking creation, SLA alerts, and Paystack remain incomplete |
| WP5 — notifications/chat/lifecycle | ⏳ Not started | FCM outbox, payment-gated chat, lifecycle/completion |
| WP6 — ledger/wallets/withdrawals | ⏳ Not started | Append-only ledger and manual finance workflow |
| WP7 — admin completeness | 🔶 Partial | Owners, bookings, and initial vehicle desk exist; remaining operations modules are not complete |
| WP8 — release hardening | ⏳ Not started | CI, observability, privacy/data-safety inventory, runbooks, controlled-release sign-off |

### Firebase infrastructure checkpoint

The development Firebase project `mmg-concierge-dev` is on Blaze and currently has:

1. Registered iOS, Android, and Admin web apps; Email/Password and Google Authentication enabled.
2. Standard/Native `(default)` Firestore in `africa-south1` with delete protection and hardened S1 Security Rules and indexes deployed.
3. 22 deployed Node 22 Functions in `africa-south1` with public Cloud Run transport invocation for callable endpoints (including `getVehicleDetails`). Missing App Check / unauthenticated calls fail closed with 401 UNAUTHENTICATED.
4. Private `expireAbandonedOwnerVerificationUploads` scheduled from `europe-west1` through OIDC to the `africa-south1` Function.
5. Default Storage bucket `mmg-concierge-dev.firebasestorage.app` provisioned in `africa-south1` with `firebase/storage.rules` deployed. Live media lifecycle (EXIF/GPS stripping, promotion, demotion, access denial to private objects) and abandoned-upload cleanup verified.

The S1 discovery hardening is deployed in `mmg-concierge-dev`: `resolveSearchPlace`, `searchVehicles`, and `getVehicleDetails` enforce App Check + Auth, native discovery list/search/detail runs behind Functions, direct renter Firestore access to trusted vehicle/image records is denied in Rules, and negative emulator tests verify zero private field leakage.

Production `mmg-concierge` is not a development target. Do not reprovision, clean up, seed, or loosen production resources during this work.

### Current GitHub baseline & working state

Merged `main` includes PR #18 at `e7e730f`, which provisioned/reconciled the development Firebase environment and discovery authentication boundary.

The unmerged `codex/wp4-booking-operations` branch remains donor/reference code only. It is not evidence that Paystack or WP4 is complete.

The following are not safe to treat as live:

1. Paystack payments, verified webhook processing, refunds, settlement, or payouts.
2. A trusted payment event creating `paid_pending_owner`.
3. In-app chat or production push notifications.
4. Live driver/vehicle tracking.
5. Vehicle-upload garbage collection beyond the existing owner-verification cleanup path.
6. Ledger, wallets, or withdrawals.

The active `codex/vehicle-public-projection-hardening` branch implements S1 without adding a second Firestore read model:

- new strict discovery wire contracts that omit owner identity and trusted fields;
- `searchVehicles` service serialization through that whitelist;
- architecture-defined `getVehicleDetails` callable behind App Check + authenticated-renter access;
- detail DTOs preserve the same default Lagos-relative distance semantics as the prior direct-Firestore gateway;
- mobile native live list/search/detail through Functions instead of direct Firestore;
- web live gateway through Functions while preserving explicit preview-only fixtures;
- Firestore Rules changed so `discoverable: true` never grants renter access to trusted vehicle/image documents;
- negative Rules and serializer tests for moderation/private-path leakage;
- inherited mobile image fallback lint repair without decorative CTA arrows.

The current follow-up commit must be validated by the shell-capable operator before any Firebase deployment. No Firebase deployment is authorized solely by this commit.

## 6. Milestone checker

Run this at the start and end of every bounded task:

```bash
git status -sb
git log --oneline --decorate -8
```

Required repository gate for this security branch:

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
npm run test:rules
npm run test:storage-rules
npm run check
git diff --check
```

Milestone status is PASS only when:

1. Relevant contract/domain/Function tests pass.
2. Anonymous, renter trusted-record, cross-owner, owner, and staff-client Rules cases pass in the Firestore emulator.
3. Function response fixtures contain no exact/private/moderation/owner-identity fields.
4. Native live discovery performs no direct trusted Firestore vehicle/image reads.
5. Loading, empty, offline, retry, and provider-failure states remain truthful.
6. Docs, indexes, Rules, contracts, Functions, Mobile, Admin, and Git history agree.
7. `git diff --check` is clean and no unrelated/generated/conflict files are staged.

If Java/emulator tooling or Firebase operator auth is unavailable, mark that gate BLOCKED rather than weakening the Rules or claiming completion.

## 7. Agent execution protocol

### Commit/status synchronization policy

Every commit created by an agent must update this root `AGENTS.md` in the same commit so a downstream agent can reconstruct current roadmap and operational state immediately after pulling. Do not record the new commit's own SHA inside that same commit. GitHub-generated merge commits are the exception; the first agent commit after a merge reconciles this file with merged reality.

1. Start with `git status -sb`; preserve unrelated user changes.
2. Declare the bounded scope before editing.
3. Read required context-map documents and closest tests.
4. Change contracts/domain first, then server services/Rules, then Admin/Mobile consumers.
5. Prefer existing injectable gateways/repositories and canonical services. Do not duplicate Firebase reads or state transitions in UI code.
6. For admin mutations, use same-origin protection, live staff session/role checks, canonical services, optimistic concurrency, idempotency, and audit logging.
7. For production paths, fail closed. Fixture adapters may exist only behind documented development guards and must never replace a failed live read silently.
8. Run narrow tests, then the full gate when crossing package/security boundaries.
9. Update this `AGENTS.md` snapshot in every agent-authored commit and detailed status docs when evidence changes milestone state.
10. End with a handoff containing summary, files changed, tests run, assumptions, known risks, blockers, and next recommended task.

## 8. Definition of done

A feature is not complete because a screen renders. Contracts, domain transitions, authorization, Rules/indexes, server read/write boundaries, client states, tests, docs, and operational failure behavior must agree.

The controlled commercial flow remains:

```text
approved owner
  -> approved active chauffeured vehicle
  -> Lagos discovery
  -> atomic date hold
  -> server-priced payment boundary
  -> owner confirmation or intervention
  -> completed rental
  -> immutable ledger credit
  -> admin-approved manual withdrawal
```

Paystack and settlement remain explicit future boundaries; do not imply they are live.
