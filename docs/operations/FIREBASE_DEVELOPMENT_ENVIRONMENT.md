# Firebase development environment

**Project:** `mmg-concierge-dev`  
**Production project:** `mmg-concierge`  
**Provisioning date:** 2026-08-30  
**Status:** App registrations complete; backend provisioning blocked on billing authorization

## Registered development apps

| Surface | Firebase app ID | Package / bundle |
|---|---|---|
| Android | `1:133019251795:android:f192492125abddccdc82a6` | `com.mmgconcierge.app` |
| iOS | `1:133019251795:ios:fc62fff7dbeca725dc82a6` | `com.mmgconcierge.app` |
| Admin web | `1:133019251795:web:6ef7e65a90a5b8b1dc82a6` | n/a |

Mobile development and preview EAS profiles select the checked-in development SDK files through `MMG_FIREBASE_ENV=development`. Production explicitly selects the existing production files. An unset value defaults to development so local native builds fail toward the non-production project.

## Verified production baseline

- Production `(default)` Firestore is Standard edition, Native mode, in `africa-south1`.
- Development Firestore must use the same `africa-south1` location.
- Production currently has no deployed Cloud Functions.

## Billing boundary

`mmg-concierge-dev` was created on the Spark plan. Firebase rejected creation of the Standard Firestore database because billing is not enabled. Cloud Functions v2 also requires Blaze billing. No billing account has been linked by an agent.

## Security Rules deployment blocker

The pre-deployment red-team review found a high-severity projection leak in the current Firestore Rules/data model:

- `vehicles/{vehicleId}` becomes client-readable when `discoverable == true`, but the stored record is the owner/trusted record and can contain `ownerId`, `lastDecisionReason`, `pendingRevisionId`, and `primaryImagePath`.
- `vehicles/{vehicleId}/images/{imageId}` becomes renter-readable with a discoverable parent, but `VehicleImageRecord` contains private `variantPaths`, processing internals, and the original upload ID.

Client DTO parsing does not repair a network-level leak. Do not deploy Firestore Rules to development or production until renter discovery reads a dedicated sanitized public projection, or the trusted records are otherwise split so forbidden fields cannot cross the read boundary. Add negative emulator tests containing real private-path/moderation fields before closing this gate.

After the product owner explicitly authorizes billing linkage:

1. Link the intended Google Cloud billing account to `mmg-concierge-dev` and configure a budget alert.
2. Reconfirm the active Firebase project is exactly `mmg-concierge-dev`.
3. Create `(default)` Firestore as Standard/Native in `africa-south1` with delete protection.
4. Provision the default Storage bucket in the matching supported location.
5. Repair the trusted/public vehicle projection boundary and add network-level negative Rules tests.
6. Run the Firestore and Storage emulator Rules suites and resolve every high/critical audit finding.
7. Deploy Firestore Rules/indexes, Storage Rules, and Functions to `development` only. Development Auth is already enabled for Email/Password and Google Sign-In.
8. List deployed Functions and run authenticated callable smoke checks.

Never copy production Auth users, government IDs, exact locations, bookings, tokens, or private Storage objects into development.
