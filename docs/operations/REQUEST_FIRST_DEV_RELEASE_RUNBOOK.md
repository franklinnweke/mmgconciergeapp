# Request-first development release runbook

This is the manual, two-step deployment boundary for Build 30. It targets
`mmg-concierge-dev` only and never targets production `mmg-concierge`, changes
secrets/provider settings/IAM, or deletes Functions or Scheduler jobs.

## Before either operation

Use a clean exact `main` revision that passed CI:

```bash
git fetch origin main
git switch main
git status --short
git rev-parse HEAD origin/main
npm ci
npm run firebase:secrets:audit
```

The source audit is local-only. It rejects ambient `process.env.PAYSTACK_SECRET_KEY`,
requires one shared `defineSecret` declaration, verifies exactly five explicit
secret bindings, and checks every production `PaystackPaymentAdapter` call site
passes `secretKey`.

Record these read-only cloud checks before deployment:

- Firebase Authentication: Phone provider enabled and SMS region policy allows
  `NG`.
- Firestore: `(default)` is Standard in `africa-south1`.
- Secret Manager: `PAYSTACK_SECRET_KEY` metadata exists and has an enabled
  version; inspect metadata only, never a secret payload.
- Indexes: compare the remote index metadata with
  `firebase/firestore.indexes.json`; the local file must not remove an existing
  remote index. If using JSON output, sanitize it to index names/fields/states;
  never print raw Function JSON that could contain environment values.

The local Firebase CLI authentication is the credential path for the scripted
deploy commands. ADC and `gcloud` are not prerequisites for those commands.

## Step 1: Rules and indexes

```bash
npm run firebase:deploy:request-first-firestore
```

After that command, manually poll the three request indexes until each is
`READY` before deploying Functions. A sanitized CLI check is:

```bash
npx -y firebase-tools@latest firestore:indexes --project mmg-concierge-dev --json \
  | jq '{indexes: [.result.indexes[] | {collectionGroup, fields, state}]}'
```

The required `rentalRequests` indexes are `(ownerId, updatedAt)`,
`(renterId, state)`, and `(state, holdExpiresAt)`. Do not proceed while any is
creating, error, or absent.

## Step 2: Targeted Functions

```bash
npm run firebase:deploy:request-first-functions
```

This command names exactly these 13 Functions and excludes `createBookingIntent`:

```text
createRentalRequest approveRentalRequest declineRentalRequest
releaseRentalRequestPaymentHold initializeRentalRequestPayment
listRenterRentalRequests listOwnerRentalRequests
expireRentalRequestPaymentWindows initializeBookingPayment paystackWebhook
processPaystackPaymentEvent reconcilePayment requestAccountDeletion
```

After deployment, verify the targeted Functions and scheduled job using
non-JSON CLI output (never `firebase functions:list --json`):

```bash
npx -y firebase-tools@latest functions:list --project mmg-concierge-dev \
  | rg 'expireRentalRequestPaymentWindows|initializeRentalRequestPayment|paystackWebhook'
```

Confirm `expireRentalRequestPaymentWindows` is in `europe-west1`, uses
`Africa/Lagos`, and its Scheduler job is enabled. Record the exact source SHA,
the two command results, index readiness, scheduler evidence, and the handoff
on GitHub Issue #35.

## Deferred inspection-only findings

Existing unrelated development Functions may retain a legacy plain
`PAYSTACK_SECRET_KEY` environment variable. Do not rotate, redeploy, or delete
those Functions as part of this release; inspect and track them separately.

The orphan legacy `emitOwnerResponseSlaAlerts` resource in `africa-south1`
also remains inspection-only. The canonical payment-window scheduler is the
new `europe-west1` Function. No automatic cleanup or deletion is encoded here.
