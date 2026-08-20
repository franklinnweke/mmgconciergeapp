# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MMG Concierge — an npm-workspaces monorepo for a Firebase-backed marketplace for chauffeured luxury car rentals in Lagos. React Native (Expo) renter/owner app, Next.js staff admin portal, Firebase Functions v2 backend, shared contracts/domain packages.

## Commands

```bash
npm install
npm run check              # full gate: test + typecheck + lint + functions build + admin checks
```

Root `npm test` is a single `vitest run` with **no config file** — it collects every `*.test.ts` in the repo (mobile, admin, functions, contracts, domain, firebase rules).

```bash
npx vitest run apps/functions/src/owner/submit-owner-verification-service.test.ts   # one file
npx vitest run -t "rejects a stale resubmitted replacement candidate"               # one test by name
npx vitest run apps/functions/src/owner                                            # one directory
```

Emulator-dependent suites (`firebase/*.rules.test.ts`, `*.emulator.test.ts`) self-skip via
`const describeWithEmulator = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip`.
A green `npm test` therefore does **not** mean rules were verified — run them explicitly (needs Java 21+):

```bash
npm run test:rules              # firestore.rules.test.ts under the emulator
npm run test:storage-rules      # storage.rules.test.ts (storage + firestore emulators)
npm run test:functions:emulator # functions suites with Firestore attached
```

Per-workspace: `npm run admin:typecheck | admin:lint | admin:test | functions:typecheck | functions:build | typecheck | lint`.
`functions:build` runs `tsc --noEmit` then bundles with esbuild to `lib/index.js` (ESM, node22, firebase-admin/functions external).

Run apps: `npm run admin` (live Firebase) · `npm run admin:fixtures` (fixture data) · `npm run mobile:ios | mobile:android | mobile:web`.

Grant staff claims (from `apps/functions`) — dry-run by default, `--confirm` to write:

```bash
npx tsx scripts/set-admin-claims.ts <email-or-uid> <role> [set|remove] [--confirm]
```

## Layout

| Path | Role |
|---|---|
| `packages/contracts` | Zod schemas, canonical error codes, version constants. Consumed by all three apps. |
| `packages/domain` | Pure functions: money, dates, state machines, PII masking. No I/O, no Firebase imports. |
| `packages/brand` | Design tokens (mobile only). |
| `apps/functions` | Callables + scheduled jobs, region `africa-south1`, Node 22, App Check enforced. |
| `apps/admin` | Next.js App Router staff desk (`/owners` queue, `/owners/[ownerId]` inspector). |
| `apps/mobile` | Expo Router app; route groups `src/app/(renter)` and `src/app/(owner)`. |
| `firebase/` | `firestore.rules`, `storage.rules`, indexes, and their emulator test suites. |
| `docs/adr/` | Accepted decisions — read before changing money, dates, roles, uploads, payments, or notifications. |

## The command pipeline

Every mutation follows the same shape. `apps/functions/src/index.ts` is a **thin wrapper only** — it applies the auth guard, logs, and maps errors. All logic lives in `<domain>/<command>-service.ts`.

A service takes `(untrustedCommand: unknown, authContext, dependencies)` and:

1. Auth guard from `callable-auth.ts` (e.g. `requireVerifiedEmailOwnerAuth`, `requireVerificationAdmin`).
2. `schema.safeParse(untrustedCommand)` — failure is always `CommandError('INVALID_ARGUMENT', ...)`, never a Zod message.
3. `repository.runTransaction(...)`, and inside it: idempotency replay → entity/state guards from `@mmg/domain` → writes.
4. Writes always include an audit event and `saveIdempotency` alongside the domain records.

**Errors:** throw `CommandError(code, message, { reason })`. `index.ts` maps the code through `httpsCodeByDomainCode` into an `HttpsError`. Any new code needs an entry there, and any `reason` must exist in `commandSafeReasonSchema` — clients only ever see canonical codes plus whitelisted reasons.

**Idempotency:** doc id is `sha256({actorId, commandName, idempotencyKey})`; a replay with a different `requestHash` is `IDEMPOTENCY_CONFLICT`, an identical one returns the stored result.

**Injection:** services receive `{ repository, storageGateway?, now?, createRequestId? }`. That is why the service tests are fast unit tests with no emulator — keep new services injectable the same way.

**The admin portal runs these services in-process.** `apps/admin/tsconfig.json` maps `@mmg/functions-owner/*` → `../functions/src/owner/*`, so `review-owner-verification-action.ts` calls `reviewOwnerVerification` directly rather than invoking the callable. Editing an owner service changes both the mobile callable path and the admin desk.

