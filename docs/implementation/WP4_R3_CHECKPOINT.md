# WP4 R3 Checkpoint

R3 implements signed Paystack event ingestion and independent payment verification. It still does **not** deliver booking value.

Implemented boundary:

- public `paystackWebhook` HTTP Function accepts POST only;
- application body limit is 256 KiB;
- `x-paystack-signature` is checked against the exact raw request bytes using HMAC SHA-512 before JSON parsing;
- development runtime accepts only Paystack test credentials;
- signed unrelated Paystack event types are acknowledged and ignored;
- valid `charge.success` events persist only normalized provider facts plus a SHA-256 body digest, never the full provider payload or signature;
- stable semantic event IDs deduplicate webhook retries in `paymentEvents`;
- `paymentEvents` is explicitly denied to every Firestore client, including staff claims;
- `processPaystackPaymentEvent` is an asynchronous retryable Firestore trigger for webhook-created events;
- each event independently calls Paystack Verify Transaction using the server-stored reference;
- trusted comparison checks reference, configured environment, provider status, NGN currency, and exact authoritative kobo amount;
- verification outcome is persisted as `verified_success`, `not_succeeded`, or `rejected`;
- the payment record remains `pending`; R3 only stores last-verification metadata;
- `reconcilePayment` is App Check protected and limited to the renter who owns the deterministic intent payment; the client cannot submit a reference, amount, or currency;
- duplicate terminal event execution is a no-op;
- transient processor failures may retry, while terminal mismatch outcomes complete without retry loops.

R4 is the first slice allowed to consume `verified_success` and atomically transition payment/intent/booking/block state. Until then, no R3 path may create `paid_pending_owner`, mark a payment `succeeded`, notify an owner, or release financial value.

No Firebase deployment or Paystack secret configuration is authorized by this checkpoint alone. Production `mmg-concierge` remains out of scope.
