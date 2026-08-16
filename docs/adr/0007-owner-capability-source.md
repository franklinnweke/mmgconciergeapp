# ADR 0007: Owner capability derives from Firestore, not custom claims

- Status: Accepted
- Date: 2026-08-16

## Context

`reviewOwnerVerification` approves, rejects, suspends, and revokes owner accounts. The architecture handoff §8.2 says the command updates "claims/projection," which reads as though an approval should also write an owner custom claim via `setCustomUserClaims`.

It does not, and the implementation is correct. Three constraints force this:

- **Auth writes cannot join a Firestore transaction.** The review command writes the verification record, the owner profile projection, an audit event, and the idempotency record atomically inside `repository.runTransaction`. `setCustomUserClaims` is a separate Auth API call. Adding it inside the transaction body would make it run on every retry; adding it after the commit creates a window where the record says approved and the token does not — or, on failure, permanently.
- **Claims are cached in the client's ID token for up to an hour.** A revoked owner would keep a valid owner claim until the token refreshed. Suspension and revocation are exactly the cases that must take effect immediately.
- **Every owner-capability check already runs server-side against the projection.** `createVehicleDraft` reads `transaction.getOwnerProfile(actorUid)` and gates on `ownerMayCreateVehicle(profile.verificationStatus)` inside the same transaction as the write it protects. The callable guards in `vehicle/callable-auth.ts` deliberately check only authentication, email verification, and *staff* claims — capability is the service's job, because only the service has the transaction. There is no client-trusted path that an owner claim would protect.

## Decision

- Owner capability is derived from `ownerProfiles/{ownerId}.verificationStatus`, read server-side, inside the transaction that depends on it. No owner custom claim exists.
- `setCustomUserClaims` is reserved for **staff roles** (`verification_admin`, `vehicle_admin`, `super_admin`, …), which are granted out of band by `scripts/set-admin-claims.ts` and are not written by any callable.
- Staff claim changes must be followed by token revocation so a stripped role takes effect immediately. The admin session additionally re-reads the live user record on every verification, so a stripped claim fails closed even before the token expires.
- "Projection" in architecture §8.2 means the `ownerProfiles` document. Read it that way.

## Consequences

- Suspension and revocation are effective on the next command, with no token-refresh delay.
- Owner capability cannot be checked client-side from the ID token. Mobile screens must treat their local view of verification status as a hint and let the callable be the authority — which is what the honesty rule already requires.
- Every new owner-gated command must read the profile inside its transaction. A command that trusts `authContext` alone for owner capability is a bug, not a shortcut.
- Firestore rules keep `ownerProfiles` at self-`get` only, with `list` and all writes denied, so the projection cannot be read across owners or altered from a client.
