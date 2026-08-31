# Firestore schema evolution plan

**Status:** Recommended implementation plan  
**Target:** `mmg-concierge-dev` Standard edition, Native mode, `(default)` database in `africa-south1`  
**Decision:** Preserve the current canonical schema and harden it incrementally. Do not import the legacy database or introduce a parallel `listings` model.

## 1. Why this is the lowest-risk direction

The legacy database validates several domain boundaries already present in the current architecture: shared users and role profiles, public/private vehicle separation, one availability serialization document per vehicle, bookings, media provenance, and future wallet/accounting concepts. Those ideas are useful evidence, but the legacy collection names and documents are not migration contracts.

The current repository already has contracts, state machines, transactional services, Rules tests, Admin gateways, and Mobile consumers built around the present collection families. Replacing them would create two sources of truth and require an unnecessary data migration before the product is complete. The safe approach is therefore:

1. Keep existing document IDs and canonical collection names.
2. Remove unsafe direct renter reads instead of duplicating trusted vehicle data into another collection.
3. Serve renter discovery and detail through authenticated, App-Check-protected Functions that serialize strict public DTOs.
4. Add future financial and operational collections only when their work-package exit gates are implemented.
5. Treat all legacy data as untrusted reference material; never copy users, roles, bookings, wallet values, private locations, or admin requests.

## 2. Canonical access topology

```text
Mobile renter
  -> Firebase Auth + App Check
  -> resolveSearchPlace / searchVehicles / getVehicleDetails
  -> Admin SDK reads trusted vehicle records
  -> strict renter-visible DTO

Mobile owner
  -> Firebase Auth + App Check
  -> owner/vehicle commands for every mutation
  -> narrowly scoped owner reads where already required

Admin portal
  -> fresh Firebase session cookie + staff claim
  -> server component/action
  -> canonical service + Admin SDK

Firestore client Rules
  -> deny by default
  -> no renter access to trusted vehicle or image records
  -> no client writes to trusted state
```

Firestore Rules cannot hide selected fields inside a readable document. If a trusted vehicle record contains moderation reasons, internal paths, or other non-renter fields, client-side DTO parsing does not make that read safe. The server boundary must remove those fields before serialization.

## 3. Canonical collection families

| Family | Canonical paths | Direction |
|---|---|---|
| Identity | `users/{uid}`, `renterProfiles/{uid}`, `ownerProfiles/{uid}` | Keep. Use UID as identity; role/profile state remains server-controlled. |
| Verification/private owner data | `ownerVerifications/{uid}`, `ownerPayoutProfiles/{uid}` | Keep private and server-owned. Never merge into a broadly readable profile. |
| Vehicle inventory | `vehicles/{vehicleId}`, `vehiclePrivate/{vehicleId}`, `vehicleRevisions/{revisionId}`, `vehicles/{vehicleId}/images/{imageId}` | Keep as the trusted inventory aggregate. Owners/admins receive scoped views; renters receive Function DTOs only. |
| Media provenance | `vehicleMediaSources/{vehicleId}` | Optional server/tooling-only metadata for seeded or licensed media. It is not listing state and is never a renter query source. |
| Availability | `vehicleAvailability/{vehicleId}`, `bookingBlocks/{blockId}` | Keep. `vehicleAvailability` is the transaction serialization/version sentinel; intervals remain in `bookingBlocks`. |
| Booking | `bookingIntents/{intentId}`, `bookings/{bookingId}`, `bookingCases/{caseId}` | Keep. Server writes only; parties receive scoped reads or DTOs. |
| Payments/refunds | `payments/{paymentId}`, `paymentEvents/{eventKey}`, `refunds/{refundId}` | Reserved by architecture; create only with the trusted Paystack work package. |
| Communication | `conversations/{bookingId}`, message subcollection, `deviceTokens`, `notificationOutbox` | Reserved for WP5; do not create placeholder success paths. |
| Finance | `wallets/{ownerId}`, immutable `entries` subcollection, `withdrawalRequests/{requestId}` | Reserved for WP6. No generic mutable `transactions` collection. |
| Operations | `adminAuditLogs`, `auditEvents`, `idempotencyKeys`, `systemConfig`, `dataRightsRequests` | Keep server-owned. Privileged commands execute through trusted services, never by writing an admin request document. |

## 4. Legacy-to-current mapping

