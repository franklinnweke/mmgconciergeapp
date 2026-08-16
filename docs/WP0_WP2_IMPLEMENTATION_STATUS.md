# WP0 & WP2 Implementation Status

**Date:** 2026-08-16
**Plan reference:** `docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`

---

## WP0 — Correct the foundation ✅ COMPLETE

### 1. Split terms schemas
- **`packages/contracts/src/index.ts`**: Terms version fields in `completeOwnerProfileDataSchema` and `ownerTermsAcceptanceSchema` changed from `z.literal(CURRENT_*_VERSION)` to bounded `termsVersionSchema` (`z.string().trim().min(1).max(64)`). Stale versions now pass Zod validation; domain/service layer emits `FAILED_PRECONDITION` + `terms_stale`.
- **`packages/domain/src/index.ts`**: Added `isCurrentTerms(terms, current): boolean` helper.
- **`apps/functions/src/owner/complete-owner-profile-service.ts`**: Uses `isCurrentTerms()` instead of inline comparison.
- **Test**: `packages/contracts/src/index.test.ts` — stale terms pass Zod boundary. `packages/domain/src/index.test.ts` — domain helper tests. `apps/functions/src/owner/complete-owner-profile-service.test.ts` — expects `FAILED_PRECONDITION` (not `INVALID_ARGUMENT`).

### 2. Replace hardcoded 8% pricing with canonical path
- **`packages/domain/src/index.ts`**: `calculateBookingQuote` now delegates to `calculateAuthoritativePrice` using `DEFAULT_SERVICE_FEE_BPS` (800), `DEFAULT_SERVICE_FEE_FIXED_KOBO` (0), `DEFAULT_OWNER_COMMISSION_BPS` (1500).
- **Test**: Parity property tests across 5 rates × 5 durations proving quote ↔ authoritative identity.

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

### Batch C — Cloud Functions (partial) 🔶
**`apps/functions/src/vehicle/vehicle-repository.ts`**: Complete VehicleTransaction/VehicleRepository interfaces, VehicleRecord, VehiclePrivateRecord, VehicleImageRecord, VehicleRevisionRecord types.

**`apps/functions/src/vehicle/create-vehicle-draft-service.ts`**: Full implementation with:
- Zod parsing of `createVehicleDraftCommandSchema`
- Owner approval gate (`ownerMayCreateVehicle`)
- Vehicle + vehiclePrivate records creation
- Display name derivation, coord rounding
- Chauffeur/delivery forced to `included`
- Audit event + idempotency
- 5 unit tests (create, reject unapproved, reject unknown, reject invalid, replay)

---

## Validation matrix at current checkpoint

```bash
npm run check  # ✅ 210 tests passed, 0 type errors, 0 lint warnings
  ├── npm test              # 210 passed, 29 skipped (emulator-only)
  ├── npm run typecheck     # 0 errors (mobile)
  ├── npm run lint          # 0 warnings (mobile)
  ├── functions:typecheck   # 0 errors
  ├── functions:build       # 965.6kb bundle
  ├── admin:typecheck       # 0 errors
  ├── admin:lint            # 0 warnings
  └── admin:test            # 15 passed
```

**Not run (requires Java 21+)**: `npm run test:rules`, `npm run test:storage-rules`

---

## Remaining WP2 work

| Batch | Deliverable | Files |
|---|---|---|
| C (cont.) | `createVehicleUploadSession` service | `apps/functions/src/vehicle/` |
| C (cont.) | `finalizeVehicleImage` service | `apps/functions/src/vehicle/` |
| C (cont.) | `submitVehicleForReview` service | `apps/functions/src/vehicle/` |
| C (cont.) | `reviewVehicle` service | `apps/functions/src/vehicle/` |
| C (cont.) | `setVehicleVisibility` service | `apps/functions/src/vehicle/` |
| C (cont.) | Firestore vehicle repository | `apps/functions/src/vehicle/` |
| C (cont.) | Register callables in `index.ts` | `apps/functions/src/index.ts` |
| D | Image processing (EXIF strip, variants) | `apps/functions/src/vehicle/` |
| E | Owner mobile fleet UI (list, create, edit, resubmit) | `apps/mobile/src/features/owner/` |
| F | Admin vehicle queue + inspector | `apps/admin/src/features/vehicles/` |

## Remaining work packages

| WP | Status |
|---|---|
| WP1 | Not started — identity/renter profile/privacy/MFA |
| WP2 | 🔶 In progress (3 of 11 batches done) |
| WP3 | Not started — live Lagos discovery |
| WP4 | Not started — availability + booking ops |
| WP5 | Not started — notifications + chat + lifecycle |
| WP6 | Not started — ledger + wallets + withdrawals |
| WP7 | Not started — admin completeness |
| WP8 | Not started — hardening + release engineering |
