# WP4 Paystack transaction reference constraint

Paystack transaction references used by MMG Concierge must contain only ASCII alphanumeric characters plus `-`, `.`, and `=`.

Canonical examples:

- valid: `mmg-intent-123`
- valid: `MMG.intent=123`
- invalid: `mmg_intent_123`
- invalid: `mmg/intent/123`

The shared `paymentReferenceSchema` in `@mmg/contracts/payment` is authoritative for both provider adapter inputs/results and the R2 server-side reference generator. Do not create a second reference validator or sanitize an invalid reference after generation; generate a valid reference once, persist exactly that value, and require Paystack to echo the same value.

This restriction is based on Paystack's Transaction API reference contract and is intentionally narrower than generic MMG bounded IDs.
