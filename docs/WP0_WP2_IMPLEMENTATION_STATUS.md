# WP0 & WP2 Implementation Status

**Date:** 2026-08-20
**Plan reference:** `docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`

---

## WP0 — Correct the foundation 🔶 MOSTLY COMPLETE

### 1. Split terms schemas
- **`packages/contracts/src/index.ts`**: Terms version fields in `completeOwnerProfileDataSchema` and `ownerTermsAcceptanceSchema` changed from `z.literal(CURRENT_*_VERSION)` to bounded `termsVersionSchema` (`z.string().trim().min(1).max(64)`). Stale versions now pass Zod validation; domain/service layer emits `FAILED_PRECONDITION` + `terms_stale`.
- **`packages/domain/src/index.ts`**: Added `isCurrentTerms(terms, current): boolean` helper.
- **`apps/functions/src/owner/complete-owner-profile-service.ts`**: Uses `isCurrentTerms()` instead of inline comparison.
- **Test**: `packages/contracts/src/index.test.ts` — stale terms pass Zod boundary. `packages/domain/src/index.test.ts` — domain helper tests. `apps/functions/src/owner/complete-owner-profile-service.test.ts` — expects `FAILED_PRECONDITION` (not `INVALID_ARGUMENT`).

### 2. Replace hardcoded 8% pricing with canonical path
- **`packages/domain/src/index.ts`**: `calculateBookingQuote` now delegates to `calculateAuthoritativePrice` using `DEFAULT_SERVICE_FEE_BPS` (800), `DEFAULT_SERVICE_FEE_FIXED_KOBO` (0), `DEFAULT_OWNER_COMMISSION_BPS` (1500).
- **Test**: Parity property tests across 5 rates × 5 durations proving quote ↔ authoritative identity.
- **Open correction**: the client preview still injects default fees and `client-preview` versions while the server reads versioned trusted configuration. Delegating to the same pure function does not guarantee parity when live configuration changes. The primary renter journey must consume a server quote or the same versioned inputs.

### 3. Consolidate PII masking
- **`@mmg/domain`** is now the canonical source: `maskEmail()`, `maskPhoneE164()`.
- **`@mmg/contracts`**: `maskEmail()` and `maskPhone()` marked `@deprecated`.
- **`apps/admin/src/features/owners/data/firestore-admin-owner-gateway.ts`**: Migrated to `@mmg/domain` imports with safe adapter for edge cases.

### 4. Parse admin review action input through shared Zod schema
- **`apps/admin/src/features/owners/data/review-owner-verification-action.ts`**: `reviewOwnerVerificationDataSchema.parse()` called before fixture/live branching.

### 5. CSRF posture on session endpoints
- **`apps/admin/src/app/api/auth/session/route.ts`**: Added `assertSameOrigin()` check (Origin ↔ Host match).
- **`apps/admin/src/app/api/auth/logout/route.ts`**: Same origin validation.

### 6. Cursor pagination contracts
- **`packages/contracts/src/index.ts`**: Added `cursorSchema`, `pageSizeSchema`, `paginatedRequestSchema`, `paginatedResponseSchema<T>()`, `MAX_CLEANUP_BATCH_SIZE`, `cleanupBatchSizeSchema`.

### 7. ADRs
- `docs/adr/0001-date-intervals.md` — Date-only [startDate, endDate), epoch-day arithmetic
- `docs/adr/0002-pricing.md` — Canonical integer-kobo pricing, basis-point rounding
- `docs/adr/0003-staff-roles.md` — Six staff roles, custom claims, operator CLI only
- `docs/adr/0004-upload-formats.md` — MIME/magic-byte validation, HEIC excluded, EXIF stripping
- `docs/adr/0005-payment-boundary.md` — PaymentGateway interface, fake adapter, fail-closed production
- `docs/adr/0006-notifications.md` — Outbox pattern, idempotent FCM delivery

---

## WP2 — Vehicle inventory and Lagos moderation 🔶 IN PROGRESS

