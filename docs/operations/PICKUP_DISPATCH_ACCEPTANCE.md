# Pickup and Dispatch Reliability

Scope: confirmed pickup continuity, foreground device location, authorized dispatch and native map-provider alignment. No live tracking, background location, chauffeur mode, new database, price/payment changes or automatic dispatch is included.

## Operating model

- A renter explicitly selects GPS or an address, checks the meeting point, optionally adds an entrance note and confirms it. Later device movement never changes that saved pickup.
- Device acquisition requests high accuracy, accepts only finite fresh fixes (at most 30 seconds old), targets 50m-or-better accuracy and stops within 15 seconds. A fresh approximate fix can be shown with a correction warning; it is not entrance verification. Reverse geocoding has a separate 3-second timeout and cannot block coordinate selection indefinitely.
- Permission denial, disabled services, acquisition failure and out-of-area fixes leave manual search available. Dismissal/reset/unmount stops acquisition and discards late results.
- Trip Detail preserves the request pickup after payment, using only an explicit matching booking link, vehicle and dates. Older records show **Pickup not recorded**; no garage or discovery-centre fallback is permitted.
- Dispatch staff (`support`/`super_admin`, `bookings.manage_requests`) expand **Pickup details**, inspect address/entrance note, open directions and confirm the agreed pickup time. `HH:mm` means the request start date in Africa/Lagos, not the staff browser's time zone. It does not change day-based pricing or booking state.
- The existing private request is the pickup source of truth. Exact location reads are guarded on the Admin server before serialization. The new confirmation helper is Admin-server code, not a new mobile callable. Raw requests remain client-denied; owner projections do not gain pickup or dispatch time.

## iOS Google Maps setup (operator step, not performed by this PR)

The existing pickup search uses Google Places. Native pickup maps now explicitly request Google Maps on both platforms, avoiding Google Places content over implicit iOS MapKit.

1. Use the existing **mmg-concierge-dev** Google Cloud project. Verify **Maps SDK for iOS** is enabled and a suitable SDK key exists. Do not create a project, alter production or reuse the server Places secret.
2. The iOS SDK key must be restricted to bundle `com.mmgconcierge.app` and the Maps SDK for iOS API. Use a separate platform-restricted Android key where available; Android's current Firebase-config key fallback is preserved, not claimed re-audited here.
3. Supply the iOS key as `MMG_GOOGLE_MAPS_IOS_API_KEY_DEV` in the EAS environment actually resolved for the development/TestFlight profile, with sensitive visibility so local app-config resolution can also access it. `testflight-development` inherits the store-distribution profile and currently has no explicit EAS `environment` field: do not assume its EAS variable environment is named `development` just because `MMG_FIREBASE_ENV=development`. Verify the resolved environment first. This SDK key is embedded in the binary; bundle/API restrictions provide the security boundary. It is not `PAYSTACK_SECRET_KEY` or the server Places key. Do not paste key values into GitHub or coordination logs. `MMG_GOOGLE_MAPS_ANDROID_API_KEY_DEV` can override the existing Android fallback. Production uses separately named `_PROD` variables and remains outside this task.
4. `app.config.js` wires these values into the existing `react-native-maps` config plugin. A native iOS EAS build fails configuration if the iOS key is missing. Local builds without configuration show a quiet map-preview-unavailable state but still support GPS/search selection; they do not render a MapKit substitute. Web uses a native-map-free fallback rather than importing unsupported native view managers.
5. Check native plugin resolution using the correct EAS environment before launching a build, reporting only key-presence booleans. A new native binary is mandatory. No OTA/backend deployment can add the Google Maps iOS SDK to an installed app.
6. Verify Google map tiles load, the adjusted pin matches the intended coordinate, and Google/legal attribution stays visible above the pickup sheet at every sheet height. Missing credentials/API enablement, native build compatibility and physical rendering remain release gates, not assumed complete from unit tests.

Primary references: [Expo SDK 57 maps](https://docs.expo.dev/versions/v57.0.0/sdk/map-view/), [Expo SDK 57 location](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [Google Places policy](https://developers.google.com/maps/documentation/places/web-service/policies). Provider-content retention and transaction-record policy review remain separate pre-launch obligations; this package does not certify all existing retention practices.

## Rollout order

1. Review and merge green code to `main`; do not build from the feature branch.
2. Deploy changed `listRenterRentalRequests` code to development. Old callers omit `includePickupDispatch` and must receive the original response shape even when staff has set a pickup time. New mobile callers opt in to that field. No new Function, Firestore collection, index or Rules change is required.
3. Deploy Admin from the same reviewed revision so pickup reads and the audited time-confirmation helper are live. No standalone Function deployment enables an imported Next.js server action.
4. Configure/verify the development iOS SDK key, then create a main-only `testflight-development` binary once authorized. Do not claim device acceptance or launch readiness merely because CI passed.

## Acceptance checklist

- iPhone and Android: allow precise location, approximate-only location, deny permission, disable services, poor GPS, no fix, lost geocoding network and dismissal during acquisition.
- Confirm the selected pin does not move after selection; repeat GPS requests and rapid dismissal must not apply an older result or leave a watcher running.
- Confirm an entrance within the adjustment radius; verify the radius is not presented as a building/property guarantee. The default map camera must never become a selected pickup silently.
- Send a real development request. Renter Trip Detail and authorized Admin must show the same address, note, coordinate destination and confirmed Lagos time before and after trusted payment conversion.
- Staff confirms time after speaking with the renter. Stale versions, invalid/past times, cancelled requests and unauthorized roles fail without partial changes. Repeated submissions produce one domain audit and one Admin audit. Price, payment and inventory remain unchanged.
- A different renter, owner and unrelated staff role cannot retrieve the private pickup. Verify raw-request Rules remain denied. No coordinates are logged.
- Existing TestFlight callers still load their request list after staff confirms time. Historical missing pickups show the missing state, not a made-up address or a different car's base.
- Open directions targets the confirmed pin, including an adjusted entrance, rather than an old Place ID. Test link failure and a device without the Maps app.
- Review loading, errors, long addresses and touch targets at 320, 390 and 430px widths. Browser component previews do not substitute for native GPS/map acceptance.

Stop after review and report actual deployment/build/device evidence separately. Do not provision infrastructure, rotate keys, change IAM or start live tracking as part of acceptance.
