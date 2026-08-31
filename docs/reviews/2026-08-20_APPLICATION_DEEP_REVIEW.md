# MMG Concierge application deep review

> **Environment supersession (2026-08-30):** ADR 0008 replaces this review's
> old three-project assumptions. The current topology is emulator ->
> `mmg-concierge-dev` development/integration -> `mmg-concierge` production,
> with no dedicated staging project. The findings remain historical evidence.

**Review date:** 2026-08-20
**Reviewed baseline:** `main` at `8c61703`
**Experimental branch reviewed:** `codex/wp4-booking-operations` at `7c698db`
**Authority:** the architecture handoff remains the product and technical source of truth.

## 1. Executive verdict

MMG Concierge has a credible foundation, not a completed application. Owner
verification and the core vehicle submission/moderation path are the strongest
vertical slices. Renter profile, live discovery, and booking contain meaningful
code, but their milestone labels previously overstated their end-to-end
readiness. Paystack work exists only on an unmerged experimental branch and
must not be deployed or merged wholesale.

The immediate priority is a **stability and truthfulness sprint** before adding
more product surface. Fix the known renter crashes, make web/native runtime
boundaries deterministic, reconnect the current booking UI to the trusted
booking-intent path, and restore a repeatable local validation gate. Only then
should the hardened parts of the WP4 branch be selectively ported.

## 2. Evidence and review limits

- `main` was clean and matched `origin/main` at the start of review.
- `codex/wp4-booking-operations` is one commit ahead of `main`, with 120 changed
  files and approximately 8,500 insertions. It is not merged.
- No `cloud.md` or similarly named project handoff was found in the working
  tree or branch inventory.
- Ignored local `apps/functions/.env` and `apps/mobile/.env` files exist. Their
  contents were deliberately not printed or copied into this report.
- Git history contains no real-looking tracked Paystack secret. The only
  `sk_test_*` / `sk_live_*` matches are obvious dummy values in branch tests.
- The checked-in static Expo web export rendered the home and a preview vehicle
  detail, but it predates the current source and cannot validate current runtime
  behavior.
- Current Expo startup/configuration stalled after environment loading. Root
  Vitest and both Functions/Admin TypeScript checks also failed to complete in
  the review window and were terminated. This is a **blocked validation gate**,
  not evidence that those checks passed or failed.

## 3. Current capability assessment

| Area | Evidence-based status | What is trustworthy now | What is not complete |
|---|---|---|---|
| Experience foundation | Complete foundation | Expo/Next monorepo, navigation, Prado-led brand, preview assets | Current-source local web/native smoke gate is not healthy |
| Authentication | Substantial foundation | Email/password, Google, role-aware onboarding, native Firebase structure | MFA and production Phone Auth proof are absent; Expo Go remains unsupported |
| Owner verification | Substantially complete | Private ID upload, magic-byte validation, server decisions, staff session desk, audits, retention job | Controlled-release operational sign-off still required |
| Vehicle inventory/moderation | Substantially complete, one required architecture gap | Draft/upload/finalize/submit/review/visibility, image variants/promotion, owner fleet and staff desk | `submitVehicleRevision` is absent; abandoned vehicle-upload cleanup is absent |
| Renter profile/privacy | Partial | Profile/address/terms screens and server commands, deletion-request state | Phone is not authoritatively linked/verified; deletion is a request only, with no reauth/erasure/anonymization completion flow; MFA absent |
| Discovery/search/detail | Partial and currently unstable | Strict renter projection, approved-only reads, Haversine/ranking helpers, detail/browse UI | Known native map-sheet crash; web Firebase boundary is not deterministic; callable search is not integrated, ignores availability, and fabricates unknown places |
| Booking foundation | Partial | Server-priced `createBookingIntent`, overlap/hold transaction foundation, trusted read models | Current renter CTA still writes a legacy local/direct-Firestore estimate and does not create an authoritative hold |
| Paystack | Experimental branch only | Adapter, initialize/verify service prototypes and unit mocks | No webhook, signature verification, durable dedupe/reconciliation, refunds, Secret Manager binding, or sandbox E2E exit proof |
| Owner booking operations | Experimental branch only | Calendar/owner action prototypes exist on WP4 branch | Not merged, not validated against the full payment lifecycle |
| Notifications/chat/lifecycle | Not implemented | Some outbox records exist at submission boundaries | No production FCM processor, payment-gated chat, or complete-rental lifecycle |
| Ledger/wallet/withdrawal | Not implemented | Architecture/ADR boundary only | No append-only ledger, wallet projection, finance approval, or withdrawal operation |
| Admin completeness | Partial | Owner and vehicle moderation; booking read/fixture foundation | Payments/refunds, cases, users/privacy, configuration, finance, ledger and complete role desks remain |
| Release hardening | Not started | Some historical unit/emulator evidence | CI reliability, current emulator proof, native E2E, Crashlytics/alerts, privacy inventory, runbooks and controlled-release sign-off |

