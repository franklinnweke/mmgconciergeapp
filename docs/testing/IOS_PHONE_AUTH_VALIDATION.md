# MMG Concierge — iOS Phone Auth App Verification Validation

**Date:** September 9, 2026  
**Environment:** `mmg-concierge-dev` (`africa-south1`), iOS Simulator & Native Prebuild  
**App Identifier:** `com.mmgconcierge.app` (`1:133019251795:ios:fc62fff7dbeca725dc82a6`)  

---

## 1. Summary of Changes & Verification

In Build 29, physical device testing encountered two primary blockers:
1. `auth/operation-not-allowed` when requesting SMS OTP delivery.
2. Inability to use silent APNs app verification due to missing iOS background modes and entitlements.

This validation documents the resolution and local/cloud verification performed for Build 30.

---

## 2. Local iOS Configuration & Entitlements

The Expo configuration (`apps/mobile/app.json`) was updated to enable:
- `ios.entitlements["aps-environment"]: "development"`
- `ios.infoPlist["UIBackgroundModes"]: ["fetch", "remote-notification"]`

### Introspection Verification
Running `npx expo config --type introspect` confirms:
```json
{
  "ios": {
    "entitlements": {
      "aps-environment": "development"
    },
    "infoPlist": {
      "UIBackgroundModes": [
        "fetch",
        "remote-notification"
      ]
    }
  }
}
```

Running `npx expo prebuild --platform ios --no-install` verifies that the generated `MMGConcierge.entitlements` contains:
```xml
<key>aps-environment</key>
<string>development</string>
```
and `Info.plist` contains:
```xml
<key>UIBackgroundModes</key>
<array>
  <string>fetch</string>
  <string>remote-notification</string>
</array>
```

---

## 3. Firebase Dev Environment Configuration (`mmg-concierge-dev`)

Identity Platform / Firebase Authentication configuration on `mmg-concierge-dev` was inspected and repaired via Google Cloud API:

1. **Phone Provider Status:**
   - Patched `signIn.phoneNumber.enabled = true`.
   - Verified active on `identitytoolkit.googleapis.com/v2/projects/mmg-concierge-dev/config`.

2. **SMS Region Policy:**
   - Configured `smsRegionConfig.allowlistOnly.allowedRegions`: `["NG", "US", "GB"]`.
   - Verified that Nigerian numbers (`+234...`) are explicitly permitted and will not be rejected at the cloud tenant policy boundary.

3. **Quota & Safety:**
   - Daily SMS quota verified unrestricted.

---

## 4. APNs Authentication Key Requirement

Silent APNs phone app verification requires Apple Push Notification service credentials in the Firebase Console:
- **Location:** `Firebase Console -> Project Settings -> Cloud Messaging -> Apple app configuration -> APNs authentication key`
- **Action Required by Franklin:** Ensure an Apple Developer APNs Auth Key (`.p8`) with Key ID and Team ID is configured for `com.mmgconcierge.app` so that physical iOS devices receive the silent push token without falling back to web reCAPTCHA.
