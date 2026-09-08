# MMG Concierge CI/CD

This document defines the repository automation and the remaining one-time account configuration for MMG Concierge.

## Goals

- Every pull request to `main` is automatically tested before merge.
- The GitHub checks are the source of truth for merge readiness, not a pasted local test report.
- Development Firebase may deploy automatically only after the exact `main` revision passes CI.
- Production Firebase (`mmg-concierge`) is never an automatic deployment target.
- EAS/TestFlight builds remain explicit and must originate from `main`.

## CI workflow

`.github/workflows/ci.yml` runs for pull requests to `main`, pushes to `main`, and manual dispatch.

Required jobs:

1. **Quality**
   - `npm ci`
   - `npm run check`
   - production build of the Next.js Admin application
2. **Firebase Rules**
   - Firestore Rules emulator tests
   - Storage Rules emulator tests
3. **Functions Emulator**
   - full Functions Firestore emulator suite
4. **Gate**
   - fails unless every required job above succeeds

Runtime is pinned to Node 22. Emulator jobs install Temurin Java 21.

The single status to require in branch protection is **`CI / Gate`**. Keeping branch protection attached to one aggregate gate means individual jobs can be reorganized later without weakening the merge policy.

## Development CD workflow

`.github/workflows/deploy-development.yml` listens for a successful `CI` run on `main` and can also be invoked manually from `main`.

The workflow:

- checks out the exact SHA that passed CI;
- ignores revisions that changed no Firebase backend/rules files;
- authenticates through GitHub OIDC / Google Workload Identity Federation;
- rebuilds Functions;
- deploys only `functions`, `firestore`, and `storage` to **`mmg-concierge-dev`**;
- never targets `mmg-concierge`;
- never triggers an EAS or TestFlight build.

Development deployment is installed but disabled until `MMG_DEV_CD_ENABLED=true` is configured.

## One-time Google Cloud configuration

Use Application Default Credentials through Workload Identity Federation. Do not create a long-lived Firebase CI token.

Create a dedicated service account in `mmg-concierge-dev`, for example:

`github-firebase-deployer@mmg-concierge-dev.iam.gserviceaccount.com`

For the development deploy surface, grant the permissions required to deploy Firebase Functions plus Firebase Rules/Firestore indexes. Firebase documents Cloud Functions deployment as requiring `roles/cloudfunctions.admin` plus `roles/iam.serviceAccountUser`; the service account also needs the Firebase Rules and Firestore index permissions used by this repository. Keep these grants on the development project only.

Create a Workload Identity Pool/provider for GitHub Actions and restrict the provider to this repository and `main`, for example with an attribute condition equivalent to:

```text
assertion.repository == 'franklinnweke/mmgconciergeapp' && assertion.ref == 'refs/heads/main'
```

Map at minimum:

```text
google.subject=assertion.sub
attribute.repository=assertion.repository
attribute.ref=assertion.ref
```

Grant the GitHub repository principal `roles/iam.workloadIdentityUser` on the dedicated deploy service account.

Then add these **GitHub repository variables**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER` = `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>`
- `GCP_DEPLOY_SERVICE_ACCOUNT` = the deploy service-account email
- `MMG_DEV_CD_ENABLED` = `true`

The provider and service-account identifiers are not secrets. No service-account private key should be stored in GitHub.

## GitHub repository protection

After the first CI run exists, configure a ruleset or branch protection rule for `main`:

- require a pull request before merging;
- require status check **`CI / Gate`**;
- require branches to be up to date before merging;
- require conversation resolution;
- block force pushes;
- block branch deletion;
- do not allow routine bypass of failed checks.

This repository previously had no `main` protection, so this setting is an important part of making CI enforceable rather than advisory.

## GitHub environment

Use a GitHub environment named `development` for the deployment job. Development can remain automatic after CI. Do not create an automatic production deployment workflow during MVP hardening.

## Admin deployment

The repository already declares Firebase App Hosting backend `mmg-admin`. Firebase App Hosting supports its own GitHub-triggered automatic rollout policy. CI validates the Admin build before merge; avoid creating a second competing App Hosting rollout path until the existing backend connection is explicitly verified.

## TestFlight

The CI/CD workflows intentionally do not build or submit iOS releases. The project invariant remains:

> Every EAS/TestFlight build must originate from `main`.

A TestFlight build is a deliberate release action after the relevant `main` SHA is known and accepted.

## What an external reviewer should see

For a normal pull request, GitHub should display automated checks similar to:

```text
CI / Quality             passed
CI / Firebase Rules      passed
CI / Functions Emulator  passed
CI / Gate                passed
```

After merge, a backend/rules change on `main` can additionally produce:

```text
Deploy Development / Firebase Development  passed
```

This gives an external reviewer an auditable record that changes are tested automatically and that development deployment is tied to a validated `main` revision.
