# UI-first implementation phases

Firebase provisioning and the first identity slice are now connected to the
mobile app. Native development builds use the registered Firebase iOS and
Android apps; browser previews keep deterministic preview auth so visual work
does not require native credentials.

## Current checkpoint — Firebase identity foundation

- Firebase project `mmg-concierge` is selected in `firebase/`.
- Email/password and Google Sign-In are enabled in Firebase Authentication.
- iOS app `com.mmgconcierge.app` and Android app `com.mmgconcierge.app` are
  registered, with checked-in client configuration files.
- Native auth flows cover registration, email verification, email sign-in,
  password reset, Google Sign-In, refresh, and sign-out.
- Firestore is provisioned in `africa-south1` with deny-by-default rules and
  emulator tests. No client data writes are enabled until versioned schemas
  and callable contracts are ready.
- Expo Go is not the target runtime for Firebase auth; use an EAS or local
  native development build.

## Phase 1 — Experience foundation — complete

- Scaffold the npm workspace and Expo Router mobile app.
- Establish MMG brand tokens, typography, navigation, imagery, and motion.
- Define shared mobile-facing contracts and pure formatting helpers.
- Isolate authentication and data access behind replaceable interfaces.
- Deliver a polished renter discovery home using deterministic preview data.

Completion baseline (August 12, 2026):

- TypeScript, lint, and unit-test checks pass.
- Static web export and native Hermes bundles for iOS and Android compile.
- The renter home is visually checked at a 390 × 844 mobile viewport.
- Native Firebase authentication remains isolated from deterministic web previews.

## Phase 2 — Renter journey and trusted booking foundation — complete for Sequences 1–3

Trusted foundation and Sequence 3 checkpoint (August 13, 2026):

- Versioned booking command, error, state, date-only, price, and renter-visible
  `bookingIntents` / `bookings` contracts.
- Pure charged-day, safe integer-kobo pricing, overlap, and transition rules.
- Firebase Functions v2 `createBookingIntent` foundation with App Check,
  server-owned pricing/configuration, idempotency, held blocks, audit events,
  and an availability transaction sentinel.
- Owner-scoped trusted-record reads and default-deny client writes verified by
  negative Firestore Emulator tests. Client writes to `bookingIntents` and
  `bookings` remain denied. Renter list reads use `where('renterId', '==', uid)`
  and the existing automatic single-field indexes.
- A fail-closed Next.js admin queue/inspector with fixture-only visual mode.
- Renter Trips grouping (`ACTIVE REQUESTS`, `UPCOMING`, `NEEDS ATTENTION`,
  `PAST`) and a trip-detail route with one primary action, confirmation for
  cancellation, and unavailable-adapter copy that never claims a charge,
  message, or journey change.
- Native read-only subscriptions to trusted records plus a labelled legacy
  estimate fallback. Web development uses deterministic preview journeys only.
- Paystack remains deliberately unavailable; no client path can confirm a
  booking or claim payment success.

Validation rerun for this checkpoint:

- `npm test`, `npm run typecheck`, and `npm run lint` passed.
- Functions and admin typecheck, test, and build commands passed.
- `npm run test:rules` and `npm run test:functions:emulator` passed on Java 25.
- Expo web export and iOS/Android Hermes `.hbc` bundles passed.
- Browser fixture review at 390 × 844 and 1280 × 800 is stored under
  `/private/tmp/mmg-seq3-browser/`.

The deprecated availability request remains an estimate only: it holds no
dates, takes no payment, and creates no confirmation.

## Phase 3 — Owner workflows and live integrations — next

- Owner onboarding, verification, vehicle creation, and moderation status.
- Owner bookings, confirmation/rejection, lifecycle, and earnings surfaces.
- Admin session-cookie authentication and privileged confirm/reject commands.
- Real Paystack initialization, webhook verification, charging, and refunds.
- Replace remaining preview adapters when App Check and the trusted create-intent
  callable are operational in a native development build.