### Batch A — Contracts & domain ✅
**`packages/contracts/src/index.ts`** — Added:
- Constants: `VEHICLE_MODERATION_STATES`, `VEHICLE_VISIBILITY_STATES`, `VEHICLE_REVIEW_DECISIONS`, `VEHICLE_REVIEW_CHECKLIST_KEYS`, `VEHICLE_CATEGORIES`, `VEHICLE_TRANSMISSIONS`, `VEHICLE_FUEL_TYPES`, `VEHICLE_FEATURE_KEYS`, `VEHICLE_IMAGE_VARIANTS`, `VEHICLE_UPLOAD_PURPOSES`, `VEHICLE_DOCUMENT_KINDS`, `BOOKING_BLOCK_STATES`
- Numeric bounds: `MIN_OWNER_DAILY_RATE_KOBO` (₦50,000), `MAX_OWNER_DAILY_RATE_KOBO` (₦10M), `MIN_VEHICLE_YEAR` (2010), `MAX_VEHICLE_IMAGES` (20), `MAX_UPLOAD_BYTES` (10 MiB), `MIN_IMAGE_WIDTH` (1280), `MAX_IMAGE_EDGE` (8000)
- Geo: `LAGOS_BBOX`, `lagosLatitudeSchema`, `lagosLongitudeSchema`, `exactLagosPointSchema`
- Vehicle schemas: `nigerianPlateSchema`, `vehicleSpecsSchema`, `vehicleReviewChecklistSchema`
- **7 command + result schemas**: `createVehicleDraft`, `createVehicleUploadSession`, `finalizeVehicleImage`, `submitVehicleForReview`, `reviewVehicle`, `setVehicleVisibility` (and data types)
- **Visible schemas**: `ownerVisibleVehicleSchema`, `renterVisibleVehicleSchema` (no exact coords, no plate, no private paths)
- Extended `commandSafeReasonSchema` with: `not_approved_owner`, `not_vehicle_owner`, `listing_incomplete`, `image_limit`, `dates_overlap`, `not_paid`

**`packages/domain/src/index.ts`** — Added:
- `vehicleModerationTransitions` / `vehicleVisibilityTransitions`
- `canTransitionVehicleModeration()`, `canTransitionVehicleVisibility()`, `vehicleReviewTargetStatus()`
- `computeDiscoverable()` — approved + active = true, everything else false
- `ownerMayCreateVehicle()` — requires `verificationStatus === 'approved'`
- `ownerMayManageVehicle()` — ownerId match
- `classifyRevision()` — minor/major + safetyCritical
- `roundToApproxLatLng()` — ~1.1 km rounding (2 decimal places)
- `maskNigerianPlate()` — shows last 2 chars only

**Tests**: 196 → 210 (+14 tests: vehicle state transitions, discoverability, revision classification, coord rounding, plate masking, extended error reasons)

### Batch B — Firestore/Storage rules + indexes ✅
**`firebase/firestore.rules`**:
- `vehicles/{vehicleId}`: Owner `get` + `list` by `ownerId`; renter `list` by `discoverable == true`; all writes denied
- `vehiclePrivate/{vehicleId}`: Owner `get`/`list` only; renter never; writes denied
- `vehicles/{vehicleId}/images/{imageId}`: Authenticated read only
- `vehicleRevisions/{revisionId}`: Owner-scoped read
- `bookingCases/{caseId}`: Participant-scoped read
- `bookings/{bookingId}`: Extended to owner-scoped read

**`firebase/storage.rules`**:
- `public/vehicles/{vehicleId}/approved/{imageId}/{variant}`: Public read
- `private/vehicle-uploads/{ownerId}/{vehicleId}/{uploadId}`: Owner create (images only, 10 MiB)
- `private/vehicle-documents/{ownerId}/{vehicleId}/{uploadId}`: Owner create (images + PDF, 10 MiB)

**`firebase/firestore.indexes.json`**: Added 4 composite indexes (vehicles discoverable+rate, vehicles ownerId+createdAt, vehicleRevisions vehicleId+createdAt, bookings ownerId+createdAt)

