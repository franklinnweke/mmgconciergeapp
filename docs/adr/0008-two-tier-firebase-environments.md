# ADR 0008: Use two Firebase cloud environments

- Status: Accepted
- Date: 2026-08-30

## Context

The original architecture required development, staging, and production Firebase projects. The implemented system currently uses the existing Blaze-plan project `mmg-concierge` for Authentication, Firestore, Storage, Cloud Functions, App Check, logging, and registered production mobile/web apps. Cloud Functions and vehicle media are already configured there.

One shared cloud project would be operationally simple, but it would put development Functions, Rules, indexes, Auth users, FCM tokens, test data, private owner documents, and future Paystack sandbox behavior in the same data plane as real customers. The Emulator Suite provides strong deterministic isolation but does not fully reproduce Phone Auth, production App Check, APNs/FCM, Secret Manager, IAM, Paystack webhooks, Maps restrictions, or deployed runtime behavior.

Three cloud projects are unnecessary for the controlled MVP. Two provide the important isolation without adding a dedicated staging tier.

## Decision

MMG Concierge uses this topology:

```text
Local and automated tests
Firebase Emulator Suite
          |
          v
Cloud development and integration
mmg-concierge-dev
          |
          v
Controlled and public production
mmg-concierge
```

- `mmg-concierge-dev` is the cloud development/integration project. EAS development builds, test Auth users and phone numbers, integration fixtures, test FCM tokens, test Maps credentials, development App Check registrations, and future Paystack sandbox credentials belong there.
- `mmg-concierge` is production. Release/TestFlight/Play Store builds, real customers, owner identity documents, production App Check, production notification credentials, and future live Paystack credentials belong there.
- A dedicated staging Firebase project is not required for MVP.
- Local development, destructive test cases, Rules tests, emulator integration tests, and repeatable fixtures use the Firebase Emulator Suite first.
- AI agents may prepare and validate deploys to development, but may not deploy to production without explicit operator authorization.
- Development-only fixtures may never silently replace a failed live read or mutation in either cloud project.
- Test and live third-party secrets are held in their corresponding projects. Runtime configuration must fail closed if a credential mode and project identity do not agree.
- Cloud cleanup is never an implicit development step. Destructive operations require separately authorized, scoped procedures and recovery plans.

## Provisioning boundary

This ADR records the target topology; it does not itself create `mmg-concierge-dev`, register apps, download SDK configuration, copy data, deploy Functions or Rules, or change `mmg-concierge`. Until the development project is provisioned and its app configurations are wired, `.firebaserc` retains only the existing production alias so no command can imply nonexistent isolation.

Before provisioning `mmg-concierge-dev`, an operator must verify and record the actual immutable Firestore and Storage locations of `mmg-concierge`. Repository documents currently record `africa-south1`; the live project remains authoritative. The development project should use the matching supported data location unless a reviewed exception explains why not.

## Consequences

- The release path is emulator -> `mmg-concierge-dev` integration -> controlled `mmg-concierge` production deployment. There is no staging promotion gate.
- Development and production require separate Firebase app registrations, App Check registrations, SDK configuration, Secret Manager values, IAM/deployment identities, data, Storage objects, FCM tokens, alerts, and backups.
- Promotion is by reviewed code/configuration and explicit deployment—not by copying development user data or private documents into production.
- Production deploys require passing gates, an exact deploy target, a named operator, and a rollback or forward-fix plan.
- Historical sequence documents may retain “staging” wording as a record of their original gate. Current architecture, plans, status documents, and agent handoffs use the two-tier model and controlled-release terminology.
- This ADR does not change payment truthfulness, deny-by-default Rules, App Check, server-owned state transitions, audit, idempotency, privacy, or any other security invariant.
