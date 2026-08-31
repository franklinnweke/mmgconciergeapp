# Firebase development environment

**Project:** `mmg-concierge-dev`  
**Production project:** `mmg-concierge`  
**Provisioning date:** 2026-08-30  
**Status:** Blaze billing, app registrations, Firestore with hardened S1 Security Rules and indexes, 22 Functions (including getVehicleDetails), callable invocation IAM, and the private cleanup schedule are provisioned in mmg-concierge-dev. Missing-App-Check callable rejection (401) is verified across all discovery endpoints. Storage remains to be provisioned in the console.

## Registered development apps

| Surface | Firebase app ID | Package / bundle |
|---|---|---|
| Android | `1:133019251795:android:f192492125abddccdc82a6` | `com.mmgconcierge.app` |
| iOS | `1:133019251795:ios:fc62fff7dbeca725dc82a6` | `com.mmgconcierge.app` |
| Admin web | `1:133019251795:web:6ef7e65a90a5b8b1dc82a6` | n/a |

Mobile development and preview EAS profiles select the checked-in development SDK files through `MMG_FIREBASE_ENV=development`. Production explicitly selects the existing production files. An unset value defaults to development so local native builds fail toward the non-production project.

## Verified production baseline

- Production `(default)` Firestore is Standard edition, Native mode, in `africa-south1`.
- Development Firestore uses the same `africa-south1` location.
- Production currently has no deployed Cloud Functions.

## Billing and live development inventory

The Firebase console confirms that `mmg-concierge-dev` is on Blaze and linked to the `Firebase Payment` billing account. A project budget is visible in the console.

Current live inventory:

- `(default)` Firestore is Standard/Native in `africa-south1`, with delete protection and hardened S1 Security Rules and indexes deployed.
- All 22 Node 22 Functions (including `getVehicleDetails`) are active in `africa-south1`.
- Callable Cloud Run services use the public transport invocation boundary so Firebase App Check/Auth enforce application access.
- `resolveSearchPlace`, `searchVehicles`, and `getVehicleDetails` enforce App Check + Auth (missing App Check / unauthenticated calls return 401 UNAUTHENTICATED).
- `expireAbandonedOwnerVerificationUploads` remains private. Its OIDC Cloud Scheduler job runs from `europe-west1` every 24 hours in the `Africa/Lagos` timezone because Cloud Scheduler has no Africa region.
- The Scheduler has not been exercised end to end because the development default Storage bucket is not yet provisioned.
- The ignored local Paystack test credential is absent from deployed Function runtime environments.
- Development Auth is enabled for Email/Password and Google Sign-In.

Creation of billable development resources and any deployment remain separately authorized cloud mutations. Always pass `--project mmg-concierge-dev` or use the `development` alias; never infer the target from production configuration.

## Renter vehicle security gate

The pre-deployment review found that the existing Rules allowed signed-in renters to read trusted `vehicles/{vehicleId}` and `vehicles/{vehicleId}/images/{imageId}` documents whenever a vehicle was discoverable. Those records can contain owner IDs, moderation reasons, revision IDs, private Storage paths, upload IDs, processing metadata, and other fields that must not cross the renter network boundary.

The checked-in schema evolution plan resolves this without creating a second listing collection:

1. `resolveSearchPlace`, `searchVehicles`, and `getVehicleDetails` are authenticated, App-Check-protected Functions.
2. Functions use the Admin SDK to read trusted vehicle/image records.
3. A strict discovery DTO whitelist removes owner identity, moderation state, private paths, and image-processing internals before serialization.
4. Native live discovery list/search/detail calls Functions instead of Firestore.
5. Web live discovery also uses Functions; deterministic preview data remains an explicit preview-only adapter.
6. Firestore Rules deny renters, anonymous users, and staff JavaScript clients all direct reads of trusted vehicle/image records. Owners retain only their narrow existing read scope. All trusted writes remain server-only.

No `publicVehicles`, `listings`, or other duplicate renter read-model collection is introduced. `vehicles`, `vehiclePrivate`, `vehicleRevisions`, and `vehicles/{vehicleId}/images` remain the canonical inventory families.

The branch includes negative Rules cases with a deliberately discoverable trusted record containing moderation/private-path fields. These tests demonstrate that `discoverable: true` no longer grants Firestore client access (18/18 rules unit tests passed). The branch also includes serializer tests proving that Function responses do not contain owner IDs, moderation reasons, or private paths.

## Remaining development-environment gates

1. Authenticated renter end-to-end smoke checks from native development build with registered App Check debug token.
2. Storage bucket provisioned: `mmg-concierge-dev.firebasestorage.app` in `africa-south1` with `firebase/storage.rules` deployed.
3. Media lifecycle and scheduled cleanup verified on live storage: EXIF/GPS stripping, promotion to `public/`, 403 enforcement on `private/`, demotion removal (404), and safe abandoned-upload cleanup verified.
4. Re-run the complete development integration path before starting live Paystack work.

Never copy production Auth users, government IDs, exact locations, bookings, tokens, or private Storage objects into development. Never loosen production Rules as a rollback for discovery. If the Function discovery boundary fails, fail discovery closed and fix forward.