### Batch C — Cloud Functions ✅ COMPLETE
- **`apps/functions/src/vehicle/vehicle-repository.ts`**: Complete VehicleTransaction/VehicleRepository interfaces, VehicleRecord, VehiclePrivateRecord, VehicleImageRecord, VehicleRevisionRecord, VehicleAdminAuditLog, VehicleNotificationOutbox types.
- **`apps/functions/src/vehicle/callable-auth.ts`**: Auth assertions `requireVehicleAdmin` (enforcing `vehicle_admin` or `super_admin`) and `requireVerifiedEmailOwnerAuth`.
- **`apps/functions/src/vehicle/create-vehicle-draft-service.ts`**: Validates owner approval (`ownerMayCreateVehicle`), creates draft vehicle + private records, rounds Lagos coordinates, forces chauffeur/delivery to included, audit events + idempotency.
- **`apps/functions/src/vehicle/create-vehicle-upload-session-service.ts`**: Generates private storage paths (`private/vehicle-uploads/` / `private/vehicle-documents/`), enforces max 20 image & max 5 document limits, audit events + idempotency.
- **`apps/functions/src/vehicle/finalize-vehicle-image-service.ts`**: Magic-byte validation (JPEG/PNG/WEBP), 10 MiB limit, image record creation with measured orientation-corrected dimensions and variant paths, primary image detection, audit events + idempotency.
- **`apps/functions/src/vehicle/submit-vehicle-for-review-service.ts`**: Rigorous completeness gate (specs, 40-2000 char description, daily rate within ₦50k-₦10M, Nigerian plate format, Lagos address & BBOX point, 1-20 processed images), transitions `draft`/`rejected` -> `pending_review`, outbox record + idempotency.
- **`apps/functions/src/vehicle/review-vehicle-service.ts`**: Enforces `vehicle_admin` | `super_admin`, 7-point checklist verification on approval, mandatory reason on rejection/suspension, immutable `adminAuditLogs` with state hashes, image promotion, discoverability calculation.
- **`apps/functions/src/vehicle/set-vehicle-visibility-service.ts`**: Allows approved owners to toggle `active` ↔ `paused`, tombstoning on `deleted`, automatic `discoverable` recalculation.
- **`apps/functions/src/vehicle/firestore-vehicle-repository.ts`**: Complete transactional Cloud Firestore repository.
- **`apps/functions/src/index.ts`**: Exported all 6 callables (`createVehicleDraft`, `createVehicleUploadSession`, `finalizeVehicleImage`, `submitVehicleForReview`, `reviewVehicle`, `setVehicleVisibility`).

### Batch D (D1 & D2) — Image Processing Pipeline & Storage Promotion ✅ COMPLETE
- **`image-processing.ts` + `sharp-image-processor.ts`**: Sharp pipeline with `limitInputPixels(8000²)`, `concurrency(1)`, orientation-corrected measured dimensions, EXIF/GPS stripping (verified with marker walker), thumb/card/detail variants at quality 82.
- **`image-promotion.ts`**: Promotes approved images into `public/vehicles/{vehicleId}/approved/...`, demotes on suspend/pause/delete, idempotent demotion, supersede-check placed above writes so paused listings abandon stamps cleanly.
- **`renter-vehicle-view.ts`**: Whitelist-only renter projection — structurally isolates `vehiclePrivate` (plate, exact coords, address); checks `moderationStatus`/`visibility`/`discoverable`; strictly validated.
- **`index.ts` Wiring**: Injected `AdminVehicleStorageGateway` into `finalizeVehicleImage`, `reviewVehicle`, and `setVehicleVisibility`.

### Admin Vehicle Moderation Desk Hardening (2026-08-17) ✅ COMPLETE
- **`FirestoreAdminVehicleGateway`**: Completely rewritten against genuine schemas. Reads flat specs on `vehicles/{id}`, fetches `vehiclePrivate/{id}` for plate masking via canonical `@mmg/domain` `maskNigerianPlate()`, and queries `vehicles/{id}/images` subcollection for real signed URLs. Eliminated all fabricated fallbacks (`year || 2024`, `seats || 7`, `make || 'Toyota'`) and completely severed `FIXTURE_VEHICLES` from the production path (fail-closed).
- **`review-vehicle-action.ts`**: Created Server Action `executeReviewVehicleAction` consuming the canonical `reviewVehicle` service with `AdminVehicleStorageGateway`. Enforces 7-point checklist on approval, executes image promotion (Batch D2), and writes SHA-256 hashed `adminAuditLogs`.
- **`session.ts` & Staff Roles**: Added `vehicle_admin` and comprehensive staff role resolution to `StaffRole` and session claims checks.
- **`VehicleModerationInspector`**: Updated to enforce explicit verification of all 7 canonical checklist points from `@mmg/contracts`, with full support for Approve, Reject, Suspend, and Restore actions.
- **Test Suite**: Added comprehensive unit test coverage in `firestore-admin-vehicle-gateway.test.ts`. Admin vitest suite: **8 files | 52 passed**. Total monorepo suite: **401 passed**.

