# MMG Concierge — Paystack-Excluded Completion Plan

**Status:** Agent handoff plan, revised for the two-tier Firebase model
**Prepared:** 2026-08-16; revised 2026-08-30
**Target:** A tested, production-shaped, Paystack-ready codebase. This is **not** public-launch or controlled-release sign-off until Paystack, release infrastructure, legal/operational review, and the external prerequisites listed below are complete.

## 1. Authority and conflict resolution

Use these sources in this order:

1. `docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md`
2. Explicit decisions in this plan
3. `docs/implementation/SEQUENCE_1_OWNER_VERIFICATION_SPEC.md`
4. `docs/implementation/SEQUENCE_2_3_VEHICLE_INVENTORY_AND_OWNER_OPERATIONS_SPEC.md`
5. `docs/IMPLEMENTATION_PHASES.md` and `README.md` as status summaries only

When a lower source conflicts with a higher one, follow the higher source and document the conflict. Do not silently invent collections, state transitions, pricing rules, permissions, or product behavior.

### Locked corrections

- Booking dates are date-only in `Africa/Lagos`, with **start inclusive and end exclusive** intervals: `[startDate, endDate)`. August 1 to August 2 is one charged day. Do **not** add `+ 1`.
- Staff roles are `support`, `vehicle_admin`, `verification_admin`, `finance_admin`, `privacy_admin`, and `super_admin`. There is no `vehicle_inspector` claim.
- Current owner literals are `owner-terms-2026-08-01`, `owner-commission-2026-08-01`, and `privacy-notice-2026-08-01`.
- Firebase topology is emulator -> `mmg-concierge-dev` development/integration -> `mmg-concierge` production. Do not add a dedicated staging project for MVP. Until development is provisioned and wired, use emulators and do not use production as a substitute integration environment. See ADR 0008.
- All money is integer kobo. The client quote and authoritative server price must use the same pure calculation and the same fee inputs. The server remains authoritative.
- MFA is required for every admin before controlled public-release sign-off.
- The original architecture does not automatically reject or cancel an unanswered owner booking. The response SLA raises an admin alert only.
- Vehicle approval requires **1–20** processed images, not three.
- HEIC is not currently an accepted upload contract. Do not claim HEIC support unless the complete picker, upload, magic-byte, image-processing, contracts, Rules, and tests are changed together.

## 2. Verified current baseline

Completed and to be preserved:

- React Native/Expo Router mobile application, Next.js admin application, Firebase Functions v2, shared contracts/domain/brand packages.
- Firebase Auth and native App Check wiring, with deterministic fixture-only web preview.
- Deny-by-default Firestore and Storage Rules with emulator suites.
- Booking-intent foundation with date math, server price snapshot, idempotency, availability transaction sentinel, and honest Paystack-unavailable behavior.
- Owner Verification Sequence 1: owner profile, linked phone, private ID upload, submission, staff review, signed preview URL, retention cleanup, audit/outbox records, and staff session cookie.
- Sequence 1 validation baseline documented in `docs/IMPLEMENTATION_PHASES.md`.

Not yet complete:

- Live renter profile/address flow and Places-backed Lagos location resolution.
- Vehicle inventory, image processing, moderation, owner calendar, and owner booking operations.
- Server-side discovery/geohash/distance/ranking.
- Admin modules beyond owner verification and the existing fixture booking view.
- FCM delivery, chat, rental lifecycle, wallets, withdrawals, privacy/deletion workflow, MFA, Crashlytics, rate limits, alerts/runbooks, authenticated device E2E, and controlled-release validation.
- Every Paystack operation.

## 3. Review of the external assessment

Do not use the quoted “50% compliant / 10 Tier 1 fixes” score as a project metric. It mixes real issues, stale observations, recommendations, and false findings.

