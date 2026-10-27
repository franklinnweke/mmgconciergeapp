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
- Pickup uses a bounded foreground device-location fix or a manually selected address, followed by explicit renter confirmation. GPS targets 50m accuracy and rejects fixes whose reported uncertainty exceeds the map's 300m adjustment radius; if no usable fix arrives, direct the renter to manual search. GPS is optional; do not claim a fix verifies a property entrance. The adjustment limit is a radius, not a property boundary.
- Confirmed customer pickup coordinates/address/entrance notes remain separate from approximate vehicle discovery centres and private garages. Preserve the pickup into renter Trip Detail, including after request-to-booking conversion; never invent one for historical records.
- Authorized `support`/`super_admin` dispatch staff may read the exact pickup and confirm `confirmedPickupTime` as `HH:mm` on the request start date in Africa/Lagos. Confirmation uses expectedVersion, idempotency and domain/Admin audits; it does not change price, dates, payment, booking or availability state. Owners do not receive this exact pickup projection.
- New renter dispatch-time fields require explicit `includePickupDispatch` opt-in on the list command so existing strict-schema TestFlight clients remain compatible. Deploy the updated list callable before releasing a client that opts in.
- Renter baseline access requires an authenticated, verified-email identity.
- Full name, phone, profile photo, delivery address and similar renter details are profile enrichment, not government identity verification.
- Renter checkout does **not** require Firebase Phone Auth or SMS OTP. Contact phone is ordinary operational profile/request data.
- Never require renter government ID, driving licence, selfie or DOB.
- Government-ID and stronger phone verification belong only to owner onboarding.
- Booking dates are Africa/Lagos date-only half-open intervals `[startDate, endDate)`.
- Trusted money is integer NGN kobo and server-authoritative.
- Exact vehicle address/coordinates and owner-sensitive data remain private.
- Owner processed vehicle photos remain client-denied in Storage. Owner previews use a vehicle-ownership-checked callable that derives only the processed card path and returns an ephemeral five-minute signed URL; never accept client Storage paths, persist preview URLs, or broaden private Storage reads.
- Only approved, active, discoverable vehicles are renter-visible.
- Vehicle discovery uses approximate Lagos base-area coordinates, never the exact garage address. If both approximate coordinates are absent, the server may use the listing's explicitly selected canonical Lagos area centre, rounded to the existing discovery precision. This is area-level positioning, not a verified garage pin; never write that centre into private exact-location fields or renter pickup data. Partial/malformed coordinate pairs fail closed; no area fallback is allowed for unknown areas. Approval/activation/publication must satisfy the same renter-detail contract as discovery.
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

The booking concierge desk uses capabilities rather than a new role. `bookings.manage_requests` is bounded to soft-request approval/decline, opening the payment window and operational pickup-time confirmation/dispatch reads. It does not grant refunds, payouts, reassignment, or arbitrary paid-booking mutation.

### Design doctrine and restraint rules
1. **Content before chrome**: The vehicle, pickup location, and trip state dominate; navigation and decorative frames recede.
2. **Hierarchy through spacing and placement before decoration**: Rely on grouping, typographic hierarchy, and layout rather than outlined card-in-card layers and badges.
3. **Use the MMG gold deliberately, not habitually**: Gold signifies MMG brand primary action and active selection. Status values use clear semantic colors (green, blue, amber, red) rather than brand gold. Secondary labels, borders, and metadata stay quiet.
4. **Use familiar mobile behaviors unless MMG genuinely needs something different**: Standardize headers, dismissals, pickers, and inputs rather than inventing bespoke controls.
5. **Simple means exactly enough information, not the fewest elements possible**: Retain critical context (availability, cancellation consequences, payment timer); remove internal classifications and repetitive service promises.
6. **Delight comes from confidence, responsiveness, and craft, not ornamental effects**: Smooth transitions, truthful states, and instant inline feedback beat disruptive success modals and marketing decorations.

Labeled mobile action buttons use the shared `radii.button` (12-point softly rounded rectangle), not capsule shapes. Keep circular navigation/icon controls, avatars and compact status/selection chips distinct; preserve existing touch targets and press feedback.

