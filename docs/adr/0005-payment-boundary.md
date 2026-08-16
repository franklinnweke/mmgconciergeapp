# ADR 0005: Payment boundary and Paystack abstraction

- Status: Accepted
- Date: 2026-08-16

## Context

Paystack is the sole MVP payment processor, but is not yet integrated. All payment-dependent features (paid bookings, wallets, refunds, chat) must compile and be testable against a narrow boundary without real payment infrastructure.

## Decision

- A `PaymentGateway` interface isolates Paystack-specific behavior (initialization, verification, refunds).
- A test-only `FakePaymentGateway` adapter emits synthetic `payment.succeeded` events for emulator and integration testing.
- No production route may invoke the fake adapter — the boundary must fail closed.
- All payment state transitions are gated on a trusted verified-payment event from the gateway.
- Client callbacks and deep links are informational only; `/reconcilePayment` is the sole path to `paid`.
- No UI or API claims a charge, paid booking, refund, wallet earning, or confirmed ride without a verified-payment event.

## Consequences

- The codebase is "Paystack-ready" — all contracts, state machines, and admin surfaces exist — but nothing processes real payments until Paystack is integrated.
- Emulator tests can exercise the full booking lifecycle with fake payment events.
- Production builds expose explicit "payment unavailable" copy.