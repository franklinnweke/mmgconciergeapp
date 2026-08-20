# UI-first implementation phases

> **Historical checkpoint log.** This file records how the earlier sequences
> were delivered and validated. It is not the current milestone authority.
> Use `AGENTS.md` and
> `docs/reviews/2026-08-20_APPLICATION_DEEP_REVIEW.md` for the evidence-based
> current state and next delivery order.

Firebase provisioning and the first identity slice are now connected to the
mobile app. Native development builds use the registered Firebase iOS and
Android apps; browser previews keep deterministic preview auth so visual work
does not require native credentials.

## Current checkpoint — Firebase identity & Owner Verification Sequence 1

- Firebase project `mmg-concierge` is selected in `firebase/`.
- Email/password and Google Sign-In are enabled in Firebase Authentication.
- iOS app `com.mmgconcierge.app` and Android app `com.mmgconcierge.app` are
  registered, with checked-in client configuration files.
- Native auth flows cover registration, email verification, email sign-in,
  password reset, Google Sign-In, refresh, phone linking for owners, and sign-out.
- Firestore is provisioned in `africa-south1` with deny-by-default rules and
  emulator tests.
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
- Firestore and Storage Rules emulator suites passed with Java 25.
- Expo web export and iOS/Android Hermes `.hbc` bundles passed.
- Browser fixture review at 390 × 844 and 1280 × 800 is stored under
  `/private/tmp/mmg-seq3-browser/`.

The deprecated availability request remains an estimate only: it holds no
dates, takes no payment, and creates no confirmation.

## Phase 3 — Owner workflows and live integrations — in progress

### Sequence 1 — Owner Verification & Staff Desk — complete

Sequence 1 checkpoint (August 15, 2026):

- **Shared Contracts & Schemas (`@mmg/contracts`)**:
  - Versioned commands and strict Zod schemas for `completeOwnerProfile`, `submitOwnerVerification`, `reviewOwnerVerification`, `ownerVisibleProfileSchema`, and `adminVisibleOwnerVerificationSchema`.
  - Canonical `CommandError` and `BookingCommandError` classes with typed safe reason codes.
  - Server-side PII masking helpers: `maskEmail` (`a***@domain.com`) and `maskPhone` (`+234****1234`).
- **Cloud Firestore & Storage Security Rules**:
  - `ownerProfiles/{ownerId}`: Owner self-projection `get` allowed only for authenticated owner; `list` and client `write` denied.
  - `ownerVerifications`, `adminAuditLogs`, `auditEvents`, `notificationOutbox`: Strict deny-all client access (`allow read, write: if false`).
  - Storage `private/owner-verification/{ownerId}/{uploadId}`: Restricted to authenticated owner matching path, MIME/size first gate, and client reads denied. The submit callable performs authoritative magic-byte validation.
- **Cloud Functions v2 Backend (`apps/functions`)**:
  - `completeOwnerProfile`: Enforces owner account type, validates Lagos address, and locks `owner-terms-2026-08-01`, `owner-commission-2026-08-01`, and `privacy-notice-2026-08-01` before writing the profile projection.
  - `submitOwnerVerification`: Validates linked phone from Auth token, performs magic-byte sniffing on uploaded storage object, enforces valid state transitions (`draft` | `rejected` -> `submitted`), updates profile and verification documents.
  - `reviewOwnerVerification`: Privileged staff callable requiring `verification_admin` or `super_admin` role, optimistic concurrency check on `expectedVersion`, mandatory 5-point checklist on approval, mandatory reasons on rejection/suspension/revocation, writes immutable `adminAuditLogs`.
  - `expireAbandonedOwnerVerificationUploads`: Scheduled daily job (Africa/Lagos, `512MiB`, `540s`) executing:
    - 24-hour unreferenced upload purge: Deletes storage files older than 24h whose `uploadId` does not match the active `ownerVerifications.governmentId.uploadId`.
    - 30-day draft split-write cleanup: Deletes storage files, sets `ownerProfiles.governmentId.status = 'cleared'` (preserving 6 owner-visible keys), sets `ownerVerifications.governmentId.storagePath = null`, `bytesState = 'cleared'`, leaving verification `status = 'draft'`.
    - 90-day rejected split-write cleanup: Deletes storage files, updates profile/verification identically, retaining decision history and `status = 'rejected'`.
    - Emits structured log `owner.verification_upload_expired` with `ownerId` and `uploadId`.