| Assessment claim | Verdict | Required action |
|---|---|---|
| Admin read schema embeds current terms literals | Valid latent design defect; the current gateway does not parse with this schema, so the report overstates it as a live admin outage | Separate historical/read schemas from current command acceptance schemas. Add an old-version read test. |
| Client quote hardcodes 8% and omits fixed fee | Valid defect | Replace it with one canonical pricing engine accepting a versioned fee configuration. Add parity/property tests. |
| PII masking exists twice with different behavior | Valid defect | Keep one server-safe implementation and one exported API; migrate callers and tests. |
| Admin action has no Zod boundary | Valid defect | Parse unknown action input with the shared command schema before fixture/live branching. |
| Terms literals prevent `terms_stale` | Valid defect | Command shape accepts bounded version strings; domain comparison emits `FAILED_PRECONDITION` + `terms_stale`. |
| Production Functions use `console.*` throughout | False | `console.*` is currently in the operator CLI, where terminal output is appropriate. Continue using Functions v2 logger in deployed handlers/jobs. |
| Audit writes are outside transactions | False for the implemented booking/owner repositories | Preserve transaction-bound state, event, outbox, idempotency, and admin-audit writes; add tests for every new command. |
| WEBP/PDF magic-byte validation is missing | False | It exists with tests. Maintain equivalent validation for new upload paths. |
| HEIC magic bytes are missing | Not a defect under the current contract | Either continue rejecting HEIC clearly or introduce it as an end-to-end product decision. |
| Image-picker permissions are not requested | False for the owner ID flow | Reuse its permission-denied UX for vehicle images. |
| Upload ID lacks a path-safe constraint | Already fixed | Reuse the bounded path-safe ID schema for every new upload identifier. |
| Queue pagination, CSRF, freshness, URL refresh, and listener error handling | Hardening gaps or design reviews | Address in the relevant work packages below; do not label all as architecture violations. |
| Sequence 3 should auto-expire owner responses after 24 hours | False | Implement SLA alerts without automatic rejection/cancellation. |

## 4. Definition of “finished without Paystack”

The project is complete for this plan when:

1. Every independent feature in Work Packages 0–8 passes its exit gate.
2. Payment-dependent modules compile and are tested through a narrow `PaymentGateway`/verified-payment boundary using emulator fakes, but production Paystack initialization, webhooks, verification, refunds, top-ups, and reconciliation remain unavailable.
3. No UI or API claims a charge, paid booking, refund, wallet earning, or confirmed ride without a trusted verified-payment event.
4. Documentation names the exact remaining Paystack integration points and external operator prerequisites.
5. The full test/build/rules suite passes and the required iOS/Android development-build flows have device evidence.

This milestone is **Paystack-ready code complete**, not controlled-MVP complete. Architecture Phase 4's payment exit gate, the payment-dependent portions of Phases 5–7, and Phase 8 cannot truthfully close before a real Paystack sandbox/production integration and operations rehearsal.

## 5. Universal implementation rules

Every agent must follow these rules:

- Use Firebase project `mmg-concierge`, Firestore Standard edition, Native mode, database `(default)`, region `africa-south1`.
- Before Firebase changes, locate and follow the applicable local Firebase agent skill. Never guess deployed configuration.
- All Functions use v2, `africa-south1`, App Check enforcement, Auth/role checks, Zod parsing of `unknown`, canonical `CommandError` mapping, structured logger fields, and no PII in logs.
- Every state transition, state document, durable domain event, outbox record, idempotency record, and required admin audit record is committed atomically.
- All multi-writer aggregates use `expectedVersion` and transactional optimistic concurrency.
- Firestore and Storage remain deny-by-default. Admin browser code never receives Admin credentials and never relies on Security Rules to authorize Admin SDK calls.
- Raw PII, exact coordinates, private paths, bank data, ID bytes, chat bodies, secrets, and provider payloads never enter logs or public DTOs.
- Signed private-object URLs are server-minted, purpose-scoped, expire in at most 15 minutes, and are refreshed through an authorized server read.
- Uploads use owner-scoped paths, MIME/size Rules gates, server magic-byte checks, and safe processed output. Vehicle images strip EXIF before public promotion.
- Store timestamps as Firestore `Timestamp`; serialize explicit ISO strings only at client boundaries.
- Never add `console.*` to deployed backend code.
- Preserve fixture/live isolation. Production must fail closed if fixture flags are present.
- No commits, pushes, deployments, secrets, Firebase console changes, or destructive cleanup unless separately authorized.
- Keep the worktree's existing user changes. Do not reset or overwrite unrelated files.

## 6. Work packages and dependency order

Each work package should be delivered as small, reviewable PR-sized batches. A later package may begin only after its dependency contracts and security model pass.

