# ADR 0008: Operate one Firebase project

- Status: Accepted
- Date: 2026-08-30

## Context

The original architecture required separate development, staging, and production Firebase projects. The implemented repository and operator setup instead use one existing Blaze-plan project, `mmg-concierge`, for Authentication, Firestore, Storage, Cloud Functions, App Check, logging, and registered mobile/web apps. Cloud Functions and vehicle media are already configured against that project.

Maintaining a second or third Firebase project would add credentials, app registrations, billing, IAM, data seeding, App Check, provider, and deployment coordination that the current controlled product does not need. The product owner has explicitly chosen the simpler single-project model.

## Decision

- `mmg-concierge` is the only Firebase project used by the application.
- Do not create or require `mmg-concierge-dev`, `mmg-concierge-staging`, or `mmg-concierge-prod`.
- Local development, destructive test cases, Rules tests, integration tests, and repeatable fixtures use the Firebase Emulator Suite wherever possible.
- Release builds and development builds may use different EAS profiles, bundle settings, and App Check providers, but they connect to the same Firebase project.
- Development-only fixtures remain explicitly gated and may never silently replace a failed live read or mutation.
- Cloud data cleanup is never an automatic development step. Any destructive reset requires a separately authorized, scoped operator procedure and a recovery plan.
- Firebase deployment is a production-impacting action even during development. It requires passing relevant checks, an exact deploy target, a named operator, and a rollback or forward-fix plan.
- Test and live third-party secrets, especially future Paystack credentials, must remain separately named and selected by explicit server-side configuration. A single Firebase project does not permit test code to report a real payment or settlement.

## Consequences

- There is no staging promotion gate. The equivalent release gate is emulator validation followed by a controlled smoke test against `mmg-concierge` and a limited release cohort.
- Cloud test records can coexist with real records and must be unmistakably labelled, access-controlled, and removable by scoped identifiers.
- A configuration error has a larger blast radius. Deny-by-default Rules, App Check, server-owned transitions, idempotency, audit logs, backups, budget alerts, and fail-closed feature flags therefore remain mandatory.
- Historical sequence documents may retain the word “staging” as a record of their original gate. Current architecture, plans, status documents, and agent handoffs must use the single-project controlled-release model.
- This ADR changes environment topology only. It does not authorize reprovisioning Firebase, altering deployed Functions, changing media paths, deleting data, or weakening any security invariant.
