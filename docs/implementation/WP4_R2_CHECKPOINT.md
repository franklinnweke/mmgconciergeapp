# WP4 R2 Checkpoint

R2 implements trusted booking-payment initialization only. It does not treat a client callback, Paystack initialization response, or renter action as proof of payment.

Implemented boundary:

- verified renter email and Firebase-authenticated phone evidence are required;
- renter profile email/phone must match authenticated identity;
- active booking hold is rechecked before and after Paystack initialization;
- amount and currency come only from the stored authoritative booking intent;
- one deterministic provider-safe payment identity is reserved per renter/intent;
- `bookingIntents` moves from `intent_created` to `checkout_pending` when the payment reservation is created;
- `payments` moves from `initialized` to `pending` only after Paystack returns the matching initialization reference;
- a short initialization lease prevents concurrent callers from creating multiple provider initialization attempts;
- completed checkout initialization is idempotently replayed only while the hold is active;
- `mmg-concierge-dev` payment callable is coded to reject live Paystack credentials before any provider request;
- webhook verification and `paid_pending_owner` creation remain R3/R4 work.

No Firebase deployment or Paystack network integration is authorized by this checkpoint alone.
