# ADR 0004: Upload format restrictions

- Status: Accepted
- Date: 2026-08-16

## Context

Security and operational requirements mandate strict validation of uploaded files. The platform handles government IDs, vehicle images, documents, and message attachments.

## Decision

- Accepted image MIME types: `image/jpeg`, `image/png`, `image/webp`.
- Accepted document MIME: `application/pdf`.
- Max file size: 10 MiB (10,485,760 bytes).
- Min vehicle image dimensions: 1280×720; max edge: 8000×8000.
- Storage Rules enforce MIME/size as a first gate; callable services perform authoritative magic-byte validation.
- HEIC is not currently accepted; introducing it requires coordinated picker, upload, magic-byte, processing, Rules, contracts, and test changes.
- Vehicle images are EXIF/GPS-stripped before public promotion.
- Government IDs and private documents never receive public download URLs; admin access uses ≤15-minute signed GET URLs.

## Consequences

- Two-layer validation: Storage Rules (fast, coarse) + Functions magic-byte sniffing (authoritative).
- Upload paths use owner-scoped prefixes (`private/vehicle-uploads/{ownerId}/{vehicleId}/{uploadId}`).
- Abandoned uploads are cleaned up by scheduled jobs.