---

## Last recorded validation matrix

The following was freshly reproduced at the 2026-08-20 availability checkpoint.

```bash
npm run check  # ✅ 493 tests passed (61 files), 0 type errors, 0 lint warnings
  ├── npm test              # 493 passed, 40 skipped (emulator-only)
  ├── npm run typecheck     # 0 errors (mobile)
  ├── npm run lint          # 0 warnings (mobile - expo lint)
  ├── functions:typecheck   # 0 errors
  ├── functions:build       # bundle builds (esbuild node22)
  ├── admin:typecheck       # 0 errors
  ├── admin:lint            # 0 warnings (eslint max-warnings=0)
  └── admin:test            # 61 passed
```

### Sequence 2 & Discovery Hardening (Latest Snapshot)

1. **Owner Wizard Flow**: Sequential photo upload + finalization pipeline, authoritative version re-read before submit, physical address validation with optional exact coords, and truthful Fleet desk status tracking.
2. **Strict Discovery Gateway**: Native & Web Firestore gateways enforce strict row validation (drops missing coords, unknown categories, non-included policies, or missing public images; `limit(30)` on all discovery queries; zero synthetic fallback).
3. **Live Booking Review**: `BookingReviewScreen` and `VehicleDetailScreen` asynchronously resolve live vehicles from `DiscoveryGateway` with truthful loading and missing states.

**Rules suites (2026-08-16, Java 25)**: `npm run test:rules` ✅ 18 passed — first emulator run against the Batch B vehicle rules; `npm run test:storage-rules` ✅ 17 passed — first run against the vehicle upload prefixes. Both cover cross-owner, renter, anonymous, and staff-client denial paths.

---

## Remaining WP2 work

| Batch | Deliverable | Status | Files |
|---|---|---|---|
| D (remainder) | Abandoned-upload cleanup for vehicle prefixes (`private/vehicle-uploads`, `private/vehicle-documents`); originals are currently retained forever | ⏳ Pending | `apps/functions/src/owner/expire-abandoned-uploads.ts` or sibling job |
| E | Owner mobile fleet UI (list, 6-step create/submit wizard with photo upload + finalize pipeline, live visibility toggling) | ✅ Delivered & Hardened | `apps/mobile/src/features/owner/` |
| F | Admin vehicle moderation desk + 7-point checklist server action | ✅ Delivered & Hardened | `apps/admin/src/features/vehicles/` |

## Remaining work packages

| WP | Status | Notes |
|---|---|---|
| WP1 | 🔶 Foundation complete | Profile/address/terms and deletion-request workflow exist; verified linked phone, completed deletion/erasure operations and MFA remain |
| WP2 | 🔶 Sequence 2 Pass Complete | Batches A, B, C, D (core), E, F delivered and hardened; abandoned upload cleanup remaining |
| WP3 | ✅ Complete | Strict live Lagos discovery and renter detail/review flows are connected. A privacy-safe selected-date calendar check now gates quote review without exposing private owner blocks or booking references |
| WP4 | 🔶 Calendar + intent/hold foundation complete | Atomic booking intents/holds, owner versioned availability commands/read model, and renter availability gating are delivered. Trusted paid-booking creation, owner confirmation/rejection/intervention, and the Paystack boundary remain incomplete |
| WP5 | ⏳ Not started | FCM outbox, payment-gated chat, lifecycle/completion |
| WP6 | ⏳ Not started | Append-only ledger and manual finance workflow |
| WP7 | 🔶 Partial | Owners, bookings, and initial vehicle desk exist; remaining operations modules pending |
| WP8 | ⏳ Not started | CI, observability, privacy/data-safety inventory, runbooks, staging sign-off |
