# Antigravity implementation workplan — Sequences 1–3

This document is the task contract for the next MMG Concierge vertical slice.
The architecture handoff in `docs/architecture/` is the source of truth. In
particular, the product is payment-first: no owner or admin action may confirm
an unpaid booking, and no client-supplied price or arbitrary status write is
authoritative.

## Delivery protocol

Antigravity must narrate each sequence with the following concise markers:

1. `[AUDIT]` — relevant existing files, invariants, and risks found.
2. `[PLAN]` — files to change and observable behavior to deliver.
3. `[IMPLEMENT]` — completed checkpoints, including any deliberate deviation.
4. `[VALIDATE]` — exact commands run, their result, and any untested boundary.
5. `[HANDOFF]` — changed files, remaining risks, and the next safe integration step.

Narration is evidence, not proof. Codex reviews the actual diff and reruns the
acceptance checks. Antigravity must not commit, deploy, add secrets, weaken
authentication, or modify files outside this repository.

## Shared product and design direction

- Visual thesis: quiet Lagos luxury for renters; dense, calm operational
  clarity for administrators; graphite, ivory, and restrained MMG gold.
- Mobile content plan: vehicle visual and trip identity, current state,
  chronological next steps, then one primary action or concierge fallback.
- Admin content plan: queue and filters first, booking context second, a focused
  action inspector third. Avoid a dashboard-card mosaic or marketing hero.
- Interaction thesis: restrained screen/list entrance, state-aware timeline
  progression, and tactile hover/press/focus feedback with reduced-motion-safe
  behavior.

## Sequence 1 — Trusted booking operations

Build a contract-first, testable Firebase Functions v2 foundation for the
booking-intent and paid-booking lifecycle without pretending the Paystack
integration is complete.

Required outcomes:

- Shared Zod schemas for command envelopes, date-only booking input, canonical
  errors, price snapshots, booking intents, bookings, and supported states.
- Pure domain logic for Lagos date-only charged days, integer-kobo pricing,
  allowed state transitions, and interval-overlap decisions.
- A Node 22 Functions workspace with testable services for authoritative
  `createBookingIntent` behavior: authenticated actor, server-owned vehicle and
  versioned config lookup, idempotency, sentinel-backed availability
  transaction, held block, price/config/terms snapshot, and expiry.
- Callable adapters may be emulator-ready, but must fail closed when App Check
  or required production dependencies are unavailable. Do not implement a fake
  successful Paystack charge.
- Server-owned Firestore paths are denied for client writes. Renter reads are
  limited to their own intent/booking records; privileged operations rely on
  trusted code and claims. Preserve a deliberate compatibility path only when
  needed to keep the current app functional.
- Composite indexes match every introduced compound query.
- Unit, contract, transaction/idempotency, concurrency/overlap, and negative
  rules tests. Document the Firestore access inventory and devil's-advocate
  results in an untracked `/private/tmp` file while working; summarize the
  conclusions in `[VALIDATE]`.

Sequence 1 acceptance gate:

| Dimension | Mandatory evidence |
| --- | --- |
| Trust boundary | Tampered client prices/statuses cannot become authoritative |
| Money/date correctness | Integer-kobo overflow/rounding and Lagos DST-independent date-only cases pass |
| State safety | Invalid transitions and unpaid confirmation are rejected |
| Availability | Same-vehicle overlap loses atomically; non-overlap succeeds |
| Idempotency | Same actor/key/payload replays; changed payload conflicts |
| Rules | Anonymous/cross-user reads and all client writes to server-owned paths fail |
| Build quality | Functions, contracts, domain, existing mobile checks, and rules syntax/tests pass |

No sequence is accepted with a failed mandatory row.

## Sequence 2 — Admin booking operations screen

Create the private `apps/admin` Next.js operations surface around the trusted
Sequence 1 model. Until session-cookie authentication is connected, the live
server adapter must fail closed; a clearly labelled development fixture mode
may make local visual review possible.

Required outcomes:

- Dark branded navigation shell with a neutral, high-legibility booking queue.
- Filters for actionable state, dates, and search; loading, empty, error,
  offline/unavailable, and retry states.
