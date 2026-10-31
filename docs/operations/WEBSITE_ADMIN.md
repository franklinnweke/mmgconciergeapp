# Website vehicle workspace

The existing staff admin now has `/web`, separate from app operations. It shares secure staff sign-in; `super_admin` and `vehicle_admin` have `web.read` and `web.manage`. Other staff roles cannot access its pages or write APIs.

## Data and publishing

- `websiteVehicles`: current editable records, including drafts and archived vehicles.
- `websitePublishedVehicles`: explicit publication snapshots only. Saving an edit never changes the public snapshot. Hiding or archiving deletes it; restoring leaves a vehicle hidden. Permanent deletion removes both editable and published records atomically and records an audit/tombstone.
- `websiteMedia`: upload metadata. Image bytes use only `private/website-media/{id}.webp` in the existing Firebase bucket.
- `websiteDeletedVehicles`: tombstones preventing a later seed import from resurrecting deleted listings.
- `websiteAdminAudit`: staff actor, action, version and timestamp for each vehicle mutation.

No website operation changes app vehicles, owner documents, bookings or payments. Existing catch-all Firestore and Storage rules continue denying direct client access. Staff writes go through same-origin, live-session checked server APIs. Optimistic version checks reject stale saves; Firestore transactions commit publication and audit together.

Uploads accept JPEG, PNG and WebP, at most 10 MB and 40 megapixels; actual bytes are decoded, rotated, resized to 2200 pixels and re-encoded as WebP without source metadata. Each vehicle supports ten photos, cover selection, gallery ordering, captions and focal points. Removing a photo detaches it; it does not immediately destroy the stored file. No storage lifecycle/automatic deletion is configured in this release.

`GET /api/web/catalogue` exposes only marketing fields from published snapshots. `GET /api/web/media/{id}` serves private images to authorized staff and allows public access only while a published snapshot references that image. Public media responses can remain cached for 60 seconds; downstream image optimization/CDN caches may retain already-published images longer. This is for public marketing photography only.

## Enable the website connection

1. Deploy the admin and website branches through the existing Coolify workflow. Keep Firebase environment and credentials consistent with the target deployment; never use production credentials for local validation.
2. On the admin, set `MMG_WEB_MEDIA_BASE_URL` to the admin's exact public HTTPS origin, with no path or credentials.
3. Sign in at `/web`. Import the existing website fleet; this creates missing records as drafts and never overwrites edits. Review images, reference/illustration labels, captions, cover and details. Publish the listings that should be visible.
4. On the marketing website, set server-only `MMG_WEBSITE_CATALOGUE_URL` to that admin origin plus `/api/web/catalogue`, then deploy/restart the website. Its image allowlist derives from that origin. No browser Firebase credentials or service-account keys are passed to the website.
5. Verify home, fleet, detail galleries and booking choices. They all read the same publication feed without a code deployment for subsequent editorial changes.

Before that variable is enabled, the website deliberately retains its curated static fleet. Once configured, an empty feed means no published vehicles; feed failures do not restore hidden static listings. Existing seeded slugs are retained, and new vehicles receive stable slugs.

## Local verification

`MMG_ADMIN_FIXTURES=1 npm run admin` opens a clearly labelled local preview with fixture data. Its changes are stored in the OS temporary directory (`mmg-website-admin-preview`) and never touch Firebase. Fixture access is disabled in production. For local end-to-end previews only, the publication base and website feed may use `http://127.0.0.1`.

Run `npm run admin:typecheck`, `npm run admin:lint`, `npm run admin:test` and `npm run admin:build`. The real transaction/photo integration test is `apps/admin/src/features/web/server/catalogue.emulator.test.ts`; it runs only with both local Firestore and Storage emulator hosts, against `mmg-concierge-dev`. It cleans up its own records and images.

## Complete local fleet verification

The local website uses `MMG_WEBSITE_CATALOGUE_URL=http://127.0.0.1:3100/api/web/catalogue` in `.env.development.local`. The local admin uses `NEXT_PUBLIC_MMG_WEBSITE_URL=http://127.0.0.1:3000` so its preview links open the connected local website. It shares all nine current website listings with `/web`, including eleven uploaded existing images. `Best suited to` is editable alongside the other vehicle details.

For an explicit local-only bootstrap, run `node apps/admin/scripts/sync-local-website-fleet.mjs --replace-local /path/to/website/public/images` while the fixture admin is running. This overwrites local preview listings with the curated fleet; it refuses non-loopback URLs. It imports and uploads via the actual admin APIs. Deleted seeded records are not silently re-imported.

Run `node apps/admin/scripts/test-local-website-fleet.mjs` against the two local servers. It tests all nine migrated cars, draft isolation, editing all details, image uploads/cover/order/caption/focal point, image optimization, publishing across home/fleet/details/booking, creating a vehicle without rebuilding, stale-delete rejection and permanent deletion. It restores the original nine-car catalogue after the test. `MMG_WEB_TEST_REPORT` optionally writes its results to a JSON file.
