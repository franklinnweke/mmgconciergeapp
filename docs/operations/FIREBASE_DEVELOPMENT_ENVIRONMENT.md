# Firebase development environment

**Project:** `mmg-concierge-dev`
**Production project:** `mmg-concierge`
**Provisioning date:** 2026-08-30
**Status:** Blaze billing, app registrations, Firestore, and Function resources are provisioned; callable IAM and the scheduled cleanup job remain incomplete

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

## Billing status

The Firebase console confirms that `mmg-concierge-dev` is on the Blaze plan and linked to the `Firebase Payment` billing account. A project budget is visible in the console. The Firebase MCP process still reported stale Spark-plan state during the 2026-08-30 verification attempt, so the installed Firebase CLI was used for read-only inventory checks.

Current live inventory:

- `(default)` Firestore is Standard/Native in `africa-south1`, with delete protection and the platform's closed default rules.
- All 21 Node 22 Function resources are `ACTIVE` in `africa-south1`.
- The 20 callable Cloud Run services currently have no invoker IAM binding, so requests receive a platform-level HTTP 403 before Firebase App Check/Auth runs.
- `expireAbandonedOwnerVerificationUploads` is deployed, but its Cloud Scheduler job was not created because Cloud Scheduler does not support `africa-south1`.
- The Functions artifact repository has a one-day cleanup policy.
- The ignored local payment test credential is absent from all 21 deployed Function runtime environments.
- Development Auth is enabled for Email/Password and Google Sign-In.
- The registered iOS, Android, and Admin web apps are present.

Creation of billable development resources and any deployment remain separately authorized cloud mutations. Always pass `--project mmg-concierge-dev` or use the `development` alias; never infer the target from production configuration.

## Security Rules deployment blocker

The pre-deployment red-team review found a high-severity projection leak in the current Firestore Rules/data model:

- `vehicles/{vehicleId}` becomes client-readable when `discoverable == true`, but the stored record is the owner/trusted record and can contain `ownerId`, `lastDecisionReason`, `pendingRevisionId`, and `primaryImagePath`.
- `vehicles/{vehicleId}/images/{imageId}` becomes renter-readable with a discoverable parent, but `VehicleImageRecord` contains private `variantPaths`, processing internals, and the original upload ID.

Client DTO parsing does not repair a network-level leak. Do not deploy Firestore Rules to development or production until renter discovery reads a dedicated sanitized public projection, or the trusted records are otherwise split so forbidden fields cannot cross the read boundary. Add negative emulator tests containing real private-path/moderation fields before closing this gate.

After the product owner explicitly authorizes development-resource creation and deployment:

1. Reconfirm the active Firebase project is exactly `mmg-concierge-dev`.
2. Grant the standard public network invoker role to the 20 HTTPS callable services; Firebase App Check/Auth remains the application authorization layer.
3. Choose an explicitly approved supported Cloud Scheduler region and scheduling topology for the cleanup handler while keeping the data-processing Function in `africa-south1` where possible.
4. Provision the default Storage bucket in the matching supported location.
5. Repair the trusted/public vehicle projection boundary and add network-level negative Rules tests.
6. Run the Firestore and Storage emulator Rules suites and resolve every high/critical audit finding.
7. Deploy Firestore Rules/indexes and Storage Rules only after those security gates pass.
8. Run authenticated callable smoke checks after the IAM boundary is reachable.

Never copy production Auth users, government IDs, exact locations, bookings, tokens, or private Storage objects into development.