### WP0 — Correct the foundation and freeze invariants

**Goal:** Remove real cross-cutting defects before multiplying their patterns.

Deliver:

1. Split terms schemas:
   - command inputs accept bounded version strings;
   - the domain compares against current constants and returns `terms_stale`;
   - persisted/admin-visible historical terms use bounded strings, not literals.
2. Replace `calculateBookingQuote(dailyRate, days)` with one canonical price calculation path shared with the server. The preview may expose fewer output fields, but calculations and rounding must be identical for identical inputs.
3. Consolidate email, phone, and future plate masking into one server-safe module/API.
4. Parse admin review action input using the shared Zod command schema before fixture or live execution. Keep safe error mapping.
5. Review session mutation CSRF posture and reauthentication/freshness. Add same-origin/Origin validation or a documented equivalent for cookie-authenticated mutation endpoints.
6. Add cursor pagination contracts for owner and future vehicle admin queues and pagination/batch bounds for scheduled cleanup.
7. Add or update ADRs for date intervals, pricing, staff roles, upload formats, payment boundary, and notification delivery.

Exit gate:

- Tests prove historical terms remain readable and stale terms return the canonical safe reason.
- Quote/authoritative parity covers fixed fees, basis-point rounding, zero fixed fee, maximum safe amounts, and randomized valid inputs.
- No duplicate masking implementation remains.
- Existing Sequence 1 tests, Rules suites, admin build, Functions build, and mobile checks remain green.

### WP1 — Complete identity, renter profile, privacy baseline, and admin MFA

**Depends on:** WP0.

Deliver:

- `completeRenterProfile` with verified email and linked phone requirements, name, Lagos delivery address, consent/terms history, versioned command/result DTOs, idempotency, audit/outbox, and owner/renter role isolation.
- Google Places address resolution through a trusted server boundary; manually entered address remains possible where architecture permits. Restrict keys and results to Lagos/Nigeria. Never trust client coordinates or persist transient current-location searches by default.
- Mobile loading, permission-denied, manual-address, offline, retry, invalid-place, and stale-terms states.
- Data-rights request and account-deletion workflow: reauthentication, legal/operational hold checks, immediate capability suspension, scheduled cleanup/anonymization, completion proof without retained identity, and a public web deletion-request route.
- Admin MFA enrollment/enforcement and role-specific server layouts/actions for all six declared staff roles. Add token revocation behavior after claim changes.
- Privacy placeholders/disclosures aligned to actual SDK/data use; do not claim final legal approval.

Exit gate:

- Cross-account and cross-role emulator tests deny profile/private-document access.
- MFA is required in release configuration and tested for each privileged route family.
- Account deletion tests cover active-booking, refund, wallet/legal holds, replay, and successful deletion/anonymization.
- Manual address entry works when location permission is denied.

### WP2 — Vehicle inventory and Lagos moderation

**Depends on:** WP0 and an approved owner from Sequence 1.

Use `SEQUENCE_2_3_VEHICLE_INVENTORY_AND_OWNER_OPERATIONS_SPEC.md` as the detailed build sheet for its vehicle portion, subject to this plan's authority rules.

Deliver in this order:

1. Contracts/domain: vehicle, private vehicle, image, revision, moderation, visibility, checklist, safe errors, plate masking, Lagos bounds, and public projection.
2. Rules/indexes: owner-only private reads, no client writes to trusted state, public reads only for approved+active/discoverable projections, and private/public Storage separation.
3. Functions: draft, upload session, finalize/process image, submit, review, revision, visibility, and abandoned-upload cleanup.
4. Processing: 1–20 images, dimensions/size/type validation, EXIF removal, thumb/card/detail variants, deterministic primary ordering, and approved-only public promotion.
5. Owner mobile: fleet list and creation/edit/resubmit wizard with permission, progress, retry, resume, reorder, empty, rejected, paused, offline, and failure states.
6. Admin: paginated vehicle queue and inspector, role enforcement for `vehicle_admin | super_admin`, masked plate, staff-only exact-location treatment, signed document previews, mandatory checklist/reasons, and concurrency conflict UX.

Exit gate:

