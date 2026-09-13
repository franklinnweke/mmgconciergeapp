# Logout transition invariant

The native auth provider must not publish a temporary signed-out identity while Firebase sign-out is still in flight.

During `signingOut === true`, the previously authenticated `user` and `profile` remain published until the native sign-out promise settles. Authenticated layouts already replace their route trees with the signing-out loading surface during this interval.

Why: clearing `user` synchronously creates a half-signed-out render window in which mounted authenticated screens and hooks can observe missing identity before navigation has completed. Physical iOS Build 33 surfaced that race through the root React recovery boundary.

Regression coverage lives in `auth-context.test.ts`.
