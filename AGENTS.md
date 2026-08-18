# MMG Concierge — Global Agent Context

This is the repository-wide operating handoff for every coding agent working on MMG Concierge. Read this file first, then read the context documents required by the task before editing code.

`CLAUDE.md` remains the detailed engineering guide. `apps/admin/AGENTS.md` remains the generated Next.js-specific guide. This file is the cross-surface coordination layer and milestone snapshot.

## 1. Project identity

- Product: Lagos-first marketplace for chauffeured luxury-car rentals.
- Firebase project: `mmg-concierge`.
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
| Discovery/search/detail | Architecture handoff §§3.5, 6.5, 8.4; WP3 in the completion plan; mobile discovery feature files |
| Firebase Auth/App Check/Firestore/Storage | The relevant Firebase skill, `firebase/`, `apps/mobile/src/core/firebase`, `apps/functions/src/index.ts`, and `CLAUDE.md` security invariants |
| Admin route or server action | `apps/admin/AGENTS.md` first, then `apps/admin/CLAUDE.md`, session helpers, and the corresponding gateway/service tests |
| UI/brand/motion | `docs/design/MMG_CONCIERGE_OVERALL_DESIGN_PLAN.md`, `packages/brand`, and `CLAUDE.md` mobile/frontend conventions |
| Paystack, wallets, refunds, withdrawals | Architecture handoff §§3.8–3.10 and 9; ADR 0005; WP4/WP6. These remain deliberately unavailable unless the task explicitly changes the boundary. |

## 4. Locked architecture invariants

- Firebase is the backend: Authentication, Firestore, Storage, Functions v2, App Check, FCM, Crashlytics, and Cloud Logging.
- Firestore client access is deny-by-default. Trusted state is written through Admin SDK/services, not direct client writes.
- All money is integer NGN kobo. Pricing is server-authoritative and uses the canonical domain calculation.
- Dates are date-only `YYYY-MM-DD` and intervals are half-open `[startDate, endDate)`.
- Mutations are contract-first, authorized, schema-validated, transactional where needed, audited, and idempotent.
- Owner/vehicle approval precedes public discoverability. Only approved + active + discoverable vehicles are renter-readable.
- Exact addresses, exact coordinates, plates, private storage paths, government IDs, payout data, and admin notes never cross renter-visible DTO boundaries.
- Admin sessions require a fresh verified Firebase identity and an allowed staff claim. Fixture mode must be development-only and visibly non-production.
- Every rental includes chauffeur and delivery in the MVP.
- Paystack, real payment confirmation, escrow, payouts, MFA, live tracking, chat, and wallet settlement are not live until their explicit work-package exit gates pass. Unimplemented paths must fail honestly, never claim success.
- Expo Go is not a supported Firebase-auth runtime; use an EAS or local native development build.

## 5. Current milestone snapshot

Snapshot date: **2026-08-18**. Verify against `git status`, `git log`, and the status documents before relying on it.

