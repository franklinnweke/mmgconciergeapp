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

Validation checkpoint:

- R2 unit and isolated Firestore payment-initialization tests passed at `819c1f7`;
- the aggregate Functions Firestore-emulator gate exposed cross-file interference because multiple emulator suites shared the same project/collections while Vitest ran files concurrently;
- emulator-backed Functions tests must therefore run with file parallelism disabled;
- `apps/functions` provides `test:emulator` using `vitest run src --no-file-parallelism`, and root `npm run test:functions:emulator` invokes that serialized runner inside the Firestore emulator;
- Firebase Emulator Suite currently requires Java 21+; use an installed Java 21+ runtime when the machine default is older.

No Firebase deployment or Paystack network integration is authorized by this checkpoint alone.
