# ADR 0006: Notification delivery via outbox pattern

- Status: Accepted
- Date: 2026-08-16

## Context

Domain events must be delivered as push notifications (FCM), but notification delivery must not risk the business transaction or add latency to command execution.

## Decision

- Every state-changing command writes a durable `notificationOutbox/{eventId}` record in the same Firestore transaction as the state change.
- A background worker (scheduled function or queue trigger) reads the outbox, delivers FCM, and records delivery status.
- Outbox records use `status: 'unavailable'` when FCM is not yet connected (current state for Sequences 1-3).
- Duplicate outbox processing must send at most once logically (idempotency by event ID).
- Invalid device tokens are cleaned up; transient failures are retried with backoff.

## Consequences

- Commands never block on FCM delivery.
- Notification preferences are stored per-device-token for opt-out support.
- Deep links in notifications route to the relevant booking/vehicle/trip screen.