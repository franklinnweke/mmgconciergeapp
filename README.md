# MMG Concierge

Firebase-backed React Native marketplace for chauffeured luxury rentals in Lagos.

## Current implementation

The repository contains the completed Phase 1 experience foundation, Phase 2 trusted booking operations, and Phase 3 Owner Sequence 1 (Verification & Staff Administration) vertical slice:

### Mobile Application (`apps/mobile`)
- **Renter Experience**: Premium, image-led renter discovery home with mobile navigation, branded typography, tactile press states, trips desk with status grouping, and verified price snapshots.
- **Authentication**: React Native Firebase Authentication (email/password, Google Sign-In, password reset, email verification) and phone number linking (`linkWithCredential`) for owner verification.
- **Owner Application Desk & Multi-Step Verification Flow**:
  - `OwnerIdentityScreen`: Profile registration with Lagos address and locked legal terms versions.
  - `OwnerPhoneScreen`: Native Nigerian Phone Auth linking (`+234...`) via `PhoneAuthProvider` with deterministic web simulation disabled.
  - `OwnerIdScreen`: Government ID upload (National ID, Driver's Licence, International Passport, Voter's Card) directly to private Cloud Storage (`private/owner-verification/{uid}/{uploadId}`). Storage Rules apply the first MIME/size gate; the trusted submit callable performs authoritative magic-byte validation. There are zero public download URLs, and local draft session persistence.
  - `OwnerApplicationDeskScreen`: Live desk status from `ownerProfiles/{uid}` with strict schema validation, offline draft upload detection, completeness computation, and sync retry states.
  - `OwnerSubmitScreen`: Refresh-authenticated submission calling `submitOwnerVerification` with real upload metadata.

### Shared Contracts & Domain (`packages/contracts`, `packages/domain`)
- Strict Zod contracts: `completeOwnerProfileCommandSchema`, `submitOwnerVerificationCommandSchema`, `reviewOwnerVerificationCommandSchema`, `ownerVisibleProfileSchema`, `adminVisibleOwnerVerificationSchema`.
- Canonical error codes and safe reason mappings (`CommandError`, `CanonicalErrorCode`).
- Server-side PII masking utilities (`maskEmail`, `maskPhone`).

### Cloud Functions Backend (`apps/functions`)
- Node 22 Firebase Functions v2 (`africa-south1`) with App Check enforcement:
  - `completeOwnerProfile`: Validates owner account, locked terms versions, Lagos address, and writes owner profile.
  - `submitOwnerVerification`: Validates linked phone from Auth token, Storage upload magic bytes/ownership, enforces state transitions (`draft` | `rejected` -> `submitted`), updates `ownerVerifications` and `ownerProfiles`, and logs audit events.
  - `reviewOwnerVerification`: Staff callable enforcing `verification_admin` or `super_admin` role, optimistic concurrency (`expectedVersion`), mandatory 5-point checklist on approval, mandatory reasons on rejection/suspension/revocation, and immutable `adminAuditLogs`.
  - `expireAbandonedOwnerVerificationUploads`: Scheduled daily job (Africa/Lagos, `512MiB`, `540s`) executing 24-hour unreferenced upload purge, 30-day draft split-write cleanup, and 90-day rejected split-write cleanup.
- **Staff Claims CLI** (`scripts/set-admin-claims.ts`): Requires `--confirm` flag, enforces staff role allowlist (`STAFF_ROLE_KEYS`), revokes refresh tokens on change, and logs immutable audit rows to `adminAuditLogs`.

