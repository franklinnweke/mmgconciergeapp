# Request-first development release runbook

This runbook is the auditable deployment boundary for the Build 30 request-first
Functions and Firestore configuration. It targets **`mmg-concierge-dev` only**.
It never targets production (`mmg-concierge`), changes Secret Manager values,
changes provider settings or IAM, or deletes a Function/Scheduler resource.

Run the commands below from a clean checkout of the exact `main` revision that
passed CI. The helper refuses a feature branch, a dirty worktree, a stale
`origin/main`, a missing development project, or a production project flag.

## Preflight and targeted deployment

```bash
git fetch origin main
git switch main
git rev-parse HEAD origin/main
npm ci
npm run firebase:preflight:request-first-dev
npm run firebase:deploy:request-first-dev
npm run firebase:preflight:request-first-dev
```

The first preflight is read-only and checks the exact source revision, checked-in
Firebase topology, Functions build boundary, secret-binding audit, Phone Auth
and NG SMS access, Firestore edition/location, required APIs and billing,
Secret Manager metadata, additive index safety, and the canonical scheduler.
The second preflight is the same read-only verification after deployment and is
the evidence that the canonical scheduler and runtime secret metadata are
healthy. Neither preflight reads a secret payload.

The deployment command runs exactly this Firebase target set:

```text
firestore:rules
firestore:indexes
functions:createRentalRequest
functions:approveRentalRequest
functions:declineRentalRequest
functions:releaseRentalRequestPaymentHold
functions:initializeRentalRequestPayment
functions:listRenterRentalRequests
functions:listOwnerRentalRequests
functions:expireRentalRequestPaymentWindows
functions:initializeBookingPayment
functions:paystackWebhook
functions:processPaystackPaymentEvent
functions:reconcilePayment
functions:requestAccountDeletion
```

`createBookingIntent` is intentionally absent. Storage, Hosting, Auth, Admin
App Hosting, and unrelated Functions are not part of this deployment boundary.

## Paystack secret boundary

`PAYSTACK_SECRET_KEY` is defined once in the Functions source and is explicitly
bound only to the five payment entrypoints:

- `initializeRentalRequestPayment`
- `initializeBookingPayment`
- `paystackWebhook`
- `processPaystackPaymentEvent`
- `reconcilePayment`

The adapter does not read `process.env.PAYSTACK_SECRET_KEY`; an ambient legacy
environment variable cannot silently grant provider access to another Function.
The Firebase `functions` predeploy hook runs the same source audit before any
Functions deployment. The remote preflight checks Secret Manager metadata and
inspects deployed Function configuration for a plain `PAYSTACK_SECRET_KEY`
environment variable or an unintended secret binding. It uses metadata only,
and never prints `firebase functions:list --json` or any secret value.

## Scheduler and legacy inspection

`expireRentalRequestPaymentWindows` must remain a scheduled Function in
`europe-west1` with `Africa/Lagos` timezone and a five-minute schedule. The
preflight verifies the canonical job after deployment.

The cloud currently has a legacy/orphan `emitOwnerResponseSlaAlerts` resource
in addition to the canonical schedule. Inspect it without mutation if needed:

```bash
npx -y firebase-tools@latest functions:list --project mmg-concierge-dev \
  | rg 'emitOwnerResponseSlaAlerts|expireRentalRequestPaymentWindows'
gcloud functions describe emitOwnerResponseSlaAlerts --gen2 \
  --region=africa-south1 --project=mmg-concierge-dev \
  --format='table(name,state,updateTime)'
```

Do not add automatic deletion or cleanup to the script. Removing or changing a
legacy Function/Scheduler resource requires separate human authorization after
its trigger, logs, and ownership are reviewed.

## Cloud-only residual actions

If preflight reports a missing API, billing state, Phone Auth/NG region policy,
Firestore edition/location mismatch, or stale remote index, stop and resolve
that cloud configuration separately. Do not work around a failed check by
targeting `mmg-concierge` or by weakening Rules. If the remote index check says
the local file would remove an existing remote index, add the remote index to
the checked-in additive configuration and review it before retrying.

No EAS build, production deployment, Paystack live credential, IAM change,
provider setting change, or destructive cloud cleanup belongs in this runbook.