- Only approved + active vehicles are renter-readable/discoverable.
- Major revisions do not replace the approved snapshot before approval; safety-critical revisions pause as specified.
- Network-level DTO tests prove no plate, private path, owner street address, full geohash, or exact coordinates reach renter clients.
- EXIF/GPS removal and public-object promotion are tested.
- Cross-owner, renter, anonymous, and staff-client direct access fails in Rules tests.

### WP3 — Live Lagos discovery and vehicle detail

**Depends on:** WP2.

Deliver:

- Trusted `resolveSearchPlace` and `searchVehicles` functions with Lagos restriction, geohash bounds, Haversine distance, radius, category/core filters, date-availability hard filtering, cursor pagination, and the locked distance/price ranking formula.
- System-config versioning for ranking weights, radius, fee inputs, hold duration, owner SLA, and feature flags. Only `super_admin` changes high-risk values; changes are immutable/audited.
- Public renter DTO with rounded distance, area label, coarsened map point, approved image URLs, chauffeur included, delivery included, daily rate, and no exact/private fields.
- Replace fixture discovery in native builds while preserving explicit web fixture mode.
- Image-led mobile browse, search, filters, permission-denied/manual search, skeleton, empty, retry, offline, pagination, and vehicle-detail/quote states.

Exit gate:

- Exact vehicle location is absent from serialized results and captured network fixtures.
- Availability and moderation are hard filters; the ranking formula is unit-tested.
- Location permission denial still permits manual Lagos search.
- Renter UI uses ≥44 pt targets, ≥11 pt text, accessible labels/focus, restrained motion, brand tokens, real approved vehicle imagery, and no generic/fake dashboard decoration.

### WP4 — Availability and Paystack-ready booking operations

**Depends on:** WP2; discovery integration depends on WP3.

Deliver:

- Owner availability/calendar commands and read model using `[startDate, endDate)` intervals and the existing serialization sentinel/transaction pattern.
- Owner blocks cannot overlap paid/held booking blocks. Concurrent write tests prove one winner.
- Booking intent and checkout-hold preparation remain server-priced, versioned, idempotent, and honest while Paystack is unavailable.
- Introduce a narrow payment-port interface and a test-only verified-payment adapter. No production route may invoke the fake adapter.
- Implement paid-booking domain operations behind a prerequisite trusted `payment.succeeded` event: owner confirm, owner reject with reason, intervention case, alternative acceptance/reassignment, cancellation policies, and owner-response SLA alert.
- Do **not** auto-reject, auto-refund, or auto-cancel when the SLA expires.
- Admin booking/intervention UI must label synthetic/fixture data and must not imply live payment capability.

Exit gate:

- Date boundary, overlap, concurrency, idempotency, stale-version, cross-role, and alert-without-cancellation tests pass.
- No client callback or callable can manufacture `paid`, `paid_pending_owner`, `confirmed`, refund, or wallet state.
- Production builds expose “payment unavailable” at the handoff and never false confirmation copy.

### WP5 — Notifications, chat, and rental lifecycle

**Depends on:** WP4's trusted paid-booking boundary.

Deliver:

- Device-token registration/removal, FCM outbox worker, retry/backoff, invalid-token cleanup, idempotent delivery, deep links, and notification preferences.
- Payment-gated booking conversation, participant/support-scoped reads, server-owned writes/moderation metadata, attachment safety, retention/anonymization, and admin participation audit.
- Booking timeline, trip start, completion request/confirmation, intervention transitions, and scheduled SLA alerts.
- No background/live tracking permission or code.

Paystack boundary:

- Exercise chat and lifecycle end-to-end only with emulator/test verified-payment fixtures.
- Keep production conversation locked until a real verified payment creates the paid booking.

Exit gate:

- Pre-payment and cross-booking chat access is denied by Rules and service authorization tests.
- Duplicate outbox processing sends at most once logically.
- Deep-link, invalid token, offline, retry, and denied-notification states have mobile tests.
- Completion is idempotent and cannot be reached from an invalid state.

### WP6 — Ledger, wallets, and manual withdrawals

**Depends on:** WP5 completion events. Can be fully unit/emulator tested with synthetic paid-booking fixtures, but cannot receive real commercial earnings before Paystack.

Deliver:

- Append-only ledger buckets: expected pending, available, reserved, withdrawn, released, and compensating adjustment.
- Exactly-once completion earning; materialized balances derived transactionally from ledger entries.
- Owner wallet/earnings screens and private payout profile with masked client/admin projection.
- Withdrawal request, finance review, approval/rejection, awaiting manual fulfillment, proof/reference, failure/re-review, and daily reconciliation.
- Finance alerts, immutable admin audit, required reason, `expectedVersion`, idempotency, and replay protection.

Exit gate:

- Ledger conservation/property tests pass.
- Completing twice credits once; racing withdrawals cannot reserve more than available.
- No direct balance edit exists in client or admin APIs.
- Payout/bank data is encrypted/restricted as designed, masked before serialization, and absent from logs.

### WP7 — Admin completeness and operations

**Depends on:** WP1–WP6 module contracts.

Deliver the architecture's server-authorized modules:

- Overview, owners, vehicles, bookings, intervention cases, chat/support, wallets, withdrawals, users, configuration, privacy, and audit/security.
- Payments/refunds screens remain explicit unavailable/read-model placeholders until Paystack is integrated; they must not mutate synthetic financial state in production.
- Cursor pagination, filters, empty/loading/error states, freshness checks for sensitive actions, CSRF posture, safe errors, confirmation/reason UX, signed-URL refresh, and export logging where exports exist.
- Role-scoped layouts/actions for support, vehicle, verification, finance, privacy, and super admins.

Exit gate:

- Playwright covers every non-Paystack privileged workflow and denial path.
- No admin client-side direct read is used for private server-owned collections.
- Fixture mode is impossible in production and visually obvious in development.

### WP8 — Hardening, release engineering, and truthful handoff

**Depends on:** WP1–WP7.

Deliver:

- Crashlytics, App Check staged enforcement evidence, structured logging, dashboards/alerts, rate limiting/abuse controls, backup/restore validation, and incident/privacy/withdrawal runbooks.
- Accessibility, reduced motion, low-bandwidth, offline, retry, and provider-failure review.
- Emulator CI, coverage thresholds, native iOS/Android development-build E2E (Maestro), admin Playwright, and production-shaped smoke scripts that do not require Paystack.
- Emulator/cloud isolation, fail-closed release flags, and Secret Manager references; no secret values in source.
- Update README, implementation phases, ADRs, index inventory, data map, retention schedule, App Privacy/Data Safety inventory, and exact operator checklist.
- Produce a Paystack integration manifest naming every port, command, webhook transition, secret, emulator fixture, required test, admin surface, and disabled UI entry point.

Exit gate:

- Full validation matrix below passes from a clean install.
- Security-rules red-team review has no unresolved critical/high finding.
- The docs say exactly what is live, fixture-only, test-only, externally blocked, and Paystack-blocked.
- No document calls the product release-ready, launch-ready, paid, escrow-enabled, or settlement-complete.

## 7. Validation matrix

Run the smallest relevant checks after every batch and the complete matrix at each work-package exit:

```bash
npm run check
npm run functions:test
npm run test:functions:emulator
npm run test:rules
npm run test:storage-rules
npm run admin:build
npm exec --workspace @mmg/mobile -- expo export --platform web
npm exec --workspace @mmg/mobile -- expo export --platform ios
npm exec --workspace @mmg/mobile -- expo export --platform android
```

Also add and run, as the relevant packages appear:

- Functions emulator integration for all callables/triggers/jobs.
- Admin Playwright for live-emulator and fixture isolation.
- Expo web static export plus native iOS and Android Hermes exports.
- Maestro on iOS and Android development builds for authentication, renter profile, owner vehicle wizard, discovery, availability, and non-payment error boundaries.
- Property/concurrency suites for price parity, interval overlap, booking sentinels, exactly-once completion, and ledger conservation.
- Firestore/Storage negative tests for anonymous, wrong account, cross-owner, cross-booking, wrong staff role, stale claim, direct writes, private paths, MIME/size boundaries, and public projection leaks.
- `git diff --check` and a changed-file review before handoff.

Do not leave a development server running as proof. Record command, exit status, test counts/skips, emulator use, and artifact path for visual/device evidence.

## 8. UI acceptance rubric

For each mobile/admin surface, the implementing agent must provide screenshots and check:

- The first viewport is anchored by an actual vehicle, Lagos/location context, owner document task, or operational record—not generic decoration.
- Navigation and primary action are obvious; one dominant action per state.
- Loading, empty, partial, offline, denied, stale, retry, provider-failure, and success states are intentionally designed.
- Private/staff-only/fixture/test-only states are visibly labelled without exposing sensitive values.
- Typography, spacing, color, imagery, and motion use `@mmg/brand`; no unexplained hardcoded design values.
- Mobile touch targets are at least 44 × 44 points and body/helper text is at least 11 points.
- Images are inspected for fake signage/logos, watermarks, private readable text, and malformed people/vehicles before inclusion.
- Motion includes restrained entrance/reveal and useful press/hover feedback, respects reduced motion, and never delays the core task.
- Screen-reader labels, focus order, contrast, keyboard behavior on admin, and error association are tested.

## 9. Agent narration and handoff protocol

The implementing agent should narrate with these concise markers:

- `[AUDIT]` Sources read, current files/tests inspected, and conflicts found.
- `[PLAN]` Exact batch, files/collections/contracts affected, risks, and exit checks.
- `[IMPLEMENT]` Material behavior added or changed; call out security/data decisions.
- `[VALIDATE]` Commands run, pass/fail counts, skipped tests, screenshots/device evidence.
- `[HANDOFF]` Files changed, migrations/operator work, remaining risk, and next safe batch.

At the start of every work package, the agent must list:

1. Source sections governing the work.
2. Existing implementation it will preserve.
3. Firestore/Storage paths and write owner.
4. Threats and negative tests.
5. Paystack boundary, if any.

At completion it must state “complete” only if the exit gate has evidence. Otherwise use “partial” and list exactly what remains.

## 10. External/operator prerequisites

Code agents must report, not fabricate, these prerequisites:

- Provision `mmg-concierge-dev` with separate app registrations, App Check, Auth/provider configuration, restricted Maps/test-provider credentials, IAM/deployment identity, logs/alerts, and backups. First verify and record the immutable live Firestore/Storage locations; never copy private production data into development.
- Cloud Storage bucket provisioning and lifecycle/CORS configuration.
- App Check debug registrations, production providers, and enforcement rollout.
- Phone Auth provider/quota and authorized domains.
- Google Maps/Places billing, restricted API keys, and approved Lagos behavior.
- APNs/FCM credentials, notification entitlements, and release-device validation.
- Admin MFA enrollment and recovery process.
- Secret Manager bindings and deployment identities.
- Crashlytics/dashboards/alert recipients, backup policy, and named operational owners.
- Nigerian privacy/legal review, DPIA, retention approval, store disclosures, terms, commission schedule, and customer-support/refund/withdrawal procedures.
- Paystack test/live credentials, webhook reachability, settlement/refund process, and reconciliation ownership remain outside this plan.

## 11. Stop conditions

Stop and request review if:

- A change would weaken deny-by-default Rules, App Check, role isolation, payment truthfulness, or exact-location/PII privacy.
- A requested state transition is absent from the architecture.
- Completing a feature requires a production credential, console mutation, deployment, legal decision, or Paystack behavior.
- A migration could reinterpret existing date ranges, money snapshots, terms history, audit records, or versions.
- Existing user changes overlap and intent cannot be inferred safely.

The next implementation batch is **WP0**, followed by **WP2 vehicle inventory**. WP1 can proceed in parallel only after WP0 contracts are frozen and file ownership does not overlap. Do not begin Paystack work under this plan.

## 12. Copyable kickoff instruction for the implementation agent

> Implement MMG Concierge according to `docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`. First read its authority list and every referenced source section completely. Start with WP0 only; do not begin WP2 until WP0's exit evidence has been reviewed. Use the applicable local Firebase agent skills for every Firebase task and the frontend skill for visual UI work. Narrate with `[AUDIT]`, `[PLAN]`, `[IMPLEMENT]`, `[VALIDATE]`, and `[HANDOFF]`. Preserve existing user changes. Make no deployment, console, secret, commit, or push changes. Never implement or simulate Paystack in a production path. At each batch, show changed files, exact tests and counts, skipped/emulator-only checks, screenshots for UI, remaining risks, and whether the exit gate is complete or partial.
