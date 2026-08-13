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

## Phase 2 — Renter journey — next

- Lagos search, filters, map/list presentation, and permission-denied states.
- Vehicle detail, dates, quote presentation, and checkout handoff states.
- Trips, payment-return messaging, intervention states, and renter profile UI.
- Contract, interaction, loading, empty, error, and offline coverage.

## Phase 3 — Owner operations and admin shell — planned

- Owner onboarding, verification, vehicle creation, and moderation status.
- Owner bookings, confirmation/rejection, lifecycle, and earnings surfaces.
- Next.js admin navigation and review queues needed to operate these journeys.
- Replace preview adapters with authenticated Firebase implementations when
  backend prerequisites are ready.