### Staff Admin Portal (`apps/admin`)
- Next.js App Router admin desk (`/owners` queue and `/owners/[ownerId]` inspector).
- Session-cookie authentication (`__session`, 5-day expiry, 5-minute freshness check) requiring `emailVerified === true` and staff claims.
- Client browser Firebase Auth configured with `inMemoryPersistence`.
- **Fixture Isolation**: Mock fixture session is strictly restricted to development (`MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production'`). Mutation actions (`executeReviewDecisionAction`) simulate transitions and never write to live Firestore in fixture mode.
- **Server-Side PII Masking & Preview URL Isolation**: Server components mask email (`a***@domain.com`) and phone (`+234****1234`) before passing data to Client Components. Exposes ≤15-minute signed GET preview URLs (`documentPreviewUrl`) and never leaks raw `storagePath` to client components. Displays *"Document expired / re-upload required"* when bytes are cleared.

### Cloud Firestore & Storage Security Rules
- Standard/Native Firestore in `africa-south1`.
- `ownerProfiles/{ownerId}`: Owner self-projection `get` allowed only for authenticated owner; `list` and client writes denied.
- `ownerVerifications/{ownerId}`, `adminAuditLogs/{logId}`, `auditEvents/{id}`, `notificationOutbox/{id}`: Strict client deny-all (`allow read, write: if false`). All mutations handled via Admin SDK in Cloud Functions.
- Storage rules: Private verification uploads restricted to `private/owner-verification/{ownerId}/{uploadId}` with owner match, MIME check, and 10 MiB limit. Client reads denied.

---

## What is Not Live / Implementation Boundaries

Do not treat the following surfaces as live integrations:

- **Paystack Payments**: Paystack initialization, charge authorization, webhook processing, escrow holds, payout disbursements, and refunds are not implemented.
- **Multi-Factor Authentication (MFA)**: MFA enforcement is not implemented — this checkpoint is not a controlled public-release sign-off.
- **Vehicle Inventory & Operations**: Vehicle creation, catalog management, host availability calendar, rate overrides, and owner booking acceptance/rejection are scheduled for subsequent Phase 3 sequences.
- **Operator & Cloud Infrastructure**: Live Phone Auth SMS delivery and Cloud Storage bucket provisioning are operator/cloud runtime dependencies that require active infrastructure, not proven solely by unit tests in this repository.
- **Legacy Availability Request**: The deprecated availability-request path holds no dates, takes no payment, and creates no confirmation.

---

## Prerequisites

- Node.js 22+
- Xcode 16+ for local iOS builds
- Android Studio for local Android builds
- Java 21+ for Firebase emulators
- Firebase CLI login with access to `mmg-concierge`

`mmg-concierge` is the sole Firebase project for this application. The repository does not require separate development, staging, or production projects. Use the Firebase Emulator Suite for isolated and destructive tests, and treat changes to the shared cloud project as production-impacting.

React Native Firebase uses native code. **Expo Go is not supported.** Use an EAS or local development build.

## Install and check

```bash
npm install
npm run check
```

`npm run check` runs:
1. Vitest unit tests across all packages (contracts, domain, functions, admin).
2. TypeScript typecheck across `@mmg/mobile`, `@mmg/functions`, and `@mmg/admin`.
3. ESLint across `@mmg/mobile` and `@mmg/admin`.
4. Functions esbuild production bundle build.
5. Admin Next.js unit tests.

To run Firestore and Storage security rules tests with the Firebase Emulator:
```bash
npm run test:rules
npm run test:storage-rules
```

Native App Check is initialized in the Expo development build with the RNFirebase
debug provider (`__DEV__`) and uses Play Integrity (Android) / App Attest (iOS)
in release builds. Register the generated development debug token in Firebase
App Check for the matching app. Production callable access still requires the
configured App Check app registration; initialization does not bypass
`enforceAppCheck: true`.

## Run Applications

### Mobile App (Expo / React Native)
```bash
cd apps/mobile
npx expo run:ios
# or: npx expo run:android
# or: npx expo start --web
```

### Admin Portal (Next.js)
```bash
cd apps/admin
# Run with development fixtures:
MMG_ADMIN_FIXTURES=1 npm run dev
# or run against live Firebase backend:
npm run dev
```

### Functions Local Emulation
```bash
cd apps/functions
npm run build
npm run serve
```
