# MMG Concierge — Development Sample Fleet Seed

Use this specification only in Firebase development project `mmg-concierge-dev`.

Do not write any of this sample data to production project `mmg-concierge`.

The goal is a convincing client-facing development fleet using real, model-matched vehicle photography while preserving MMG's current trusted discovery contract.

## Non-negotiable discovery conditions

A vehicle appears to renters only when all of the following are true:

- `vehicles/{vehicleId}.moderationStatus == "approved"`
- `vehicles/{vehicleId}.visibility == "active"`
- `vehicles/{vehicleId}.discoverable == true`
- required renter-visible fields are populated
- at least one `vehicles/{vehicleId}/images/{imageId}` record has `status == "approved"`
- that image record has non-null `publicVariantPaths`
- the referenced public Storage object actually exists

Do not invent image URLs or image processing facts. Real images must correspond to the stated make/model/colour. Prefer 3 images per vehicle: exterior hero, interior, and rear/side three-quarter.

Use one existing approved development owner UID for all four demo cars unless a different approved owner is explicitly desired. Resolve that UID first and substitute it for `DEMO_APPROVED_OWNER_UID` below. Do not grant a renter owner approval simply to make the seed work.

Use one ISO timestamp value for `createdAt`, `updatedAt`, and `promotedAt` during the seed run.

## Vehicle 1 — Range Rover Vogue Autobiography

Document: `vehicles/demo-range-rover-vogue`

```json
{
  "vehicleId": "demo-range-rover-vogue",
  "ownerId": "DEMO_APPROVED_OWNER_UID",
  "displayName": "2022 Range Rover Vogue Autobiography",
  "make": "Land Rover",
  "model": "Range Rover Vogue Autobiography",
  "year": 2022,
  "colour": "Santorini Black",
  "category": "executive_suv",
  "seats": 5,
  "transmission": "automatic",
  "fuelType": "petrol",
  "mileageKm": 28400,
  "description": "A composed flagship SUV for executive movement across Lagos, presented with a refined black exterior, quiet cabin and generous rear-seat comfort. Chauffeur and vehicle delivery are included with every MMG booking.",
  "features": ["leather", "panoramic_roof", "apple_carplay", "climate_control", "privacy_glass", "wifi"],
  "ownerDailyRateKobo": 32000000,
  "chauffeurPolicy": "included",
  "deliveryPolicy": "included",
  "areaLabel": "Ikoyi",
  "approxLatitude": 6.4549,
  "approxLongitude": 3.4340,
  "moderationStatus": "approved",
  "visibility": "active",
  "discoverable": true,
  "lastDecisionReason": null,
  "pendingRevisionId": null,
  "imageCount": 3,
  "primaryImagePath": "public/vehicles/demo-range-rover-vogue/approved/front/card",
  "createdAt": "SEED_TIMESTAMP_ISO",
  "updatedAt": "SEED_TIMESTAMP_ISO",
  "version": 1
}
```

Real-image labels:
- `front`: exterior hero, preferably front three-quarter
- `interior`: clean rear/cabin view
- `rear`: rear or side three-quarter

## Vehicle 2 — Mercedes-Benz GLE 450

Document: `vehicles/demo-mercedes-gle450`

```json
{
  "vehicleId": "demo-mercedes-gle450",
  "ownerId": "DEMO_APPROVED_OWNER_UID",
  "displayName": "2023 Mercedes-Benz GLE 450",
  "make": "Mercedes-Benz",
  "model": "GLE 450",
  "year": 2023,
  "colour": "Obsidian Black",
  "category": "executive_suv",
  "seats": 5,
  "transmission": "automatic",
  "fuelType": "petrol",
  "mileageKm": 18700,
  "description": "A polished executive SUV with a modern cabin, strong road presence and comfortable seating for premium airport, business and private movement within Lagos. Chauffeur and delivery are included.",
  "features": ["leather", "panoramic_roof", "apple_carplay", "android_auto", "climate_control", "privacy_glass"],
  "ownerDailyRateKobo": 28000000,
  "chauffeurPolicy": "included",
  "deliveryPolicy": "included",
  "areaLabel": "Victoria Island",
  "approxLatitude": 6.4281,
  "approxLongitude": 3.4219,
  "moderationStatus": "approved",
  "visibility": "active",
  "discoverable": true,
  "lastDecisionReason": null,
  "pendingRevisionId": null,
  "imageCount": 3,
  "primaryImagePath": "public/vehicles/demo-mercedes-gle450/approved/front/card",
  "createdAt": "SEED_TIMESTAMP_ISO",
  "updatedAt": "SEED_TIMESTAMP_ISO",
  "version": 1
}
```

## Vehicle 3 — Lexus LX 570

Document: `vehicles/demo-lexus-lx570`

