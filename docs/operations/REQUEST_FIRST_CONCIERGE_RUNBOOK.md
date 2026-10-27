# MMG Request-First Concierge Runbook

Status: MVP operating procedure
Date: 2026-09-09

This runbook defines the human step between request approval and payment-window activation for the request-first concierge MVP.

## Core rule

Do not press **Open payment window** merely because a rental request is approved.

The intended sequence is:

`request -> approval -> MMG calls renter -> renter is ready -> MMG opens 30-minute payment window -> Paystack -> trusted confirmation`

Approval is still soft. Inventory is not locked and the 30-minute payment clock has not started.

## Staff procedure

1. Open the approved rental request in the Admin booking concierge desk.
2. Use the private concierge contact phone shown in the Admin-only request queue.
3. Call the renter before opening payment.
4. Expand **Pickup details**. Confirm the requested vehicle, rental dates, exact meeting point and entrance note. Agree the pickup time on the start date in **Africa/Lagos (WAT)** and use **Confirm pickup time**. This is operational timing only; it does not change rental pricing or reserve inventory. If a historical record says **Pickup not recorded**, do not use the vehicle's area centre as a substitute: obtain and verify the meeting point with the renter before dispatch.
5. If the renter cannot be reached or is not ready to pay, leave the request in `approved`. Do not start the payment clock.
6. Only when the renter is ready, press **Open payment window**.
7. Tell the renter that the payment window is 30 minutes. Do not promise extra customer time based on the system's internal payment-in-flight protection.
8. The renter completes Paystack payment. Browser return is not payment truth; trusted server verification controls confirmation.

## Failure handling

- If opening the payment window fails because inventory is no longer available, do not promise the vehicle. Keep the outcome truthful and resolve with the renter manually.
- If the 30-minute window expires untouched, inventory is released and the request becomes `payment_window_expired`.
- If payment has already entered `checkout_pending`, the ordinary expiry worker must not release the inventory underneath the payment.
- If a verified successful charge cannot safely secure the requested dates, the request/booking enters concierge intervention (`needs_attention` / `paid_conflict`). Do not manufacture confirmation or refund language.

## Privacy

The renter's contact phone is concierge-only operational PII. It is visible to authorized Admin server workflows and is not exposed through owner or renter request projections. Exact pickup details are available only to the requesting renter and authorized dispatch staff, never through the owner projection. Open directions only when needed for this booking; do not copy private coordinates into general notes or logs. A pickup-time update is audited; confirm any correction with the renter before saving.

## Deferred automation

FCM, chat, automated call orchestration, and broad notification workflows are not required for this MVP procedure. They should be added only if operating evidence shows that the manual phone step is the bottleneck.
