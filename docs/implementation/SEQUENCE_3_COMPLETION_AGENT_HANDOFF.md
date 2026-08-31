# MMG Concierge — Sequence 3 completion agent handoff

> **Historical environment note:** ADR 0008 supersedes this handoff's
> production/staging wording. Use emulators locally, `mmg-concierge-dev` for
> cloud integration, and `mmg-concierge` only through the controlled-release
> gate.

## Objective

Finish and validate the current Sequences 1–3 vertical slice by completing the
renter trip experience and final integration review. Sequences 1 and 2 are
already implemented; do not redesign or expand them unless a regression blocks
the final gate.

The product invariant is payment-first: the client must never claim that a
payment, confirmation, cancellation, or refund happened unless a trusted
record carries that state. Paystack, privileged admin sessions, production
deployment, and authentication changes are outside this task.

## Required narration

Use these exact checkpoints while working:

1. `[AUDIT]` — summarize relevant files, current test state, and dirty-worktree
   items before editing.
2. `[PLAN]` — list the files and observable behavior for the next bounded task.
3. `[IMPLEMENT]` — report completed checkpoints and any deliberate deviation.
4. `[VALIDATE]` — list exact commands, pass/fail results, screenshots, and
   untested boundaries.
5. `[HANDOFF]` — summarize changed files, remaining risks, and what Codex must
   independently review.

Narration is not proof. Do not commit, deploy, add secrets, weaken Firestore
rules, modify authentication, or overwrite unrelated user changes.

## Verified starting point

At handoff creation, the repository contains:

- Sequence 1: shared booking contracts/domain logic, Node 22 Firebase Functions
  v2 `createBookingIntent`, Firestore transaction/idempotency/overlap handling,
  owner-scoped rules, indexes, and emulator tests.
- Sequence 2: `apps/admin` Next.js queue and inspector, fixture-only visual mode,
  fail-closed live mode, legal confirm/reject presentation, tests, and prior
  desktop/narrow browser review.
- Sequence 3 in progress: grouped Trips screen, dynamic trip route, image-led
  detail screen, state copy/action/timeline rules, deterministic web fixtures,
  and an unavailable action gateway that never fakes success.
- Latest observed checks: 30 ordinary tests passed and 12 emulator-only tests
  skipped; mobile TypeScript and lint passed; Expo web, iOS Hermes, and Android
  Hermes exports passed.

Do not assume those checks still pass. Rerun them after the implementation.

## Remaining implementation

### Task 1 — Correct renter state semantics

Inspect:

- `apps/mobile/src/features/booking/domain/renter-trip.ts`
- `apps/mobile/src/features/booking/domain/renter-trip.test.ts`
- `apps/mobile/src/features/booking/screens/trips-screen.tsx`

Required corrections:

- The `active` section must not be labelled `IN PROGRESS`; use an accurate label
  such as `ACTIVE REQUESTS`.
- `in_progress` belongs to the active group; `confirmed` belongs to upcoming.
- In `paid_conflict` and `intervention_required`, no timeline item may be marked
  complete merely because a review has started. Mark only evidence-backed steps
  complete and keep unresolved work current.
- Every intent/paid/legacy state must retain non-empty copy, group, timeline,
  and permitted-action coverage.
- Terminal states must offer no payment or cancellation action. Payment is
  permitted only for `checkout_pending`.

Add regression tests for each correction before considering this task done.

### Task 2 — Add a trusted read-only trip data boundary

The current native context reads the deprecated
`users/{uid}/bookingRequests` collection. Add a read-only repository boundary
for authoritative `bookingIntents` and `bookings`, while retaining legacy data
only as a clearly labelled compatibility fallback.

Requirements:

- Add strict runtime schemas in `@mmg/contracts` for the renter-visible
  `bookingIntents` and `bookings` document shapes. Normalize Firestore
  `Timestamp` values in the adapter before parsing; do not let raw unchecked
  documents enter the UI.
- Add an explicit `RenterTripRepository`/gateway interface with lifecycle-safe
  subscriptions and unsubscribe handling.
- Native implementation: query `bookingIntents` and `bookings` with
  `where('renterId', '==', uid)`, merge by stable ID, and sort client-side by
  `updatedAt`. Do not add a compound sort query unless its composite index is
  declared and emulator-tested.
- Web implementation: deterministic preview trips only in development. It must
  remain conspicuously labelled and must never select the Firebase native SDK.
- Merge priority must be authoritative records first and legacy fallback second;
  do not duplicate a journey if an authoritative record supersedes a legacy
  request.
- Invalid documents must be skipped or surfaced as a safe sync error without
  crashing or exposing raw data.
- All client writes to `bookingIntents` and `bookings` remain denied. Do not
  weaken `firebase/firestore.rules` for this read path.
- Add unit tests for timestamp normalization, invalid documents, merge
  precedence, ordering, unsubscribe behavior, and cross-user-safe query shape.
- If the query shape changes, update `firebase/firestore.indexes.json` and add
  matching rules tests. Otherwise state explicitly that the existing automatic
  single-field indexes suffice.

Firestore target is the existing Standard edition, Native mode `(default)`
database in `africa-south1` for project `mmg-concierge`. Do not create another
database or deploy rules/indexes.

### Task 3 — Harden the detail interaction states

Inspect:

- `apps/mobile/src/features/booking/screens/trip-detail-screen.tsx`
- `apps/mobile/src/features/booking/data/renter-trip-action-gateway.ts`