Admin review screens follow **task, evidence, next safe action**: evidence beside required unchecked verification/inspection checks, one state-valid primary action, and exceptional actions and technical/audit metadata behind disclosure. Never simplify by auto-checking evidence, bypassing required reasons, exposing invalid transitions, or combining request approval with opening payment.

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

Historical unpaid `intent_created` holds may be withdrawn through the renter-owned `cancelUnpaidBookingIntent` callable, including after their rental dates pass. It atomically releases only the matching held block, advances the availability sentinel and records `expired` plus `cancelledByRenterAt`; mobile presents that marker as cancelled in Past. Request-first holds continue through `cancelRentalRequest`. Payment-in-flight, payment-bound or inconsistent historical records must not be released by the unpaid-hold command. This does not authorize refunds or deleting trip history.

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

Validated Build 31 TestFlight source checkpoint merged to `main`:

`44b677f35c849a035811ed48ed84dbaf84539467`

Build 31 was created from the exact checkpoint above:

- build number: `31`
- EAS build ID: `da2ca529-9e27-4783-a920-7f9705426246`
- submission ID: `1640bfe8-f7c4-47ff-b6be-1e42924ad799`
- development Firebase config selected (`mmg-concierge-dev`)
- resolution included: PR #43 (`fix(contracts): use package import in rental-request for Metro resolver`)

Validated renter cancellation lifecycle source checkpoint merged to `main`:

`4ee5113b0232706ea0afd31c15cbdfe13b52075b`

Merge sequence:
- PR #45 (`feat(booking): add renter cancellation lifecycle`) merged into `main`.
- Post-merge CI #109 (`34537683318`) passed green across all jobs (Firebase Rules, Quality, Functions Emulator, Gate).

Validated Admin fail-closed environment source checkpoint merged to `main`:

`bfc136778f309a4eb4ea6bfb07353f86e9273c50`

Merge sequence:
- PR #46 (`fix(admin): fail closed on missing or invalid Firebase environment configuration`) merged into `main`.
- Post-merge CI #114 (`34659825955`) passed green across all jobs (Firebase Rules, Quality, Functions Emulator, Gate).

Validated exact pickup location model and journey context source checkpoint merged to `main`:

`ad041aaa832d4d01e1a63de14335f402bdab2b75`

Merge sequence:
- PR #48 (`feat(mobile): implement exact pickup location and unified journey context (WP1A)`) merged into `main`.
- Post-merge CI (`34670726743`) passed green across all jobs (Firebase Rules, Quality, Functions Emulator, Gate).

Validated mobile truthfulness, fake data removal, and dead action subtraction source checkpoint merged to `main`:

`dd8c845c6b0f4b8bb7e191a630bc3fcda9bb43be`

Merge sequence:
- PR #49 (`feat(mobile): remove misleading UI behavior, fake data, and dead actions (WP1B)`) merged into `main`.
- Post-merge CI (`34671191503`) passed green across all jobs (Firebase Rules, Quality, Functions Emulator, Gate).

Validated coordinate-first pickup location model source checkpoint merged to `main`:

`03daa27c51dc27005d409ce2757bdf8ff6a738f6`

Merge sequence:
- PR #50 (`feat(discovery): implement coordinate-first pickup location model (WP1A.1)`) merged into `main`.
- Post-merge CI (`34672463224`) passed green across all jobs (Firebase Rules, Quality, Functions Emulator, Gate).

Validated pickup correctness, privacy deletion, and service boundary source checkpoint merged to `main`:

`9783b1d239848dc3fae692e4ed1613666955940d`

Merge sequence:
- PR #51 (`fix(discovery): address pickup place search precision, silent defaults, service envelope, and privacy deletion`) merged into `main`.
- Post-merge CI (`34677815474`) passed green across all jobs (Firebase Rules in 1m22s, Functions Emulator in 1m31s, Quality in 3m23s, Gate in 2s).

Validated renter commercial journey subtraction source checkpoint merged to `main`:

`cad04293718fabab302971b14e2b8cf83b7747dd`

Merge sequence:
- PR #52 (`feat(mobile): implement renter commercial journey subtraction (WP2)`) merged into `main`.
- Post-merge CI (`34678508166`) passed green across all jobs (Firebase Rules in 1m31s, Functions Emulator in 1m22s, Quality in 3m17s, Gate in 4s).

Validated trip and request state simplification source checkpoint merged to `main`:

`0c9bfe573e4b09e499758cb16437a0193cf94241`

Merge sequence:
- PR #53 (`feat(mobile): simplify trip and request state presentation (WP3)`) merged into `main`.
- Post-merge CI (`34679177915`) passed green across all jobs (Firebase Rules in 1m28s, Functions Emulator in 1m38s, Quality in 2m52s, Gate in 4s).

Validated renter correctness and WP3 refinements source checkpoint merged to `main`:

`0cc82a069e060e77c2be4945f28d8062772fa3ee`

Merge sequence:
- PR #54 (`fix(renter): resolve deletion transaction ordering, service envelope, hydration race, and trip presentation`) merged into `main`.
- Post-merge CI (`34691109986`) passed green across all jobs (Firebase Rules in 1m27s, Functions Emulator in 2m10s, Quality in 2m32s, Gate in 3s).

Validated real provider-backed pickup search and server authority source checkpoint merged to `main`:

`1c8f1263281c5bd6e1ff1e764ec8d2d1fb87ae55`

Merge sequence:
- PR #55 (`feat(discovery): real provider-backed pickup search and server authority (WP1A.2)`) merged into `main`.
- Post-merge CI (`34732098816`) passed green across all jobs (Firebase Rules in 1m27s, Functions Emulator in 1m44s, Quality in 3m3s, Gate in 4s).

Validated discovery operational hardening and Places compliance source checkpoint merged to `main`:

`9dbfa90872f7fa69a00be0287d5f3bff9af63065`

Merge sequence:
- PR #56 (`fix(discovery): operational hardening, provider failure handling, and Places compliance (WP1A.2a)`) merged into `main`.
- Post-merge CI (`34732955182`) passed green across all jobs (Firebase Rules in 1m25s, Functions Emulator in 1m45s, Quality in 3m2s, Gate in 2s).

Validated request resilience, Places compliance, and pickup pin adjustment source checkpoint merged to `main`:

`6ce34a706596ef553e144a726ea8aa61730032b4`

Merge sequence:
- PR #57 (`fix(discovery): address request resilience, Places compliance, and pickup pin adjustment`) merged into `main`.
- Post-merge CI (`34734418860`) passed green across all jobs (Firebase Rules in 1m34s, Functions Emulator in 1m50s, Quality in 3m27s, Gate in 3s).

Validated native MapView pickup pin, arrival perimeter bounding, and dev deployment source checkpoint:

`8333c38746febf582614a066202b297cd7ebed1b`

Merge sequence:
- PR #58 (`feat(discovery): native MapView, arrival perimeter bounding, and dev deployment`) merged into `main`.
- Post-merge CI (`34736350429`) passed green across all jobs (Firebase Rules in 1m59s, Functions Emulator in 2m20s, Quality in 3m25s, Gate in 3s).

Validated durable government ID deletion, outbox worker, and truthful retention source checkpoint merged to `main`:

`29874f4d4f1e73e23e6471f609f0519bdd41dd03`

Merge sequence:
- PR #69 (`fix(owner): non-blocking id upload, robust storage deletion lifecycle, and truthful error copy`) merged into `main` (`9d6addf0976615d7dc4c9651ef6551533c216863`).
- PR #70 (`fix(owner): make government ID deletion durable`) merged into `main` (`29874f4d4f1e73e23e6471f609f0519bdd41dd03`).
- Post-merge CI #183 (`34906970425`) passed green across all jobs (Firebase Rules in 1m43s, Functions Emulator in 1m50s, Quality in 3m13s, Gate in 3s).

Validated Build 35 TestFlight source checkpoint merged to `main`:

`3ee70afff047bb160f47fe721a0fe06544ff1cbf` (parent `29874f4d4f1e73e23e6471f609f0519bdd41dd03`)

Build 35 was created from the exact checkpoint above:

- build number: `35`
- EAS build ID: `1f741d3b-adc8-417b-b3b4-42558c2c545e`
- submission ID: `aa60892f-4f81-48cd-8687-ceed3461d0d8`
- App Store Connect App ID: `6801330614`
- development Firebase config selected (`mmg-concierge-dev`)
- profile: `testflight-development`
- production APNs entitlement enabled (`MMG_APNS_ENV=production`)
- resolution included: Non-blocking owner ID upload and review-submission coordination, guaranteed atomic 3-phase government ID storage deletion lifecycle with unbounded capped-backoff outbox worker, starvation prevention via due-job indexing, race-proof upload target revalidation, un-swallowed storage deletion errors, and truthful privacy retention disclosures.