| Milestone | Status | Evidence / next gate |
|---|---|---|
| Phase 1 — experience foundation | ✅ Complete | Expo workspace, brand system, navigation, discovery foundation, checks |
| Sequence 1 — owner verification | ✅ Merged | Owner contracts, rules, Functions, mobile flow, Admin desk; merged to `main` |
| Sequence 3 — renter trips/booking foundation | ✅ Foundation complete | Trusted read-only boundaries, truthful trip states, booking intent foundation; continue only through handoff exit gates |
| WP0 — foundation corrections | ✅ Complete | Terms, pricing, masking, CSRF, pagination, ADRs |
| WP2 A–C — vehicle contracts, rules, Functions | ✅ Complete | Vehicle draft/upload/finalize/submit/review/visibility foundations and emulator coverage |
| WP2 D — image processing/promotion | ✅ Complete in current implementation | Sharp variants, EXIF/GPS removal, approved-object promotion and renter projection |
| WP2 F — Admin vehicle moderation | ✅ Complete | Live Firestore gateway rewritten against real flat/private schemas, server action wired to reviewVehicle + storage promotion, 7-point checklist enforced, 8/8 admin test files passing |
| WP2 E — owner mobile fleet UI | ✅ Complete | Owner fleet list, 6-step create/submit wizard with image picking + upload session + binary PUT + finalize pipeline, authoritative version sync, live visibility toggling, vehicle inspector desk, router connections |
| WP1 — renter profile/privacy/MFA | ✅ Complete | Complete renter profile & Lagos delivery address, deletion/NDPR workflow, terms agreement, rules & Functions live |
| WP3 — live Lagos discovery | ✅ Complete | Haversine distance, Lagos BBox validation, composite discovery ranking, live native/web FirestoreDiscoveryGateway with strict row validation (no preview fallback, no category/coords/policy fabrication, limit(30) fetch), resolveSearchPlace & searchVehicles functions, ExecutiveBookingDesk, live BookingReviewScreen & VehicleDetailScreen, PickupDistrictSheet |
| WP4 — availability and Paystack-ready booking | ✅ Complete | Owner calendar blocking/unblocking, merge calendar read model, sentinel serialization, fail-closed PaymentPort, TestPaymentAdapter, processPaidBookingEvent, owner confirm, owner reject with reason, renter cancel with refund math, admin intervention/reassignment, owner SLA alert without auto-cancel |
| Paystack Sandbox & Test Mode Simulation | ✅ Complete | Server PaystackPaymentAdapter (Node 22 fetch, secret key configuration, reference verification), initializeBookingPayment & verifyBookingPayment Cloud Functions, mobile BookingReviewScreen with test mode banner & test card assistant, instant sandbox simulation shortcut, OwnerPendingReservations desk with accept/decline actions |
| UI/Brand Polish & Motion Suite | ✅ Complete | Master Design Plan (Phases 1–5), ExecutiveBookingDesk (custom duration stepper & live schedule calculator), Prado-led fleet realignment (Prado 250 Obsidian), LuxuryShimmer, RadarPulseDot, LuxuryEmblemLoader, brand language & tone standardization ("Executive Chauffeur", "Rental & Ride", "The Prado Collection & Executive Fleet", "Dispatch Zone"), primary app icon unified to logo-darkbg.png across mobile & admin surfaces |
| Realistic Prado-Led Executive Fleet & Live Firestore Seeding | ✅ Complete | 8 documentary-style Lagos luxury vehicle listings (Prado 250 First Edition, Prado 150 VX, Prado 150 TXL, LC300 VXR VIP, Mercedes S 580, Mercedes V-Class VIP Jet, Mercedes-AMG G 63, Lexus LX 600 Ultra Luxury), 4 verified test owners (Adeleke, Okafor, Fashola, Nnamdi), live Cloud Firestore populated with public projections, private registration details & availability sentinels, bundled assets & gateway mapping complete |
| Admin Cloud Deployment Configuration | ✅ Complete | Next.js 16 SSR App Router build verified with Turbopack/Webpack extension aliasing, apphosting.yaml and firebase.json configured for Firebase App Hosting on Google Cloud Run |
| WP5 — notifications/chat/lifecycle | ⏳ Not started | FCM outbox, payment-gated chat, lifecycle/completion |
| WP6 — ledger/wallets/withdrawals | ⏳ Not started | Append-only ledger and manual finance workflow |
| WP7 — admin completeness | 🔶 Partial | Owners, bookings, and initial vehicle desk exist; remaining operations modules are not complete |
| WP8 — release hardening | ⏳ Not started | CI, observability, privacy/data-safety inventory, runbooks, staging sign-off |

### Firebase Infrastructure (Blaze Plan Active)

The Firebase project `mmg-concierge` has been upgraded to the **Blaze (Pay-as-you-go) plan**. This unblocks:
1. Live deployment of Node 22 Firebase Functions v2 (`africa-south1`).
2. Google Cloud Scheduler daily cron for `expireAbandonedOwnerVerificationUploads`.
3. Outbound network connectivity for live Nigerian Phone Auth (`+234...`), APNs/FCM pushes, and Paystack payment sandbox API (`https://api.paystack.co`).
4. Custom memory allocations (512MiB–1024MiB) for server-side Sharp vehicle image resizing.

