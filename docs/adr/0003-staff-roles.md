# ADR 0003: Staff role claims

- Status: Accepted
- Date: 2026-08-16

## Context

The architecture defines six staff roles. We must decide how they are modeled in Firebase Auth and how they gate access.

## Decision

- Staff roles are Firebase Auth custom claims: `support`, `vehicle_admin`, `verification_admin`, `finance_admin`, `privacy_admin`, `super_admin`.
- `super_admin` has all privileges; other roles are scoped.
- Claims are set only via the operator CLI (`scripts/set-admin-claims.ts`), never through a client callable.
- `requireLiveStaffSession` checks current claims via `getUser(uid)` on every privileged request (not just at cookie creation).
- Claims are revoked by removing the claim and calling `auth.revokeRefreshTokens(uid)`.
- Custom claims are never checked in Edge middleware; Admin SDK is Node-only.

## Consequences

- No `admin: true` or generic admin claim — each role gates specific modules.
- Session cookies have a 5-day expiry; the 5-minute `auth_time` freshness check prevents stale-token replay.
- Claim removal kills sessions through refresh-token revocation plus re-verification on each request.