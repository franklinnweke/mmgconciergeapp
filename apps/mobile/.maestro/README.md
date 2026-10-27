# Native development smoke flows

Run on an installed native development-Firebase binary, never production. Maestro and a booted supported simulator/emulator are operator prerequisites; these files do not install a runner, provision accounts or modify backend fixtures. A TestFlight binary on a physical iPhone still needs the equivalent manual acceptance where automation is unavailable.

From `apps/mobile`, with a verified development test account:

```sh
maestro test -e TEST_EMAIL="$MMG_TEST_EMAIL" -e TEST_PASSWORD="$MMG_TEST_PASSWORD" .maestro/session.yaml
```

Start **signed out**. This signs in, checks the existing profile and tabs, and signs out. It neither registers nor deletes an account. Keep credentials out of Git, shell history, screenshots and uploaded runner artifacts; use a dedicated non-customer account. Repeat manually with Google and Apple, including same-user relogin/sign-out.

For an already signed-in development renter with a known **still-pending Paystack test transaction**:

```sh
maestro test -e TRIP_ROW="$MMG_TEST_PENDING_TRIP_LABEL" .maestro/checkout-resume.yaml
```

Supply the exact row accessibility label (`View <vehicle>: <state>`). This opens that existing checkout, stops/relaunches the process, reopens it from Trips and asserts status-checking rather than a new-payment action. It does not initiate payment, alter expiry or synthesize provider truth. If the provider settles the fixture during the test, re-establish the intended precondition rather than weakening the assertions.

For an already signed-in, approved development owner with a pre-existing photo-bearing vehicle visible in Fleet:

```sh
maestro test -e VEHICLE_ID="$MMG_TEST_VEHICLE_ID" .maestro/owner-preview.yaml
```

The image test ID appears only after Expo Image's load callback, not just after receiving a preview URL. This checks one listing across cold launches; also manually check under-review and live vehicles, expired-preview refresh, offline fallback, detail/management views, and sign-out. Never record signed URLs or private Storage paths.

These scripts deliberately do not automate financial setup, Admin approvals, SMS, customer contact or Paystack card entry. Use the human request-first runbook and pickup acceptance checklist for the full commercial journey. Record exact source SHA, binary/build, device/OS, flow and result on Issue #35; a parsed YAML file is not a passed native test.

Reference: [Maestro launch/relaunch](https://docs.maestro.dev/reference/commands-available/launchapp), [stopApp](https://docs.maestro.dev/reference/commands-available/stopapp).