## Security invariants

These are enforced in several places at once; changing one without the others creates a hole.

- **Firestore is deny-all by default.** Only `users/{uid}` (self), `ownerProfiles/{ownerId}` (self `get`; `list` and writes denied), and renter-scoped `bookingIntents`/`bookings` reads are open. `ownerVerifications`, `adminAuditLogs`, `auditEvents`, `notificationOutbox`, `idempotencyKeys`, `systemConfig`, `payments` are `allow read, write: if false` — all mutations go through the Admin SDK. A catch-all `match /{document=**}` denies everything else, so a new collection is invisible until explicitly added to `firestore.rules`.
- **ID uploads are two-gate.** Storage rules do the *first* gate (path shape, owner match, MIME, ≤10 MiB, `metadata.purpose`/`ownerId`, `accountType == 'owner'` via a Firestore lookup); the submit callable does the *authoritative* magic-byte check in `owner/storage-validation.ts`. Rules alone are not sufficient validation. Path is `private/owner-verification/{ownerId}/{uploadId}`; client reads are denied and there are no public download URLs.
- **PII is masked server-side** with `maskEmail` / `maskPhoneE164` from `@mmg/domain` before data crosses into Client Components. Raw `storagePath` never crosses either — the admin gateway mints a ≤15-minute signed GET URL (`mintSignedDocumentUrl`).
- **Admin sessions** use a `__session` cookie (5-day expiry) and require `emailVerified === true` plus a `verification_admin` or `super_admin` custom claim, re-checked against the live user record on every verification so stripped claims take effect immediately. Cookie minting additionally requires `auth_time` within 5 minutes.
- **Fixture mode is double-guarded**: `process.env.MMG_ADMIN_FIXTURES === '1' && process.env.NODE_ENV !== 'production'`, in both `session.ts` and `review-owner-verification-action.ts`. Keep both halves of that condition — fixture mode returns a synthetic `super_admin` session and must never be reachable in production.

## Domain rules

- **Money is integer kobo.** Use `calculateAuthoritativePrice` and `roundBasisPointsHalfUp` (half-up on basis points, computed to avoid precision loss); never `Math.round` a percentage. Pricing is server-authoritative — client-side quotes are labelled `client-preview`.
- **Dates are date-only `YYYY-MM-DD`, half-open `[startDate, endDate)`.** `intervalsOverlap` throws on non-positive intervals. No time components, no DST handling.
- **State machines are const transition maps** in `packages/domain` (`ownerVerificationTransitions`, `intentTransitions`, `paidBookingTransitions`). Gate transitions with `canTransition*` and the intent helpers (`ownerMayMutateProfile`, `ownerMaySubmit`, `requiresReviewReason`, `requiresApprovalChecklist`) rather than inlining status comparisons.
- Approval requires the full 5-point checklist; reject/suspend/revoke require a 10–500 character reason (`validateReviewReason`). Reviews use optimistic concurrency via `expectedVersion`.

## Mobile conventions

- Expo Router file routes in `src/app`; feature logic in `src/features/<feature>/{domain,data,screens,components}` with pure, tested `domain/` modules.
- `*.web.ts(x)` siblings exist so browser previews never touch native Firebase — they supply deterministic preview data or explicitly-unavailable adapters. Adding a native data module usually means adding its `.web` counterpart too.
- **Expo Go is not supported** (React Native Firebase needs native code). Use an EAS or local development build.

## Deliberately not live

Paystack (payments, escrow, payouts, refunds), MFA, authoritative date-aware discovery/availability calendar, owner booking acceptance, completed account erasure, and production-verified Phone Auth SMS delivery. Vehicle inventory and moderation foundations exist, but their remaining gaps are tracked in `docs/reviews/2026-08-20_APPLICATION_DEEP_REVIEW.md`.

Unimplemented paths must **fail honestly**. Existing adapters and copy never claim a charge, a sent message, or a state change that did not happen — tests assert this directly (e.g. `renter-trip-action-gateway.test.ts` → "never fakes payment, support, or cancellation success"). Preserve that behaviour rather than stubbing a success response.

## Next.js in `apps/admin`

`apps/admin/CLAUDE.md` and `AGENTS.md` are generated by `next dev` — leave them in place and commit them with your work if they reappear. This is Next.js 16.3; consult `node_modules/next/dist/docs/` (hoisted to the repo root, not under `apps/admin`) before writing Next-specific code, since the App Router APIs have changed.
