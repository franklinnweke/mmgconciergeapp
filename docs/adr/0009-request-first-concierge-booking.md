# ADR-0009: Request-first concierge booking

Status: Accepted for Build 30 implementation
Date: 2026-09-09

## Context

MMG Concierge should feel like an efficient private concierge rather than an instant-booking marketplace. The Build 29 sequence acquired a short inventory hold before payment and asked the owner to respond only after trusted payment. Physical-device acceptance showed that renter SMS verification added unnecessary friction, and product review clarified that the human approval moment should happen before payment rather than after it.

## Decision

The canonical new-renter sequence is:

`request -> owner/MMG approval -> 30-minute payment hold -> Paystack -> confirmed`

A rental request is soft interest and does not block inventory. Multiple overlapping requests may exist. Owner approval or authorized MMG operations approval must atomically check availability and create the authoritative booking intent and block. The payment window is 30 minutes.

Renter contact phone is profile/coordination information and does not require SMS verification. Owner onboarding remains a stronger identity boundary and may continue to require verified phone, government ID and staff review.

Owners do not receive renter phone or email before payment. `rentalRequests` contains the safe operational projection; `rentalRequestContacts` is server-only.

New request-approved payments transition directly to a confirmed booking after trusted Paystack verification because vehicle approval already happened. Historical pay-first intents remain compatible with `paid_pending_owner` and the old owner-response state machine.

If an approved payment window expires, inventory is released and the request becomes `payment_window_expired`. There is no automatic re-hold. A late verified payment that cannot be safely delivered enters `needs_attention` / `paid_conflict` for concierge intervention.

## Authorized approvers

- vehicle owner assigned to the request;
- MMG `support` or `super_admin` operations staff.

All decisions are server-authoritative and audited.

## Renter-facing vocabulary

- Requested: We're confirming your request.
- Ready for payment: Your vehicle is available. Complete payment within 30 minutes to secure your booking.
- Confirmed: Payment received. Your booking is secured.
- Needs attention: MMG Concierge is handling your booking.

Internal states may remain more detailed than customer-facing copy.

## Consequences

The existing availability sentinel, booking block, Paystack verification, idempotency, audit and intervention infrastructure is reused. The inventory hold moves from pre-request checkout to the approval transaction. Direct renter contact with owners remains deferred until MMG determines it is operationally appropriate after payment.
