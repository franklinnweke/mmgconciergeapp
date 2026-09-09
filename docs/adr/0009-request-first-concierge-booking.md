# ADR-0009: Request-first concierge booking

Status: Accepted for Build 30 implementation
Date: 2026-09-09

## Context

MMG Concierge should operate like a high-touch private concierge rather than an instant-booking marketplace. Build 29 created an inventory hold before payment and required owner response only after trusted payment. Product review changed the commercial sequence: a renter should first express interest, MMG and/or the owner should confirm that the request can be serviced, MMG should contact the renter, and only then should MMG deliberately open a short payment window.

Physical-device acceptance also showed that renter SMS verification added unnecessary checkout friction. A renter still needs a verified email identity and ordinary contact information, but Firebase Phone Auth is not part of renter payment eligibility. Owner onboarding remains a separate, stronger verification boundary.

## Decision

The canonical request-first sequence is:

`soft request -> approval -> MMG contact/readiness -> staff opens payment window -> 30-minute hold -> Paystack -> trusted verification -> confirmed`

### Soft request

A new `rentalRequests/{requestId}` record represents interest only. Creating it does not create `bookingIntents`, `bookingBlocks`, or mutate the vehicle availability sentinel. Multiple overlapping soft requests may coexist.

The renter supplies a normal operational contact phone and broad Lagos service-area label. No renter SMS OTP is required.

### Approval

The assigned owner, or authorized MMG `support` / `super_admin`, may approve or decline a request. Approval remains soft: it does not lock inventory and does not start the payment countdown.

MMG uses this approved state to complete human concierge coordination with the renter before payment is made available.

### Manual concierge readiness

For the MVP, the human phone step is part of the operating model, not optional presentation copy.

Authorized MMG staff must call the renter before pressing **Open payment window**. If the renter cannot be reached or is not ready to pay, the request remains `approved` and inventory remains unlocked. The detailed operating procedure is documented in `docs/operations/REQUEST_FIRST_CONCIERGE_RUNBOOK.md`.

FCM, chat, and automated call orchestration are explicitly deferred. The manual phone workflow is sufficient for the concierge MVP.

### Payment-window activation

Only authorized MMG `support` / `super_admin` staff may open the payment window.

Opening the window is the authoritative availability transaction. The server must:

1. re-read the vehicle and trusted booking configuration;
2. recalculate authoritative pricing;
3. require a valid availability sentinel;
4. inspect overlapping active booking blocks;
5. atomically create the booking intent and booking block;
6. increment the availability sentinel;
7. set the request to `ready_for_payment` with a customer-visible expiry exactly 30 minutes after activation.

If any availability invariant is missing or invalid, activation fails closed and the request remains approved.

### Payment in flight

The customer receives 30 minutes to begin payment. Once Paystack initialization begins, the technical hold may be extended internally for payment reconciliation so the expiry worker cannot release inventory underneath a real charge. The internal protection period is not additional customer payment time and must not be surfaced as such.

The ordinary expiry worker releases only untouched `intent_created` payment windows. `checkout_pending` is payment-in-flight and is resolved by trusted payment reconciliation rather than ordinary hold expiry.

### Trusted payment outcome

For a request-first intent, successful Paystack verification creates a confirmed booking directly because service approval happened before payment.

Historical pay-first intents remain compatible with `paid_pending_owner` and the existing owner-response workflow.

If a verified successful payment cannot safely receive the requested dates, the system records the successful charge, moves the intent to `paid_conflict`, moves the request to `needs_attention`, and opens concierge intervention. It never manufactures a confirmed booking.

## Privacy model

`rentalRequests` contains server operational request state. Clients cannot read or write it directly.

Renter mobile uses the server-redacted `listRenterRentalRequests` callable. Owner mobile uses the server-redacted `listOwnerRentalRequests` callable. Both projections are strict allowlists rather than raw Firestore documents.

The renter projection may contain vehicle, dates, broad service area, request state/version, price/status information, payment-window intent/expiry, and resulting booking ID when needed by the renter experience. It must not contain owner ID, staff IDs, decline/internal notes, contact PII, or other server-only lifecycle metadata.

The owner projection may contain vehicle, dates, broad service area, request state/version, and required price/status information, but never renter ID, owner ID, phone, email, precise address, profile information, staff IDs, or internal concierge notes.

`rentalRequestContacts/{requestId}` contains the private renter contact phone used by MMG operations and is denied to all mobile clients. Authorized Admin server code may read it through the Admin SDK.

Active rental requests block account deletion while operational resolution is required. Once deletion is permitted, private rental-request contact records for that renter are removed and the purge is audited.

## Admin authority

The existing role set remains unchanged. No `booking_admin` role is introduced.

A bounded `bookings.manage_requests` capability is granted to `support` and `super_admin`. It allows only:

- approving a soft request;
- declining a soft request;
- opening the 30-minute payment window.

It does not grant refunds, payouts, reassignment, or arbitrary paid-booking mutation.

## Renter-facing vocabulary

- Requested: Request received. MMG is confirming the request. No payment has been taken and the dates are not locked.
- Approved: The request is approved. MMG will contact the renter before payment is opened.
- Ready for payment: The vehicle is available for the request. Complete payment within 30 minutes.
- Confirmed: Payment was verified and the booking is secured.
- Needs attention: MMG Concierge is resolving the booking.
- Declined / payment window expired: terminal truthful state with no invented charge or refund.

## Consequences

The existing pricing, availability sentinel, booking block, Paystack verification, idempotency, audit, and intervention infrastructure remains reusable.

The key architectural change is that inventory locking moves out of initial Booking Review and out of approval. Inventory is locked only when MMG explicitly activates the payment window after concierge readiness.

This creates a deliberate human-operations dependency before payment. That is intentional for the first concierge MVP. Automation may be revisited later only if operating evidence shows the manual step is the bottleneck.