## 4. Confirmed and likely app breakages

### P0 — Native renter pickup/map sheet can crash

`apps/mobile/src/features/discovery/components/pickup-district-sheet.tsx`
renders a raw HTML `<div>` inside a React Native `Modal`. React Native does not
have a native host component named `div`. Opening this sheet is therefore a
direct crash candidate and matches the reported map/pickup failure.

**Repair:** replace it with `View`, add a native render/interaction test, and
smoke the sheet on both iOS and Android development builds.

### P1 — Current web preview has an inconsistent Firebase boundary

The web discovery gateway imports the Firebase Web SDK and calls
`getFirestore()` without a discoverable web `initializeApp()` path. Meanwhile,
the engineering guide says browser previews use deterministic data and never
touch native Firebase. The preview gateway exists but is not selected by the
current discovery factory. The same class of issue exists in the web renter
profile and owner-fleet adapters, while booking preview remains local-only.

This can make “As a renter”, product/detail navigation, and browse behavior
depend on whether a default Firebase app happens to exist. A stale static build
can appear healthy while current source fails.

**Repair:** choose one explicit web mode and enforce it everywhere:

1. deterministic fixture preview for local design review; or
2. explicitly configured Firebase Web SDK for a live web application.

The present architecture and guides imply option 1 for local preview. Live web
must be a separate, intentional decision rather than an accidental fallback.

### P1 — App Check is initialized twice

The root layout initializes App Check and handles failure. `AuthProvider` calls
the same cached initialization promise again without a rejection handler. If
native App Check initialization fails, that second call may become an
unhandled rejection near authentication/onboarding.

**Repair:** initialize App Check once at the app boundary, expose a ready/error
state where callables need it, and remove the unhandled duplicate call.

### P1 — Product/detail failures are hidden as “unavailable”

Vehicle detail and booking review catch gateway failures and collapse them into
“listing no longer available.” This prevents a hard render crash but hides
configuration, permission, offline, and schema errors as a false product state.

**Repair:** distinguish missing, offline/provider failure, permission denied,
and invalid-record states; add retry and structured, non-PII diagnostics.

## 5. Architecture compliance findings

### Discovery is not the architecture-defined live search yet

- `resolveSearchPlace` and `searchVehicles` use `enforceAppCheck: false`.
- `resolveSearchPlaceService` has no shared Zod command boundary and maps any
  unknown query to Victoria Island while claiming it is within Lagos.
- `searchVehiclesService` accepts dates but does not filter availability.
- The server reads up to 100 public vehicles, then issues an image query for
  each vehicle; there is no cursor or geohash/bounding-box query plan.
- Mobile bypasses both callables and performs Firestore reads, distance,
  filtering, and ranking on the client. Search dates are not part of that path.

The current code is a useful discovery prototype, but it is not a completed
server-side Lagos search boundary.

### The renter booking CTA bypasses the trusted booking intent

`BookingReviewScreen` calls `requestAvailability`, which creates a client ID,
writes a local estimate, and optionally performs a client Firestore write. It
does not call the existing `createBookingIntent` function and therefore does
not obtain an atomic date hold or server-authoritative quote snapshot.

The screen labels this as an earlier estimate flow, which is honest, but it
means the merged product journey stops before authoritative booking.

### Preview and authoritative pricing can diverge

`calculateBookingQuote` delegates to the canonical calculation function but
injects fixed default fee/commission constants and `client-preview` versions.
The server reads versioned trusted configuration. The two calculations are
only identical while live configuration equals those defaults.

**Repair:** return a server quote/config snapshot for renter review, or pass the
same versioned fee inputs to the preview function. Never present client default
pricing as the payable amount.

### Vehicle moderation still lacks the approved-listing revision path

The architecture requires `submitVehicleRevision` so an approved live version
can remain available while material edits are reviewed. No callable/service by
that name exists on `main`. Editing/re-submission must not mutate an approved
renter-visible listing in place.

### Renter privacy is a foundation, not a closed WP

The profile command requires verified email but does not prove the submitted
phone is linked/verified in Firebase Auth. Account deletion transitions the
profile to `deletion_requested`; there is no completed reauthentication,
retention/legal-hold decision, PII anonymization/deletion, Auth deletion, or
public deletion-request surface. MFA is also absent.

## 6. Paystack branch decision

Do **not** merge or deploy `codex/wp4-booking-operations` as one commit. It is a
prototype/reference branch that contains useful work mixed with unrelated UI
and generated-asset changes.

Critical gaps:

1. There is no unauthenticated `onRequest` Paystack webhook with raw-body HMAC
   SHA-512 verification, payload limits, event dedupe, and fast acknowledgement.
2. There is no scheduled reconciliation job for stale pending references.
3. The adapter reads `process.env.PAYSTACK_SECRET_KEY`; Functions do not bind a
   Secret Manager secret through `defineSecret` / `secrets` options.
4. Initialization references include `Date.now()` and the provider call occurs
   outside the transaction without a durable provider-operation idempotency
   record. Concurrent retries can create multiple payable references.
5. The second transaction does not re-check the intent state/reference/expiry
   before binding the provider result.
6. Verification does not validate returned currency and the service does not
   require the returned reference to match the requested reference.
7. A client callable drives successful verification. Architecture requires a
   signed webhook or authorized reconciliation to deliver value; a redirect or
   client callback must never be sufficient.
8. Provider/network messages can cross the safe error boundary.
9. Deep-link callback construction is not proven across dev builds and release
   scheme configuration.
10. The branch UI always claims “Paystack test sandbox” and displays test-card
    instructions, while the adapter classifies any non-`sk_test_` key as live.
    If a live key were misconfigured, the UI could falsely promise that no real
    funds will be charged. Test-mode messaging and payment enablement must be
    driven by a fail-closed server/environment policy, not hardcoded copy.
11. Tests cover mocks, not webhook signature/replay, duplicate events, wrong
    currency/reference, concurrent initialization, emulator integration, or a
    deployed Paystack test-mode journey.

The ignored local Functions `.env` should not become the production secret
source. If a real secret key was pasted into chat, screenshots, shared logs, or
any other external agent context, rotate it in Paystack before reuse. A mobile
Paystack public key is not sufficient for this hosted-checkout architecture and
is not currently the integration boundary.

## 7. Recommended delivery order

### Sprint A — Stabilize renter runtime and restore the gate

1. Fix the native pickup sheet and remove duplicate App Check initialization.
2. Make web preview mode deterministic across auth, profile, discovery,
   booking, and owner gateways.
3. Add navigation smoke coverage for onboarding “As a renter”, every preview
   product card, Browse, vehicle detail, pickup/map sheet, and booking review.
4. Diagnose Expo/Vitest/TypeScript non-termination and make `npm run check`
   repeatable. Re-run Firestore and Storage emulator suites.
5. Add truthful error/empty/offline states so provider failure is not presented
   as “vehicle missing.”

**Exit:** current source boots; the named renter paths do not crash on web,
iOS, or Android development builds; full checks finish; screenshots and logs
are attached to the handoff.

### Sprint B — Finish renter discovery and booking intent integration

1. Define Zod contracts for place resolution/search and enforce the chosen
   Auth/App Check policy explicitly.
2. Replace fabricated unknown-place resolution with Google Places or an honest
   unsupported/not-found result; retain Lagos bounding checks.
3. Implement a paginated server search plan and include availability exclusion
   for the requested half-open date interval.
4. Wire booking review to a server quote and `createBookingIntent`; retire the
   direct-client legacy request from the primary journey.
5. Add owner availability-block/calendar management without implying payment.
6. Complete verified-phone enforcement and the account-deletion operational
   workflow, or relabel WP1 as explicitly foundation-only until done.

**Exit:** approved inventory can be searched for Lagos dates and converted into
one authoritative held intent with an identical displayed/server price.

### Sprint C — Selectively rebuild WP4 and operational surfaces

1. Port calendar and owner-response domain/contracts from the branch in small,
   reviewed commits.
2. Rebuild Paystack around Secret Manager, durable initialization idempotency,
   signed webhooks, strict amount/currency/reference/environment validation,
   event dedupe, reconciliation, and explicit test-mode-only controls.
3. Add admin payment/refund/intervention timelines and operational alerts.
4. Continue WP5 lifecycle/notifications, WP6 ledger/manual withdrawals, WP7
   remaining desks, then WP8 release hardening.

**Exit:** only a signed webhook or authorized reconciliation can produce a paid
booking; duplicate events have one result; no secret reaches a client bundle;
test-mode E2E and failure drills pass before any live credential is enabled.

## 8. Product decisions to confirm before Sprint B/C

The existing architecture is internally consistent and should remain the
default unless explicitly changed:

- payment follows an atomic server-priced date hold;
- payment success comes from webhook/reconciliation, never the app callback;
- a paid booking then awaits owner confirmation or staff intervention;
- every MVP vehicle is chauffeured and delivered;
- Prado leads editorial ordering without becoming a database/security category.

One implementation-direction decision does need explicit confirmation: whether
the browser surface remains a deterministic design/demo preview (the current
documented intent) or becomes a supported live Firebase renter web app. The
runtime setup, auth model, App Check, testing, and release scope differ enough
that agents must not infer this choice.
