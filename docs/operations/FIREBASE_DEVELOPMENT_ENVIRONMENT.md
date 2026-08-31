# Firebase development environment

**Project:** `mmg-concierge-dev`  
**Production project:** `mmg-concierge`  
**Provisioning date:** 2026-08-30  
**Status:** Blaze billing, app registrations, Firestore, Functions, callable invocation IAM, and the private cleanup schedule are provisioned. The S1 renter-discovery security hardening is implemented on `codex/vehicle-public-projection-hardening` but is not deployed or emulator-signed-off yet. Storage remains unprovisioned.

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

- `(default)` Firestore is Standard/Native in `africa-south1`, with delete protection and the platform's closed default Rules.
- The previously deployed Node 22 Functions are active in `africa-south1`.
- Callable Cloud Run services use the public transport invocation boundary so Firebase App Check/Auth can enforce application access.
- The last cloud deployment still contains the older discovery handlers. The repository now requires App Check + Auth for `resolveSearchPlace`, App Check + authenticated-renter access for `searchVehicles`, and adds the architecture-defined protected `getVehicleDetails` callable. These changes require redeployment and smoke evidence.
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

The branch includes negative Rules cases with a deliberately discoverable trusted record containing moderation/private-path fields. These tests are intended to prove that `discoverable: true` no longer grants Firestore client access. The branch also includes serializer tests proving that Function responses do not contain owner IDs, moderation reasons, or private paths.

## Remaining development-environment gates

1. Run repository typecheck/build/tests and the Firestore emulator Rules suite for the S1 changes. Do not claim the Rules gate complete until the emulator suite passes.
2. Reauthenticate the Firebase CLI with `firebase login --reauth` in the operator environment.
3. Reconfirm the active project is exactly `mmg-concierge-dev`.
4. Deploy the corrected discovery Functions, including `getVehicleDetails`, to development only.
5. Verify anonymous/missing-App-Check discovery is rejected and authenticated renter requests succeed from a native development build.
6. Only after the Function boundary and Rules emulator tests are green, deploy the hardened Firestore Rules/indexes to development.
7. Provision the development default Storage bucket in the matching supported data location. Do not recreate or alter the production bucket.
8. Run Storage Rules and media lifecycle tests, then execute the private Scheduler cleanup once and verify logs/safe abandoned-upload behavior.
9. Re-run the complete development integration path before starting live Paystack work.

Never copy production Auth users, government IDs, exact locations, bookings, tokens, or private Storage objects into development. Never loosen production Rules as a rollback for discovery. If the Function discovery boundary fails, fail discovery closed and fix forward.