### Current GitHub baseline & Working Tree Status

The merged `main` history currently contains:

- `1abe508` — owner verification
- `343b031` — vehicle foundation/workflow
- `7d8003f` — app experience/auth/discovery
- `71f88ae` — initial Admin vehicle moderation desk

The uncommitted work in the repository is a **real Sequence 2 implementation pass** along with **WP1 (renter profile/privacy), WP3 (live Lagos discovery), WP4 (availability & Paystack-ready booking operations), Paystack Sandbox Simulation, UI/Brand Polish (Master Design Plan Phases 1–5, Luxury Motion Suite, Prado-Led Fleet Realignment, and Language Tone Standardization), and Admin Cloud Deployment Configuration**. The following paths remain deliberately unimplemented until their explicit gates:

1. **Production Real-Money Paystack Settlement**: Production NGN bank card charging remains in test sandbox mode until release verification.
2. **In-App Messaging / Chat**: Live renter-owner-concierge chat channels are not live (WP5).
3. **Real-Time GPS Vehicle Tracking**: Live telematics / driver tracking is not implemented.
4. **Push Notifications (FCM / APNs Outbox Delivery)**: Production APNs certificates and delivery workers are not live (WP5).
5. **Ledger & Wallets**: Append-only double-entry financial ledger and bank withdrawals are not live (WP6).

Treat all uncommitted code as an **in-progress Sequence 2 pass** and always fail closed on unimplemented paths.

## 6. Milestone checker

Run this at the start and end of every bounded task:

```bash
git status -sb
git log --oneline --decorate -8
```

Minimum repository gate:

```bash
npm run check
```

The full gate covers root tests, mobile typecheck/lint, Functions typecheck/build, and Admin typecheck/lint/tests (Current baseline: **58 test files passed, 500 unit tests passed, 0 typecheck errors, 0 lint warnings**). A green root test run can skip emulator suites, so Firebase changes also require:

```bash
npm run test:rules
npm run test:storage-rules
```

Use focused gates while iterating:

```bash
npm run admin:typecheck
npm run admin:lint
npm run admin:test
npm run functions:typecheck
npm run functions:build
npx vitest run packages/contracts packages/domain
```

Milestone status is **PASS** only when:

1. The relevant contract/domain tests pass.
2. Authorization and negative Rules tests pass for any Firebase boundary touched.
3. The relevant Functions/Admin/Mobile checks pass.
4. Loading, empty, offline, retry, conflict, and provider-failure states are truthful where applicable.
5. Docs, ADRs, indexes, rules, and status references agree with the implementation.
6. `git diff --check` is clean and no unrelated/generated/conflict files are staged.

If Java or emulator tooling is unavailable, mark the Rules gate **BLOCKED**, do not mark the milestone complete, and report the exact command and environment requirement.

## 7. Agent execution protocol

1. Start with `git status -sb`; preserve unrelated user changes.
2. Declare the bounded scope in the task update before editing.
3. Read the required context-map documents and the closest existing tests.
4. Change contracts/domain first, then server services/rules, then Admin/Mobile consumers.
5. Prefer existing injectable gateways/repositories and canonical services. Do not duplicate Firebase reads or state transitions in UI code.
6. For admin mutations, use same-origin protection, live staff session/role checks, canonical service calls, optimistic concurrency, idempotency, and audit logging. Never use an optimistic-success fallback when a server mutation fails.
7. For production paths, fail closed. Fixture adapters may exist only behind the documented development guard and must never silently replace a failed live read in production.
8. Run the narrowest relevant tests, then the full gate when the change crosses package or security boundaries.
9. Update the status document only when the evidence supports the new milestone state. Include what remains incomplete.
10. End with a handoff containing: summary, files changed, tests run, assumptions, known risks, and next recommended task.

## 8. Definition of done for this repository

A feature is not complete merely because its screen renders. It is complete when the shared contract, domain transition, authorization, Rules/indexes, server mutation/read boundary, client states, tests, documentation, and operational failure behavior all agree. The agent must be able to trace the feature through the architecture's controlled flow:

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