Required behavior:

- Present one primary state action. Concierge support may be a visually
  secondary fallback, not a competing primary action.
- Payment adapter failure must display: no charge was attempted.
- Cancellation must require confirmation, then display that the journey did
  not change when the adapter is unavailable.
- Support failure must say no message was sent and no journey state changed.
- Prevent double submission while an action is pending.
- Clear or replace stale notices when a new action starts.
- Missing deep link, initializing, cached/offline, adapter failure, terminal,
  and preview modes must be visibly distinguishable and accessible.
- Use accessibility roles/names, polite live-region status, visible focus on
  web, and minimum 44 × 44 tap targets. Do not rely on color alone for state.
- Keep the current quiet-Lagos-luxury art direction: real vehicle image anchor,
  graphite/ivory surfaces, restrained gold, useful icons, and short entrance or
  state motion. Respect reduced-motion preferences on web; do not add generic
  card grids or ornamental gradients.

Add component or browser-flow tests that exercise payment failure,
cancellation confirmation/failure, support failure, missing trip, and a
terminal state. Use the smallest compatible testing dependency; do not replace
the existing test runner.

### Task 4 — Close documentation and repository hygiene

- Update `README.md` so it no longer says the admin queue and renter trip detail
  are the next milestone. Describe them as implemented preview/fail-closed
  surfaces and name their unavailable live integrations.
- Update `docs/IMPLEMENTATION_PHASES.md` and
  `docs/implementation/ANTIGRAVITY_SEQUENCE_1_3_WORKPLAN.md` with an evidence-
  based completion checkpoint. Do not mark a gate complete if its command did
  not pass.
- Explain that the deprecated availability request is an estimate only: it
  holds no dates, takes no payment, and creates no confirmation.
- Inventory untracked generated artifacts. Keep intentional source and docs;
  exclude or remove only known disposable `.playwright-mcp`, root screenshot,
  build, and temporary output artifacts. Do not touch unknown user files.
- Do not edit Firebase client configuration, credentials, auth code, or native
  generated iOS/Android projects.

## Validation rubric

Run from the repository root unless a command shows another directory.

### A. Domain and client checks

```bash
npm test
npm run typecheck
npm run lint
```

Pass criteria: zero failures; state coverage includes every supported state;
no skipped non-emulator renter tests.

### B. Functions and admin regression checks

```bash
npm run functions:typecheck
npm run functions:build
npm run functions:test
npm run admin:typecheck
npm run admin:lint
npm run admin:test
npm run admin:build
```

Pass criteria: all commands exit zero. Do not “fix” a regression by weakening a
contract, App Check, or legal transition rule.

### C. Firestore emulator checks

```bash
npm run test:rules
npm run test:functions:emulator
```

Pass criteria: owner reads work; anonymous/cross-user reads fail; client writes
to authoritative paths fail; overlap and idempotency tests pass. If Java or the
emulator is unavailable, report the exact blocker and do not claim completion.

### D. Expo export and Hermes checks

```bash
cd apps/mobile
npx expo export --platform web --output-dir /private/tmp/mmg-seq3-web
npx expo export --platform ios --output-dir /private/tmp/mmg-seq3-ios
npx expo export --platform android --output-dir /private/tmp/mmg-seq3-android
```

Pass criteria: web export succeeds and both native outputs contain a generated
`.hbc` Hermes bundle.

### E. Browser acceptance matrix

Use deterministic development fixtures. Review at 390 × 844 and at least one
desktop/narrow-web viewport. Save evidence under `output/playwright/` only if
that directory is intentionally retained; otherwise report paths under
`/private/tmp`.

| Flow | Evidence required |
| --- | --- |
| Trips grouping | Accurate labels/counts; active, upcoming, intervention, and past are scannable |
| Checkout detail | Price snapshot and timeline visible; payment failure states no charge occurred |
| Paid pending owner | No payment action; support/cancellation semantics are accurate |
| Cancellation | Confirmation appears; unavailable result says journey did not change |
| Intervention | Concierge is the only action; timeline does not imply resolution |
| Refunded/terminal | No action required; refund copy is provider-state based |
| Missing deep link | Safe recovery UI returns to Trips |
| Accessibility | Keyboard focus, accessible names, live status, and 44px targets inspected |
| Responsive layout | No clipped dates, totals, controls, inspector text, or horizontal overflow |
| Console | Zero application errors; warnings documented and triaged |

### F. Final diff audit

```bash
git status --short
git diff --check
git diff --stat
git diff -- . ':(exclude)package-lock.json'
```

Pass criteria: no secrets, deploy artifacts, unrelated rewrites, unexplained
generated files, or claims of unavailable integrations being live.

## Explicitly deferred—not part of this phase

- Real Paystack initialization, webhook verification, charging, or refunds.
- Shared `mmg-concierge` cloud deployment or billing changes.
- Admin session-cookie authentication and privileged command implementation.
- Owner onboarding, vehicle management, owner earnings, and full owner app.
- Authentication provider/configuration changes.
- Removing the legacy booking-request path before the trusted create-intent
  callable and App Check are operational in a native development build.

## Final handoff format

Return:

1. Outcome by Task 1–4.
2. Files added/changed.
3. Validation table with exact command, exit result, and evidence path.
4. Security statement confirming authoritative client writes remain denied.
5. Known gaps, limited to the explicitly deferred work above.
6. A direct request for Codex review; do not commit or deploy.
