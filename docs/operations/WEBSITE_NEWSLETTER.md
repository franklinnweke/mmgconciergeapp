# Website newsletter — subscriber collection

Scope: collect emails only. No emails are sent and no provider account is needed. The website footer records a required, unchecked opt-in. The existing admin provides `/web/newsletter`: 50-record pages, exact-email search, full-list CSV export (up to 10,000; larger lists fail explicitly), consent details and confirmed removal. A dedicated `web.subscribers` capability is granted only to `super_admin`. Existing vehicle admins do not gain subscriber access.

The list lives in the existing admin Firebase project, in the server-only `websiteNewsletterSubscribers` collection. App accounts and vehicle collections are unchanged. Firestore's existing default-deny rules prevent client reads/writes, including client tokens with staff claims. Normalised emails are deduplicated atomically; repeats preserve the original timestamp and consent wording. Entries explicitly record `emailVerified: false`: this is single opt-in collection, not proof of email ownership. A later sending release must include a real unsubscribe/suppression flow and confirmed sender setup before any campaign is sent. Do not treat this feature as permission to contact app users.

## Deployment order

1. Release the companion admin branch `codex/web-newsletter-subscribers` in `franklinnweke/mmgconciergeapp` through its normal reviewed workflow. Keep its existing Firebase environment; do not switch projects or deploy unrelated Functions.
2. Generate a random server-only secret of at least 32 characters. Set `MMG_NEWSLETTER_SECRET` to the identical value on both admin and website. Never use a `NEXT_PUBLIC_` variable, put the value in a URL, or commit it.
3. Set website `MMG_NEWSLETTER_ENDPOINT=https://mmg-admin.franksandbox.me/api/web/newsletter`. This is a server-to-server endpoint; no CORS expansion is required. Keep the existing catalogue URL unchanged.
4. Verify ingress overwrites `x-forwarded-for` with a trustworthy client address before enabling signups. `MMG_NEWSLETTER_IP_HEADER` may select a different trusted header. The public route trusts the first value of this header; do not allow clients to spoof it. Without a header, all unknown clients share one bucket. Production origins are limited to `https://mmgconcierge.com` and `https://www.mmgconcierge.com`; unrelated previews cannot subscribe.
5. Enable Firestore TTL for the `expiresAt` field in collection group `websiteNewsletterRateLimits` in that same existing project. This expires coded anti-abuse records after two hours (physical deletion is asynchronous). Do not deploy subscriber data until this retention configuration is active. No IP address is stored: identifiers are HMACs using the server secret. Limits: 10 attempts per network per hour; 1,000 total attempts per hour, stored transactionally across replicas. This is basic abuse protection, not bot verification.
6. Deploy website. Missing configuration or a failed backend returns a truthful error, never a success. No automated deployment or real subscriber write has been performed by this implementation task.
7. Verify one explicitly authorised test signup from the real website, see its consent in `/web/newsletter`, export, and remove it. Anonymous gateway requests must return 401; subscriber listing without a session must fail. Export files contain email addresses; keep them private.

Removal deletes the signup and records a hashed subscriber reference in the existing admin audit. A removed visitor can opt in again. The public privacy note points to concierge contact for removal requests. No campaign suppression list is implemented in this collection-only release.

## Local preview

Admin in a separate checkout:

```
MMG_ADMIN_FIXTURES=1 MMG_NEWSLETTER_SECRET=local-newsletter-preview-secret-32-characters npm run dev --workspace @mmg/admin -- --hostname 127.0.0.1 --port 3100
```

Website:

```
MMG_NEWSLETTER_ENDPOINT=http://127.0.0.1:3100/api/web/newsletter MMG_NEWSLETTER_SECRET=local-newsletter-preview-secret-32-characters npm run dev -- --hostname 127.0.0.1 --port 3002
```

`http://127.0.0.1:3002/#newsletter` and `http://127.0.0.1:3100/web/newsletter`. Fixture subscribers are process-memory only and reset when the admin restarts; production always uses Firestore. All automated writes target fixtures or a loopback Firestore emulator.