```json
{
  "vehicleId": "demo-lexus-lx570",
  "ownerId": "DEMO_APPROVED_OWNER_UID",
  "displayName": "2021 Lexus LX 570",
  "make": "Lexus",
  "model": "LX 570",
  "year": 2021,
  "colour": "Sonic Quartz",
  "category": "executive_suv",
  "seats": 7,
  "transmission": "automatic",
  "fuelType": "petrol",
  "mileageKm": 41200,
  "description": "A spacious full-size luxury SUV suited to family, executive and group travel, with three-row flexibility and a calm, premium cabin. Every MMG rental includes a professional chauffeur and delivery.",
  "features": ["leather", "climate_control", "third_row", "privacy_glass"],
  "ownerDailyRateKobo": 26000000,
  "chauffeurPolicy": "included",
  "deliveryPolicy": "included",
  "areaLabel": "Lekki Phase 1",
  "approxLatitude": 6.4478,
  "approxLongitude": 3.4723,
  "moderationStatus": "approved",
  "visibility": "active",
  "discoverable": true,
  "lastDecisionReason": null,
  "pendingRevisionId": null,
  "imageCount": 3,
  "primaryImagePath": "public/vehicles/demo-lexus-lx570/approved/front/card",
  "createdAt": "SEED_TIMESTAMP_ISO",
  "updatedAt": "SEED_TIMESTAMP_ISO",
  "version": 1
}
```

## Vehicle 4 — Mercedes-Benz S 580

Document: `vehicles/demo-mercedes-s580`

```json
{
  "vehicleId": "demo-mercedes-s580",
  "ownerId": "DEMO_APPROVED_OWNER_UID",
  "displayName": "2022 Mercedes-Benz S 580",
  "make": "Mercedes-Benz",
  "model": "S 580",
  "year": 2022,
  "colour": "Obsidian Black",
  "category": "executive_sedan",
  "seats": 5,
  "transmission": "automatic",
  "fuelType": "petrol",
  "mileageKm": 22900,
  "description": "MMG's formal executive sedan option, prioritising rear-seat comfort, quiet movement and discreet presentation for meetings, events and private transfers. Chauffeur and delivery are included.",
  "features": ["leather", "panoramic_roof", "apple_carplay", "climate_control", "privacy_glass", "wifi"],
  "ownerDailyRateKobo": 35000000,
  "chauffeurPolicy": "included",
  "deliveryPolicy": "included",
  "areaLabel": "Ikoyi",
  "approxLatitude": 6.4549,
  "approxLongitude": 3.4340,
  "moderationStatus": "approved",
  "visibility": "active",
  "discoverable": true,
  "lastDecisionReason": null,
  "pendingRevisionId": null,
  "imageCount": 3,
  "primaryImagePath": "public/vehicles/demo-mercedes-s580/approved/front/card",
  "createdAt": "SEED_TIMESTAMP_ISO",
  "updatedAt": "SEED_TIMESTAMP_ISO",
  "version": 1
}
```

## Image records

For each vehicle, create 3 image documents under:

`vehicles/{vehicleId}/images/{imageId}`

Use deterministic image IDs `front`, `interior`, and `rear` for the demo seed.

The public paths must follow the repository convention:

```text
public/vehicles/{vehicleId}/approved/{imageId}/thumb
public/vehicles/{vehicleId}/approved/{imageId}/card
public/vehicles/{vehicleId}/approved/{imageId}/detail
```

The `card` variant is the primary card/list image.

Minimum image record requirements for renter discovery are:

```json
{
  "imageId": "front",
  "vehicleId": "VEHICLE_ID",
  "ownerId": "DEMO_APPROVED_OWNER_UID",
  "order": 0,
  "status": "approved",
  "publicVariantPaths": {
    "thumb": "public/vehicles/VEHICLE_ID/approved/front/thumb",
    "card": "public/vehicles/VEHICLE_ID/approved/front/card",
    "detail": "public/vehicles/VEHICLE_ID/approved/front/detail"
  },
  "promotedAt": "SEED_TIMESTAMP_ISO",
  "createdAt": "SEED_TIMESTAMP_ISO",
  "updatedAt": "SEED_TIMESTAMP_ISO"
}
```

For consistency with the trusted image pipeline, retain the full existing image-record fields when using processed uploads (`width`, `height`, `originalUploadId`, `variantPaths`, `processing`). Do not fabricate measured dimensions, byte sizes, EXIF/GPS facts or metadata-stripping facts. If the seeding agent cannot create truthful image-processing records, use the normal development upload/finalize/approval path for the real images instead of faking those fields.

Orders:
- `front`: 0
- `interior`: 1
- `rear`: 2

## Real image requirements

- Use real vehicle photography only.
- Each photo must match the stated model and colour closely enough that a client will not see a mismatch between metadata and image.
- Prefer coherent 4:3 or 3:2 landscape crops.
- Avoid dealership watermarks, screenshot chrome, obvious stock-library watermarks, licence plates that expose unnecessary PII, and unrelated backgrounds where practical.
- Exterior hero should show the full vehicle clearly rather than a tight badge/grille crop.
- Interior image should visibly communicate cabin quality.
- Never write a Firestore public image path before the referenced Storage object exists.

## Validation after seed

Using an authenticated verified renter in `mmg-concierge-dev`, confirm all four cars:

1. appear in discovery;
2. show the intended hero image;
3. show model, area and daily price correctly;
4. open Vehicle Detail without projection failure;
5. expose no exact owner address, plate, exact coordinates or owner-sensitive documents.

If the client demo will proceed into payment, do not invent booking availability records by hand. Use the existing trusted development availability/booking setup so the sentinel and concurrency invariants remain valid.