- Selected-booking inspector with renter-safe identifiers, vehicle/dates,
  verified price snapshot, payment evidence/state, audit timeline, and the
  permitted next action.
- Confirm/reject controls are available only for `paid_pending_owner` and call
  trusted command interfaces. Rejection requires a bounded reason. Unpaid or
  stale records remain non-actionable.
- Keyboard navigation, visible focus, semantic labels, responsive layout, and
  restrained state/selection motion.
- Component/service tests plus a production build. Add browser-flow coverage
  when the local environment supports it.

Sequence 2 acceptance gate:

| Dimension | Mandatory evidence |
| --- | --- |
| Operational correctness | Only legal actions are presented and dispatched |
| Security | No Admin SDK secret or privileged Firestore write reaches browser code |
| State completeness | Loading, empty, failure, retry, stale, and success are demonstrable |
| Accessibility | Queue and action dialog are usable by keyboard and expose names/states |
| Responsive UI | Queue and inspector remain usable at desktop and narrow widths |
| Build quality | Typecheck, tests, lint, and Next.js production build pass |

## Sequence 3 — Complete renter trip experience

Replace the flat trips list with a truthful trip/request detail flow driven by
the shared booking-intent and booking states. Preserve deterministic web preview
data while native live adapters use the trusted boundary.

Required outcomes:

- Trips list separates active, upcoming, intervention, and past records without
  misleading counts or labels.
- A detail route shows the vehicle visual, journey dates, server price snapshot,
  current status, chronological timeline, and a single state-appropriate action.
- Checkout-pending can offer the payment handoff only through an injected
  adapter. If Paystack is not connected, show a clear unavailable/retry or
  concierge fallback—not a simulated success.
- Paid-pending-owner, confirmed, intervention, cancelled/refunded, and terminal
  states have accurate copy and disabled/available actions.
- Cancellation and support entry points use explicit interfaces and honest
  pending/failure states; no irreversible fake action.
- Deep-link-safe missing/loading/error/offline states, accessible labels and tap
  targets, restrained entrance/timeline motion, and mobile/web responsiveness.
- Contract/component tests, mobile TypeScript/lint/tests, Expo web export, and
  iOS/Android Hermes bundle checks.

Sequence 3 completion checkpoint (August 13, 2026):

- Active grouping is labelled `ACTIVE REQUESTS`. `in_progress` is active;
  `confirmed` is upcoming. Intervention timelines mark only evidence-backed
  payment as complete and keep resolution current.
- Native adapters subscribe to `bookingIntents` and `bookings` with
  `renterId == uid`, normalize timestamps, skip invalid documents, and merge
  authoritative records ahead of the labelled legacy estimate path. Web never
  selects the Firebase native SDK.
- Payment, cancellation, and support adapters remain unavailable and say so.
  Missing deep links recover to Trips. Component/flow tests and a Playwright
  fixture pass exist under `/private/tmp/mmg-seq3-browser/`.
- `npm test`, typecheck, lint, Functions, Admin, emulator, Expo web, and
  Hermes export gates were rerun after the implementation. Do not treat
  Paystack, admin session cookies, or owner workflows as complete.

Sequence 3 acceptance gate:

| Dimension | Mandatory evidence |
| --- | --- |
| Truthfulness | UI never claims payment, confirmation, cancellation, or refund without corresponding state |
| Journey coverage | Every supported intent/booking state has copy, timeline, and action rules |
| Failure handling | Missing record, offline cache, adapter failure, and retry are visible/testable |
| Accessibility | Screen-reader labels, status semantics, focus/tap targets, and contrast are reviewed |
| Visual quality | Image-led identity, clear hierarchy, restrained gold, purposeful motion |
| Build quality | Unit checks, typecheck, lint, export, and native Hermes bundles pass |

## Final integration rubric

Codex accepts the combined slice only when all three sequence gates pass and:

- there are no unexplained generated files, secrets, deployments, or unrelated
  edits;
- schemas, functions, rules, admin, and mobile agree on names and transitions;
- a fresh install can run the documented checks from the repository root;
- remaining Paystack/session-cookie work is explicitly marked as unavailable,
  not silently mocked in production paths;
- the diff is reviewable and the README/phase checkpoint accurately describes
  what is and is not complete.