| Legacy collection | Lesson retained | Current decision |
|---|---|---|
| `users` | Stable Firebase UID identity | Keep `users/{uid}` with narrow self access and no self-assigned privileged roles. |
| `ownerProfiles` | Separate owner domain profile | Keep, with verification/private data split into dedicated collections. |
| `vehicles` + `vehiclePrivate` | Public/private vehicle separation | Keep the trusted split, but remove renter network access to both trusted documents. |
| `listings` | A renter-facing listing concept is required | Do not keep a second collection. A listing is the approved/active projection returned from the vehicle aggregate by discovery Functions. |
| `vehicleAvailabilitySentinels` | One shared concurrency document prevents double booking | Retain as the existing `vehicleAvailability/{vehicleId}` version sentinel. Do not add a second calendar collection. |
| `vehicleMediaSources` | Track external/seeded image provenance | Keep only as server/tooling metadata where licensing or attribution requires it. |
| `bookings` | Durable rental aggregate | Keep current versioned booking state machine and server-only transitions. |
| `wallets` | Owner balances need a dedicated aggregate | Defer to WP6; derive balances from immutable ledger entries. |
| `transactions` | Financial events must be traceable | Replace the generic concept with `payments`, `paymentEvents`, refunds, and immutable wallet entries. |
| `admin-requests` | Admin operations need an auditable command trail | Do not migrate. Anonymous/client-written privileged requests are forbidden; use authenticated server actions plus `adminAuditLogs`. |

## 5. Bounded implementation sequence

### S1 — Close the renter vehicle-record boundary

1. Add the architecture-defined `getVehicleDetails` callable.
2. Require App Check and authenticated-renter access for all three discovery operations.
3. Change the native discovery gateway to call Functions for featured/search/detail data instead of querying `vehicles` directly.
4. Reuse `toRenterVisibleVehicle(s)` as the single whitelist serializer.
5. Remove renter/direct-discoverable access from `vehicles` and vehicle image Rules. Preserve only the explicitly required owner scope; all writes remain denied.
6. Add captured-network/serializer tests proving the absence of exact coordinates, full geohash, plate, private paths, internal image paths, moderation reasons, and admin notes.
7. Run Firestore Rules tests with anonymous, renter, cross-owner, owner, and staff-client negative cases.

This is the immediate schema/security gate. Do not deploy the current repository Rules before S1 passes.

### S2 — Make document contracts explicit

For every trusted aggregate touched by subsequent work:

- Define the Zod contract and required/optional fields in `packages/contracts`.
- Use Firestore `Timestamp` for event/audit instants and `YYYY-MM-DD` only for business rental dates.
- Require `version`, `createdAt`, `updatedAt`, and actor metadata on mutable aggregates where defined by architecture.
- Keep status values inside the canonical domain transition maps.
- Add only indexes required by a checked-in query; exempt large text/maps and unqueried sequential/TTL fields where appropriate.
- Reject unknown fields at client DTO boundaries and never use DTO parsing as a substitute for Rules isolation.

### S3 — Provision Storage and verify media lifecycle

1. Provision only the development default bucket in the approved matching data location.
2. Keep original/private objects owner-scoped and approved variants under the public promotion path.
3. Preserve optional `vehicleMediaSources` for seeded-image attribution without joining it into renter responses.
4. Run Storage Rules, magic-byte, EXIF/GPS removal, promotion/demotion, and abandoned-upload cleanup tests.
5. Exercise the private Scheduler cleanup and inspect structured logs before marking it operational.

### S4 — Add future domains only at their exit gates

Do not create placeholder documents for Paystack, chat, notifications, ledger, wallets, or withdrawals. Add each collection with its contract, transactional service, Rules/indexes, audit behavior, failure states, and tests in WP4–WP6. A collection existing in the legacy database is not evidence that the feature is live.

## 6. Explicit non-decisions

- No bulk legacy import.
- No second Firebase database or staging project.
- No `listings` alias or dual write with `vehicles`.
- No `vehiclePublic` projection collection at MVP scale. Reconsider only through an ADR if measured Function latency, cost, offline requirements, or query limits justify duplicated read models.
- No client-writable admin command queue.
- No generic `transactions` collection.
- No Firestore Rules deployment while the current vehicle projection leak remains.

## 7. Exit criteria

The schema checkpoint is complete only when:

1. Native renter discovery/detail makes no direct trusted vehicle/image reads.
2. Anonymous discovery, renter trusted-record access, cross-owner access, and staff JavaScript client access fail in Rules tests.
3. Authenticated App Check discovery succeeds through Functions.
4. Public DTO/network fixtures contain only approved fields.
5. Owner inventory and Admin moderation still work without duplicated listing state.
6. Availability concurrency tests still demonstrate one winner for overlapping attempts.
7. Rules, indexes, contracts, Functions, Mobile, Admin, architecture documents, and `AGENTS.md` describe the same paths and access model.