Validated Build 43 TestFlight source checkpoint merged to `main`:

`4a22e27a761dbd99cb017863df3ea73da40565e9`

Build 43 was created from the exact checkpoint above:

- build number: `43`
- EAS build ID: `f540fc14-3f29-47e6-adf6-0d6baa8e848e`
- submission ID: `89b546af-3d14-4b7f-b6d2-d99b8bc34592`
- App Store Connect App ID: `6801330614`
- development Firebase config selected (`mmg-concierge-dev`)
- profile: `testflight-development`
- production APNs entitlement enabled (`MMG_APNS_ENV=production`)
- resolution included: Softly rounded rectangular action buttons across mobile UI (PR #94), and monorepo build packaging with `EAS_SKIP_AUTO_FINGERPRINT=1`.

Validated Build 45 TestFlight source checkpoint merged to `main`:

`49bbe0e5bbcd8e506131396ed2f009e8352f6b2f`

Build 45 was created from the exact checkpoint above:

- build number: `45`
- EAS build ID: `861d9540-f1cd-439e-8f9a-05d437b333f0`
- submission ID: `9b489d3f-975b-4add-a9eb-54844a154f6a`
- App Store Connect App ID: `6801330614`
- development Firebase config selected (`mmg-concierge-dev`)
- profile: `testflight-development`
- production APNs entitlement enabled (`MMG_APNS_ENV=production`)
- resolution included: Mobile restraint pass (PR #96: simplified interface copy, removed decorative motion, cleaned up orphaned owner location helper).

Current state:
- Request-first architecture: merged to `main`
- Renter release-payment-window action: merged to `main`
- Renter cancellation lifecycle (unpaid, payment in-flight, future paid booking, scheduled resolver, zero invented economics): merged to `main`
- Admin fail-closed Firebase environment configuration: merged to `main`
- Mobile exact pickup location model & unified journey context (WP1A): merged to `main`
- Mobile truthfulness & fake data/dead action subtraction (WP1B): merged to `main`
- Mobile coordinate-first pickup location model (WP1A.1): merged to `main`
- Pickup correctness, privacy deletion, and service boundary enforcement: merged to `main`
- Real provider-backed pickup search & server authority (WP1A.2: Google Places API (New) two-step backend with session tokens and Lagos bounding box restriction, mandatory server-authoritative pickup validation and derived service area on rental requests, operational coordinates and address in rentalRequests and private rentalRequestContacts, zero exposed coordinates in owner projection, zero Victoria Island/Eko Hotel fallbacks, interactive delivery card, pickup confirmation step with optional entrance note): merged to `main`
- Discovery operational hardening & Places compliance (WP1A.2a: root deploy script updated with searchPickupPlaces and resolvePickupPlace, loud CommandError handling on missing API key / HTTP failure / network failure, Google Places attribution in mobile sheet, Places API field mask pricing documentation, pre-launch Places caching policy review recorded): merged to `main`
- Request resilience, Places compliance, and pickup pin adjustment (Booking Review decoupled refresh, Trip Detail bounded auto-refresh & settled missing state, minimum 12sp text attribution, Google attribution on Confirmation card, codified TOS §3.2.3 storage compliance): merged to `main`
- Native MapView pickup pin & property-perimeter bounding (Uber-style native MapView with stationary center pin, spring lift/drop animation, strict 300m arrival perimeter bounding to prevent address drift, 15m micro-nudge adjustment buttons, reset center button, distance offset badge, and luxury dark map styling): merged to `main`
- Renter commercial journey subtraction (WP2: Home, Browse, Vehicle Detail, Booking Review): merged to `main`
- Trip and request state simplification (WP3: human vocabulary, Trips list, Trip Detail subtractions, real actions only): merged to `main`
- Renter correctness & privacy transaction ordering (WP3 refinements: upfront reads, targeted idempotency, envelope unification, hydration race, no name gating, truthful terminal states): merged to `main`
- Non-blocking Owner ID upload and Review & Submit live status coordination: merged to `main`
- Durable government ID deletion outbox (atomic review transaction creation, unbounded capped-backoff retries, due-job querying preventing starvation, race-proof target revalidation, un-swallowed storage deletion errors, and scheduled worker): merged to `main`
- Mobile renter/owner integration: merged to `main`
- Admin concierge controls & cancellation intervention desk: merged to `main`
- Main CI: green
- Production `mmg-concierge`: untouched
- Firebase development deployment (`mmg-concierge-dev`): deployed. Use Issue #35 and the exact development-CD deployment step for current resource/revision evidence; the historical 19-Function count is no longer current. A feature branch passing tests does not mean its runtime changes have been deployed.
- Native Build Milestone: Build 45 active on TestFlight (submitted to Apple Connect, processing)
- Android native validation: in progress on Pixel 7 API 35

Do not call the release complete until Admin is deployed by the VPS/Admin agent and end-to-end human acceptance has been completed on the physical device.

Current auth/UI expectations:

- Signed-out and unverified-email route guards use the explicit `/auth` entry. Never redirect those guards to `/`: Expo Router can resolve it to the current renter/owner index and create a redirect loop. The launch index and `/auth` share the same account-entry component.
- Google authentication uses the Firebase-environment-matched OAuth client.
- Apple authentication uses nonce hashing, Firebase credential exchange, first-login name persistence when supplied, cancellation handling, and Expo's native Apple button.
- Social sign-in presentation should place Google first and Apple immediately underneath on supported iOS devices.
- Authenticated verified users land in renter/Home by default regardless of compatibility `accountType`.
- `List your car` carries owner intent into owner onboarding.
- Renter checkout does not use Firebase Phone Auth. Owner onboarding may still do so.

Pre-launch compliance and policy status:

- Google Places API compliance (Google Maps Platform TOS §3.2.3):
  - Place IDs: Stored indefinitely in rental requests and booking records as explicitly permitted under TOS §3.2.3(a).
  - Transaction fulfillment records: Exact coordinates (`latitude`, `longitude`) and formatted addresses are captured and stored in `rentalRequests` and private `rentalRequestContacts` strictly as immutable customer transaction records for physical chauffeur dispatch and delivery fulfillment. They are never used to build an independent geospatial database or directory.
  - Ephemeral search data: Search queries, autocomplete suggestion lists, and temporary session tokens are ephemeral in-memory state only and are never stored in persistent databases.
  - Maps/attribution: Google Places pickup data must use an explicitly configured Google map, not implicit iOS MapKit. Space-limited pickup sheets use 12sp-or-larger "Google Maps" text attribution for provider content; preserve the native map's visible attribution above overlays. Native iOS Maps requires its environment-specific SDK key and a new binary; missing configuration must not silently select MapKit. See `docs/operations/PICKUP_DISPATCH_ACCEPTANCE.md` for setup and remaining device gates. This is not a blanket legal/compliance sign-off.
- Apple private email relay/operator-domain verification as applicable.
- Apple token revocation on account deletion before public App Store release.

Development CD uses Google Workload Identity and is gated by `MMG_DEV_CD_ENABLED=true`. It deploys development Firebase resources after green `main` CI when backend resources changed (or an authorized manual run requests deployment). Verify that the actual deployment step ran: a successful skipped workflow is not deployment evidence. EAS builds and Admin/VPS deployment remain separate. Production Firebase and live Paystack remain out of scope without explicit authorization.

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

- Mobile request retries use the full schema-normalized command payload, including pickup, to identify an attempt. Persist only its opaque hash and idempotency key per authenticated account, not contact/pickup data. Resume the same unresolved attempt after restart; changed input must not reuse its key.
- BookingProvider owns request refresh and historical trip-image recovery. Poll only while active, serialize/deduplicate foreground and mutation refreshes, and discard results after session disposal. A reopened checkout reconciles its existing server intent before offering payment; connectivity errors must not unlock a new charge.
- Native crash collection is off by default. The development TestFlight opt-in additionally checks the actual Firebase app is `mmg-concierge-dev`; application error reporting accepts only fixed categories and sanitized stack positions, never arbitrary messages, identities, command data or signed URLs. Native crash receipt/symbols require physical acceptance; do not infer them from a green JavaScript test suite. Public-production telemetry needs its own release/privacy review.
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
