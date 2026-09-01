# WP4 R4 Checkpoint: Atomic Verified-Payment Value Delivery

**Branch:** `codex/wp4-paystack-booking-reconciliation`  
**R4 base:** validated R3 branch state at `1c06896`  
**Preserved R4 commits:** `d86d309`, `91ac885`, `12f1290`, `39f4330`  
**Status:** implementation complete; shell/emulator validation required before R4 is considered green  
**Deployment status:** undeployed  

## 1. R4 boundary

R4 is the first boundary allowed to convert durable R3 `verified_success` evidence into booking value.

The trusted path is:

```text
verified_success payment event
  -> trusted server orchestration
  -> Firestore value-delivery transaction
  -> payment succeeded
  -> exact interval secured as paid
  -> booking paid_pending_owner
  -> one owner notification outbox record
```

If the checkout hold has expired, R4 re-reads the current availability sentinel and overlapping booking blocks in the same transaction. If the dates are still free, it reacquires the original exact interval. If another active blocking interval owns the dates, the real provider-confirmed payment remains `succeeded`, the intent becomes `paid_conflict`, and one urgent intervention case is created.

R4 never creates `confirmed`, never treats a client callback/deep link as payment truth, never automatically refunds, and never invents cancellation/refund policy.

## 2. Implemented contracts and service boundary

`packages/contracts/src/payment.ts` defines exactly two trusted value-delivery outcomes:

- `paid_pending_owner` with `paymentState: succeeded`, `intentState: paid`, and a booking ID;
- `paid_conflict` with `paymentState: succeeded`, `intentState: paid_conflict`, and a case ID.

The value-delivery service accepts only a persisted `paymentEvents/{eventId}` ID. It does not accept a client/provider amount, reference, currency, date interval, or target booking state.

Transaction IDs are generated before entering Firestore retry scope so retried transactions use stable booking/case/outbox/request identifiers.

## 3. Atomic success transaction

For an eligible verified payment and valid current checkout state, one Firestore transaction:

1. re-reads the durable `verified_success` payment event;
2. re-reads the authoritative payment and booking intent and verifies their bindings;
3. requires the intent's preexisting block, when present, to still be the exact matching `held` block;
4. requires the vehicle availability sentinel to exist and contain a safe nonnegative integer version;
5. reads overlapping blocking intervals for the same vehicle/date range;
6. serializes availability through the sentinel plus block reads;
7. converts or reacquires the exact interval as `paid`;
8. writes the payment as `succeeded`;
9. writes the intent as `paid`;
10. creates one version-1 `paid_pending_owner` booking using the original immutable `priceSnapshot` and renter-safe `vehicleSnapshot`;
11. advances the availability sentinel;
12. creates one audit effect and one owner notification outbox record;
13. records the value-delivery result on the verified payment event.

The resulting booking uses the existing `blockId` convention and is accepted unchanged by the current owner `confirmBooking`/`rejectBooking` foundation.

## 4. Late-payment conflict transaction

When the original hold is no longer active and another active block owns any part of `[startDate, endDate)`, the same transaction:

- keeps the provider-confirmed payment as `succeeded`;
- sets the intent to `paid_conflict`;
- removes only the stale matching held block when it still exists;
- creates no booking;
- creates one urgent `paid_conflict` booking case;
- advances the sentinel for serialization;
- creates one audit effect and one intervention notification outbox record;
- records the conflict outcome on the payment event.

No refund is created or implied by R4.

## 5. Idempotency and retry behavior

R4 is idempotent at the payment/value boundary, not only at one webhook-event identifier.

Coverage includes:

- replaying the same delivered event creates no second booking/outbox/audit effect;
- a second distinct `verified_success` event for the same already-succeeded payment reuses the original value effect;
- a retry after R3 has already durably committed `verified_success` skips another provider verification but can still complete R4;
- renter reconciliation invokes the same R3-to-R4 trusted processor rather than a separate verify-to-paid path;
- post-success Paystack verification can still match the succeeded payment without downgrading the payment state.

## 6. Concurrency and fail-closed behavior

Emulator coverage is expected to prove all of the following:

- two overlapping late verified payments serialize through the availability sentinel so exactly one obtains the dates and the other becomes `paid_conflict`;
- both provider-confirmed payments remain `succeeded`;
- one payment can produce at most one booking, one paid block, one outbox effect and the corresponding audit effect;
- a preexisting intent block in any state other than the exact matching `held` block fails closed;
- a missing availability sentinel fails closed;
- a malformed/non-integer/negative availability version fails closed;
- each failed invariant leaves payment, intent, event, booking/case/outbox/audit state unchanged by the attempted R4 transaction.

A missing sentinel is not treated as version zero in R4. Current checkout-intent creation already establishes the vehicle sentinel, so absence at value delivery is an integrity failure that requires reconciliation rather than a manufactured concurrency baseline.

## 7. Runtime integration

The public Function surface remains stable:

- `initializeBookingPayment`
- `paystackWebhook`
- `processPaystackPaymentEvent`
- `reconcilePayment`

No additional public value-delivery callable is introduced.

`processPaystackPaymentEvent` verifies durable webhook evidence through R3 and then invokes R4. Because the Function is retryable, a retry can re-read an already committed `verified_success` event and finish value delivery without repeating a value effect.

`reconcilePayment` remains App-Check/authenticated and client input remains intent-ID-only. It uses the same trusted processor and can report `paymentState: succeeded` plus the trusted value-delivery outcome only after R4 succeeds.

## 8. Required validation checkpoint

Validate the cleaned R4 publication commit exactly. Do not deploy during this checkpoint.

```bash
git status -sb
git log --oneline --decorate -12

npm run functions:typecheck
npm run functions:build
npm run functions:test
npm run test:functions:emulator
npm test
npm run typecheck
npm run lint
npm run admin:typecheck
npm run admin:lint
npm run admin:test
npm run check
npm run test:rules
npm run test:storage-rules
git diff --check
```

Report exact test counts and any skipped suites.

Specifically confirm:

1. `packages/contracts/src/payment.test.ts` passes.
2. `apps/functions/src/booking/payment-verification-service.test.ts` passes.
3. `apps/functions/src/booking/payment-value-orchestration-service.test.ts` passes.
4. `apps/functions/src/booking/firestore-payment-verification-terminal.emulator.test.ts` passes under the serialized emulator runner.
5. `apps/functions/src/booking/firestore-verified-payment-value-repository.emulator.test.ts` passes.
6. `apps/functions/src/booking/firestore-verified-payment-value-concurrency.emulator.test.ts` passes.
7. Existing owner booking response emulator coverage still passes.
8. Firestore and Storage Rules suites remain green.
9. `git diff --check` is clean.
10. The working tree is clean after validation.

## 9. Operational non-actions

This R4 checkpoint must not:

- configure a Paystack secret;
- call real Paystack;
- deploy Firebase Functions/Rules/indexes;
- access or mutate production `mmg-concierge`;
- create a live payment;
- implement refund settlement, chat, wallet, withdrawal or cancellation economics.

R4 becomes **green** only after the exact cleaned publication commit passes the full validation gate above. R5 may then reconcile the existing owner response/intervention flow against the now-trusted R4 records without changing the locked payment-first architecture.
