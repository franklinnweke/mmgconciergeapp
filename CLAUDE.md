# CLAUDE.md

This file contains Claude/Codex-style repository guidance only. **Do not use it as the project-status source of truth.**

Before substantial work:

1. Read root `AGENTS.md` for current product rules, release state, deployment boundaries, validated build checkpoint, and agent ownership.
2. Read GitHub Issue #35 (`MMG agent coordination and current handoff`) for live cross-agent handoffs.
3. Fetch `main` and report the exact base SHA before changing code.

If this file conflicts with `AGENTS.md`, `AGENTS.md` wins.

## Repository

MMG Concierge is an npm-workspaces monorepo for a Firebase-backed Lagos marketplace for chauffeured luxury-car rentals.

- Mobile: React Native + Expo Router + React Native Firebase.
- Admin: Next.js App Router.
- Backend: Firebase Functions v2, Firestore, Auth, Storage, App Check.
- Shared packages: contracts/domain/brand and related utilities.

Production is not a development/test target. Never deploy to `mmg-concierge` or use live Paystack unless Franklin explicitly authorizes that production action.

## Core commands

```bash
npm install
npm run check
```

Root `npm test` is a Vitest run that can collect tests across workspaces. Emulator-dependent tests may skip unless the emulator environment is present, so a green root test alone does not prove Rules or emulator integration.

Run emulator/Rules gates explicitly when relevant:

```bash
npm run test:rules
npm run test:storage-rules
npm run test:functions:emulator
```

Useful workspace gates:

```bash
npm run typecheck
npm run lint
npm run functions:typecheck
npm run functions:build
npm run functions:test
npm run admin:typecheck
npm run admin:lint
npm run admin:test
git diff --check
```

Firebase Emulator Suite requires Java 21+.

## Layout

| Path | Role |
|---|---|
| `packages/contracts` | Zod schemas, canonical error codes, shared contracts. |
| `packages/domain` | Pure money/date/state/PII helpers with no I/O. |
| `packages/brand` | Mobile design tokens. |
| `apps/functions` | Firebase callables, payment/booking/owner/vehicle services, scheduled jobs. |
| `apps/admin` | Next.js staff operations desk. |
| `apps/mobile` | Expo Router renter/owner mobile app. |
| `firebase/` | Firestore/Storage Rules, indexes, emulator tests. |
| `docs/adr/` | Accepted architecture decisions. Read before changing money, dates, roles, uploads, payments, or notifications. |

## Service pattern

Keep callable wrappers thin. Business logic belongs in injectable domain services/repositories rather than `index.ts`.

Typical mutation flow:

1. authenticate/authorize;
2. parse untrusted input with the canonical schema;
3. run state/invariant checks;
4. perform transactional writes;
5. save audit/idempotency records where required;
6. map domain errors to safe callable errors.

Preserve the established idempotency, payment-verification, availability-sentinel, and state-machine boundaries documented in `AGENTS.md` and ADRs.

## Security invariants

- Firestore/Storage access is deny-by-default and server-authoritative for critical state.
- Never expose secrets, raw provider payloads, unnecessary PII, exact vehicle coordinates, or bank data in logs/client payloads.
- Owner identity uploads remain private and require trusted server-side validation.
- Admin authorization is based on approved staff claims/session checks, not hidden URLs.
- Fixture/test modes must never become reachable in production.
- App Check must fail closed outside the explicitly supported development bypass.

## Mobile conventions

- Expo Router routes live under `apps/mobile/src/app`.
- Feature logic belongs under `src/features/<feature>/...`.
- Native Firebase modules often require `.web` siblings for browser-safe previews.
- Expo Go is not supported for native Firebase workflows.
- **Every EAS/TestFlight build must originate from `main`. Never build EAS from a feature branch.**
- iOS Apple sign-in uses the native Expo/Apple control; retain Apple-approved behavior and branding.

## Current product capability

Do not maintain a duplicate live capability matrix here. The repository has evolved quickly and stale capability claims are dangerous.

For current answers about Paystack, booking/availability, Trips, owner response, Admin intervention, OTP, Android validation, Build 29, or deployment status, read `AGENTS.md` and Issue #35 and verify the relevant code/CI/cloud evidence.

Unimplemented or unverified paths must fail honestly. Never stub a success for payment, support, cancellation, OTP, deployment, or provider delivery merely to make a demo pass.

## Agent coordination

Substantial local work must post a handoff to Issue #35 using the format defined in `AGENTS.md`.

Important rules:

- local/unpushed work is not integrated work;
- report exact base SHA and branch;
- report actual validation commands/results;
- report exact deployment environment/resources or `none`;
- keep production untouched unless explicitly authorized;
- avoid overlapping another agent's active branch/scope without coordination.

## Admin / Next.js

The Admin uses Next.js App Router. Preserve existing staff authorization and server-side PII masking when changing presentation. Do not patch application code directly on the VPS; product changes belong in Git branches/PRs.

## Documentation policy

- `AGENTS.md` = durable source of truth.
- Issue #35 = live operational handoffs.
- ADRs = accepted architecture decisions.
- PRs/CI/Git history = implementation evidence.

Do not create new heartbeat/status files for routine agent activity.