- **Staff Claims CLI (`apps/functions/scripts/set-admin-claims.ts`)**:
  - Enforces mandatory `--confirm` flag (defaults to safe dry-run preview).
  - Enforces `STAFF_ROLE_KEYS` allowlist.
  - Calls `auth.revokeRefreshTokens(uid)` to terminate active sessions upon claim change.
  - Logs immutable audit row to `adminAuditLogs/{logId}`.
- **Staff Admin Portal (`apps/admin`)**:
  - Session-cookie authentication (`__session`, 5-day expiry, 5-minute freshness check) requiring `emailVerified === true` and staff claims.
  - Client JS Firebase Auth configured with `inMemoryPersistence`.
  - **Fixture Isolation**: Mock fixture session is strictly restricted to development (`MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production'`). `executeReviewDecisionAction` returns in-memory simulated transitions without writing to live Firestore in fixture mode.
  - **Server-Side PII Masking & Preview URL Isolation**: Server components mask email and phone before serialization for Client Components. Mint ≤15-minute signed GET URLs (`documentPreviewUrl`), never passing raw `storagePath` to client components. Displays *"Document expired / re-upload required"* when bytes are cleared.
- **Native Mobile Owner Flow (`apps/mobile`)**:
  - `OwnerIdentityScreen`: Profile registration with Lagos address and locked terms.
  - `OwnerPhoneScreen`: Native `PhoneAuthProvider` verification with `linkWithCredential` on `currentUser`, disabling web simulation.
  - `OwnerIdScreen`: Government ID upload directly to `private/owner-verification/{uid}/{uploadId}` with local draft persistence (`owner-draft-store.ts`).
  - `OwnerApplicationDeskScreen`: Reactive desk reading `ownerProfiles/{uid}` projection, calculating completeness with session/offline draft awareness, and sync error retry states.
  - `OwnerSubmitScreen`: Submits verification with real `uploadId` and clears local draft upon success.

Validation baseline for Sequence 1:

- `npm run check` passes cleanly (193 tests passed across 26 test files, 29 emulator-only tests skipped; TypeScript 0 errors, ESLint 0 warnings).
- `npm run functions:build` outputs a 964.8 kB bundle.
- `npm run admin:build` passes Next.js 16 Turbopack production build with 0 errors.
- Firestore Rules pass 15 emulator tests; Storage Rules pass 11 emulator tests.
- Expo web export and iOS/Android Hermes `.hbc` exports pass with native App Check included.

---

### Originally planned subsequent sequences in Phase 3 & Beyond

- **Sequence 2 — Vehicle Inventory & Lagos Inspection Workflow**: Vehicle listing creation, image upload pipeline, rate schedules, Lagos vehicle inspection and moderation state transitions.
- **Sequence 3 — Host Availability Calendar & Booking Operations**: Host calendar management, availability blocks, rate overrides, and owner booking acceptance/rejection actions.
- **Sequence 4 — Paystack Payments, Escrow & Authoritative Settlement**: Real Paystack transaction initialization, webhook verification, escrow holds, payout disbursements, and Nigerian tax/split accounting.
- **Multi-Factor Authentication (MFA) & Staging Sign-Off**: MFA enforcement for privileged staff accounts, production environment isolation, and final pre-launch security audits.

### Current Sequence 3 checkpoint — availability foundation delivered

As of August 20, 2026, the owner/renter calendar portion of Sequence 3 is
implemented on `main`:

- Owners can read a private calendar, create and remove versioned availability
  blocks, and see renter-held dates only as coarse `reserved` periods.
- Renters receive date-level availability only. Owner reasons, notes, block IDs,
  booking IDs, and storage details never cross the renter DTO boundary.
- Booking intents and short date holds share the same per-vehicle transaction
  sentinel as owner blocks, preventing concurrent availability writes from
  bypassing each other.
- Vehicle detail checks the selected range before enabling quote review and
  uses truthful unavailable/payment-not-started copy.
- The prior owner/renter dynamic route collision was removed by placing owner
  vehicle operations under `/fleet/[id]`.

This does **not** complete Sequence 3 or WP4. Trusted paid-booking creation,
owner confirm/reject/intervention actions, response-SLA alerts, and the payment
boundary are still pending. Paystack remains deliberately unavailable.
