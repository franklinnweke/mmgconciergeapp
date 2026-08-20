# MMG Concierge — Overall Design Plan

**Version:** 1.2
**Updated:** 2026-08-20
**Surfaces:** React Native / Expo mobile app (`apps/mobile`), Next.js staff admin (`apps/admin`), shared brand system (`packages/brand`)  
**Product:** Lagos-first marketplace for chauffeured luxury vehicle journeys  
**Positioning:** **Prado first. Luxury beyond.**

## 1. Purpose and authority

This document is the visual, interaction, and product-language authority for MMG Concierge. It explains how the product should feel and how that direction translates into screens, components, imagery, states, and acceptance checks.

It does not override security, payment, privacy, state-machine, or data rules in:

1. `docs/architecture/MMG_CONCIERGE_TECHNICAL_ARCHITECTURE_AND_IMPLEMENTATION_HANDOFF.md`
2. `docs/implementation/PROJECT_COMPLETION_WITHOUT_PAYSTACK_IMPLEMENTATION_PLAN.md`
3. The active sequence specification for the feature being implemented

If a visual concept conflicts with product truth or system safety, product truth and safety win. No design may imply payment, confirmation, dispatch, availability, verification, or support activity that the trusted backend has not produced.

## 2. Product position

MMG Concierge is not a generic car-rental catalog, a ride-hailing clone, or a private members’ club. It is a managed marketplace connecting renters with approved luxury-vehicle owners in Lagos. Every MVP journey includes a chauffeur and Lagos delivery.

### The Prado-led idea

The Land Cruiser Prado is the recognizable centre of gravity for the MMG experience:

- Prado imagery leads the first impression.
- Prado examples appear first in preview and editorial fleet ordering.
- Product copy speaks confidently about Prado journeys.
- Executive SUVs and executive sedans remain visible as the broader luxury range.
- The underlying production categories remain `executive_suv` and `executive_sedan`; **Prado is a make/model and editorial collection, not a new security or pricing category**.

The app should feel Prado-led, not Prado-exclusive. A renter should understand within seconds that MMG knows Prado-based luxury transport, while still seeing that other approved executive vehicles are available.

### Trademark and representation boundary

- MMG must not imply that it is Toyota, an authorized Toyota dealer, or an official Toyota partner unless a documented commercial relationship exists.
- Toyota or Prado marks must not become the MMG logo or navigation identity.
- Vehicle make/model names may be used truthfully in inventory and search.
- Preview imagery must avoid fabricated manufacturer badges, readable plates, signage, addresses, or false ownership claims.
- When preview/sample vehicles are shown, they are design fixtures—not proof that a particular live vehicle is available.

## 3. Experience thesis

**A discreet Lagos chauffeur desk: Prado-led vehicle photography, calm utility, precise journey information, and visible human care.**

The product should make the renter believe one thing:

> MMG understands the vehicle, the chauffeur, and the Lagos journey—not merely the booking form.

The proof is concrete:

- approved vehicle imagery;
- named Prado models and broader executive inventory;
- chauffeur and delivery inclusions;
- Lagos districts and journey dates;
- transparent server-derived pricing;
- truthful operational status;
- visible review and concierge intervention when something needs attention.

## 4. Design principles

### 4.1 Discretion over luxury costume

- Graphite, ivory, and restrained gold establish the material system.
- Gold is a signal for selection, confirmed values, and primary action—not a coating.
- Do not use black, gold, serif type, glass, large radii, and shadows together as a substitute for product proof.
- Vehicle photography, service detail, typography, and spacing must do more work than decoration.

### 4.2 One decision cluster at a time

- Every screen has one primary job and one dominant action.
- Advanced filters, policy details, history, and secondary actions use progressive disclosure.
- Repeated controls should be removed before adding more containers.

### 4.3 Cardless by default

- Prefer full-width media, plain rows, ruled sections, dividers, and grouped typography.
- A card is appropriate when the entire object is selectable or the content genuinely forms one record.
- Avoid nested cards, dashboard mosaics, and a rounded container around every text group.

### 4.4 Product truth in every state

- Never claim that a sample vehicle is live inventory.
- Never claim payment success from a redirect or callback.
- Never say a ride is confirmed before owner/admin confirmation.
- Never say a push, message, review, refund, or account deletion happened unless the trusted operation succeeded.
- Provider-unavailable states must name what the renter can safely do next.

### 4.5 Lagos-native, not Lagos-themed

- Use real journey context: Ikoyi, Victoria Island, Lekki, Lagos Island, Eko Atlantic, and airport pickup.
- Avoid generic skyline decoration, cultural clichés, fake signs, or invented neighborhoods.
- Current-location permission is requested only when chosen; manual Lagos search remains available.
- Exact vehicle bases and private addresses never appear in renter UI or network DTOs.

### 4.6 Warm professionalism

- Copy is direct, composed, and helpful.
- The app should feel selected by a human with judgment, not generated by a template.
- Status and recovery language is calm. Avoid both panic and vague reassurance.

## 5. Brand system

### 5.1 Logo and wordmark

Source files:

- `apps/mobile/assets/images/logo-transparent.png`
- `apps/mobile/src/components/brand-logo.tsx`
- `apps/mobile/src/components/brand-wordmark.tsx`

Supported logo roles:

| Variant | Nominal size | Use |
|---|---:|---|
| `icon` | 28 pt | Compact navigation or identity moment |
| `header` | 36 pt | Branded application header |
| `hero` | 64 pt | Welcome/onboarding identity |
| `splash` | 88 pt | Loading and launch state |

Rules:

- Use the logo once per primary screen region.
- Do not place the logo inside decorative gold discs or repeated badges.
- The wordmark must remain legible and must not compete with the screen title.
- Product photography remains the main visual anchor; the logo establishes authorship.

### 5.2 Colour tokens

Use `@mmg/brand`; do not introduce near-duplicate hardcoded colours.

| Role | Token | Current value |
|---|---|---|
| Primary dark | `colors.black` | `#040404` |
| App canvas | `colors.canvas` | `#080807` |
| Grouped surface | `colors.graphite` | `#151515` |
| Raised surface | `colors.graphiteRaised` | `#1D1D1D` |
| Primary text | `colors.ivory` | `#F7F1E7` |
| Secondary text | `colors.silver` | `#E5E2DC` |
| Muted text | `colors.muted` | `#B4AEA4` |
| Accent | `colors.gold` | `#C9A646` |
| Primary accent | `colors.goldStrong` | `#E3C365` |
| Success | `colors.success` | `#8FAF82` |
| Danger | `colors.danger` | `#D18578` |

Gold should usually occupy less than 15% of a viewport. Success and danger colours communicate state; they are not decorative accents.

### 5.3 Typography

- Playfair Display is reserved for brand/editorial emphasis, vehicle names, and major consumer headings.
- Inter carries instructions, controls, prices, forms, status, and admin operations.
- No more than these two type families.
- Admin surfaces favour Inter; serif is limited to restrained identity moments.

Current scale:

| Token | Size | Use |
|---|---:|---|
| `displayLarge` | 40 pt | Rare consumer hero |
| `display` | 32 pt | Primary consumer screen title |
| `xl` | 24 pt | Section or vehicle heading |
| `lg` | 20 pt | Price or component title |
| `md` | 17 pt | Emphasized value |
| `base` | 15 pt | Body and form value |
| `sm` | 13 pt | Secondary copy |
| `xs` | 11 pt | Short metadata only |

Meaningful mobile text must never be smaller than 11 pt. Long instructions and errors should normally use 13–15 pt.

### 5.4 Spacing and touch targets

| Token | Value | Use |
|---|---:|---|
| `layout.screenGutter` | 24 pt | Default mobile horizontal gutter |
| `layout.sectionGapLarge` | 64 pt | Major narrative separation |
| `layout.sectionGap` | 48 pt | Standard section separation |
| `layout.componentGap` | 24 pt | Major component gap |
| `layout.rowGap` | 16 pt | Rows and form groups |
| `layout.itemGap` | 12 pt | Closely related content |
| `layout.minTouchTarget` | 48 pt | Preferred mobile touch target |
| `layout.primaryButtonHeight` | 56 pt | Primary CTA |
| `layout.compactButtonHeight` | 44 pt | Minimum compact action |

Spacing is purposeful, not empty. If a screen feels weak, strengthen hierarchy or remove content before increasing every gap.

### 5.5 Radius rules

- `0`: full-bleed media, dividers, editorial boundaries.
- `8`: inputs and compact controls.
- `12–16`: selectable vehicle records and sheets.
- `24`: rare high-emphasis container.
- `pill`: state, segmented selection, avatar, or focused action only.

Avoid “pill soup.” A viewport should not contain several competing horizontal rails of pills when one filter sheet or segmented group would be clearer.

## 6. Imagery direction

### 6.1 Prado-first image hierarchy

1. Prado hero or featured vehicle.
2. Supporting Prado angle/model/colour.
3. Broader executive SUV or sedan.
4. Chauffeur/delivery/service evidence where a real, privacy-safe asset exists.

Current preview assets:

| Asset | Intended role |
|---|---|
| `prado-250-obsidian-hero.png` | Login/onboarding hero and Prado 250 fixture |
| `prado-150-pearl.png` | Primary preview Prado card/detail |
| `prado-150-graphite.png` | Supporting preview Prado card/detail |
| `graphite-executive-sedan.png` | Broader executive-saloon fixture |

The preview collection is deliberately three Prado examples and one executive saloon. This is a design fixture. Live production discovery must replace fixtures with approved active inventory.

### 6.2 Asset acceptance

Before using a generated or sourced vehicle image, inspect:

- body geometry, wheels, lamps, mirrors, handles, glass, and perspective;
- consistency with the named model generation;
- plate removal or unreadability;
- no fake dealership/venue text, logos, watermarks, or private address;
- believable Lagos material and environmental context;
- no malformed or identifiable bystander;
- useful crop at 390 × 844 and common Android aspect ratios;
- sufficient calm tonal area when text overlays the image.

Do not use a polished image if the vehicle itself is materially wrong. Do not use invented Lagos skylines merely because they look expensive.

### 6.3 Live inventory transition

- Fixture imagery is allowed in explicit web/design preview mode.
- Native/live discovery must show server-approved variants only.
- A preview environment should be visibly identifiable in QA and documentation.
- Public vehicle imagery is derived from the approved image pipeline after MIME/size checks, magic-byte validation, EXIF stripping, variant generation, and moderation.

## 7. Product language

### 7.1 Voice

Use concrete service language: Prado, chauffeur, Lagos delivery, owner confirmation, approved vehicle, daily rate, journey dates, and concierge intervention.

Avoid generic luxury filler: premium, elevated, world-class, seamless, curated excellence, exclusive lifestyle, and unforgettable experience—unless a nearby fact proves the statement.

### 7.2 Approved positioning examples

- “Lagos, handled in a Prado.”
- “Prado first. Luxury beyond.”
- “Prado-led Lagos fleet.”
- “Prado-led, chauffeur-ready, reviewed by MMG.”
- “Every Prado—and every executive vehicle beside it—includes Lagos delivery and a reviewed chauffeur.”

Use these as a system, not on every screen. Once Prado leadership is established, operational screens should return to concise utility language.

### 7.3 Truthful state language

| Situation | Use | Avoid |
|---|---|---|
| Preview quote | “Estimated quote” | “Final amount” |
| Payment unavailable | “Payment is not available in this build.” | “Pay now” |
| Verified payment, awaiting owner | “Payment received — confirming your ride.” | “Ride confirmed” |
| Owner response pending | “Confirming vehicle and chauffeur.” | “Chauffeur assigned” |
| Intervention | “Concierge is resolving this.” | “Cancelled” unless cancellation is final |
| Fixture data | “Preview fleet” in QA/dev context | “Available now” without live inventory |
| Upload accepted | “Upload received for review.” | “Document approved” |

## 8. Mobile experience architecture

### 8.1 Entry and account setup

**Job:** Establish the Prado-led service and securely orient the renter or owner.

- Full-bleed Prado visual is the proof anchor.
- Brand, one short proposition, and authentication action fit within the initial viewport.
- Account choice explains the renter and owner consequence without marketing excess.
- Verification/loading/error states reuse the brand system but prioritize recovery.
- No animated floating logo loop that distracts indefinitely; entrance motion resolves quickly.

Current direction:

- “Prado-led chauffeured service” and “Lagos, handled in a Prado.”
- Renter choice mentions the Prado-led fleet plus broader luxury inventory.
- Owner choice welcomes a Prado or another vehicle eligible for MMG review.

### 8.2 Discovery home

**Job:** Let the renter establish where and when, then see credible vehicle options.

Order:

1. Compact Lagos/time/account header.
2. Active journey, only when one exists.
3. Journey composer: pickup, dates, one `Find cars` action.
4. Prado-led featured collection.
5. District/airport shortcuts.
6. One concise MMG service assurance.

Rules:

- Prado appears first visually and editorially.
- Keep `executive_suv` and `executive_sedan` filters; do not create a fake Prado security category.
- The home should not become three stacked pill rails. Move advanced filters to Browse.
- Featured vehicle media may remain a selectable card because the entire vehicle is the interaction.
- A real live journey outranks marketing content.

### 8.3 Browse fleet

**Job:** Compare relevant vehicles without losing the journey context.

Target composition:

- compact title and current date/location summary;
- search field accepting model or Lagos area;
- one obvious `Filters` action;
- a dedicated filter sheet for district, class, seats, and price;
- media-led vehicle rows with meaningful space between them;
- clear result count, empty state, retry, and offline state.

The current multi-rail implementation is acceptable as a functional checkpoint, but the design target is one filter entry plus progressive disclosure. Preserve 48 pt touch targets and scroll position when filters change.

### 8.4 Vehicle detail

**Job:** Help the renter decide whether this exact vehicle and service fit the journey.

Required hierarchy:

1. Approved swipeable gallery with image count and accessible controls.
2. Make/model, vehicle class, area, seats, and distance.
3. Chauffeur and Lagos-delivery inclusions.
4. Specifications and comfort features.
5. Journey dates and server-aligned estimate.
6. Sticky safe-area action.

Pricing rules:

- Never hardcode “8%” in product copy.
- Display the versioned/configured service fee returned by the shared quote path.
- The client estimate and server authoritative calculation must follow the same integer-kobo engine.
- Label the result as an estimate until the server returns the trusted snapshot.
- While Paystack is unavailable, the action is `Review quote` or an honest unavailable boundary—not `Purchase` or `Pay`.

### 8.5 Trips and concierge

**Job:** Orient the renter to trusted booking state and the next safe action.

- Active/attention-needed journeys precede past records.
- Timeline entries use trusted state transitions, not optimistic client claims.
- Concierge entry is booking-scoped and must respect the payment/chat boundary.
- Pre-payment renter-owner contact is not allowed.
- Do not promise flight tracking or chauffeur live location; neither exists in MVP.
- Empty, offline, stale, intervention, refund-pending, and provider-unavailable states are first-class designs.

### 8.6 Owner verification and fleet

**Verification job:** Complete identity and understand review status without exposing raw private-document access.

**Fleet job:** Create, submit, and operate approved listings.

Vehicle creation sequence:

1. Vehicle identity/specification.
2. Daily rate and owner earning explanation.
3. One to twenty images with permission, progress, retry, reorder, and primary selection.
4. Lagos base with exact location kept private and approximate public location explained.
5. Plate/documents with privacy guidance.
6. Review summary and submission.

Status language must distinguish `Draft`, `Pending review`, `Approved`, `Rejected`, `Paused`, `Suspended`, and `Deleted`. Major revisions do not appear publicly until approved.

## 9. Staff admin experience

The admin is an operational workspace, not a marketing surface.

### 9.1 Visual mode

- Warm neutral, high-legibility workspace with restrained branded navigation.
- Inter-first typography, dense readable rows, clear filters, and stable inspector layouts.
- No consumer hero, lifestyle slogan, decorative fleet carousel, or excessive serif.
- Status colour appears once per record region; avoid badge repetition.

### 9.2 Information architecture

- Overview
- Owner verification
- Vehicle moderation
- Bookings and intervention
- Chat/support
- Wallets and withdrawals
- Users and configuration
- Privacy requests
- Audit/security

Payment/refund operations remain visibly unavailable until their trusted backend exists.

### 9.3 Queue and inspector pattern

- Cursor-paginated queue on the left/top, stable inspector on the right/detail route.
- Search and filters describe operational scope.
- Server-side masked PII only.
- Private previews use authorized URLs expiring within 15 minutes and offer safe refresh.
- Sensitive actions require reason, confirmation, version awareness, and role authorization.
- Stale-version conflicts tell staff to refresh rather than overwrite.
- Fixture mode is visually explicit and impossible in production.

## 10. Components and interaction

### 10.1 Component rules

- `PressableScale`: state/affordance feedback only; respect reduced motion.
- `LuxuryCard`: use only when the complete container is one meaningful object. It is not the default section wrapper.
- `SectionHeader`: avoid repeated eyebrow/title/action ladders on every section.
- Status pills: one concise state; do not repeat the same status in icon, colour, title, and badge.
- Icons: use the existing icon family consistently and pair unfamiliar icons with text.
- Bottom sheets: filters, policy details, and secondary choice—not primary navigation.

### 10.2 Motion thesis

Use motion to establish hierarchy and state:

1. One resolved entrance for the primary image/title.
2. Press/selection feedback for vehicle and journey choices.
3. Sheet, gallery, progress, and status transitions tied to user action.

Typical timings:

- 120–220ms for press/selection/state feedback.
- 280–440ms for screen/sheet entrance.
- Spring motion only when it clarifies physical selection or navigation.

Avoid endless floating, ornamental parallax, motion on every section, or animation that delays authentication, booking, upload, or staff work.

## 11. Accessibility and resilience

Every mobile screen must provide:

- touch targets at least 44 × 44 pt, preferably the 48 pt token;
- meaningful text at least 11 pt;
- accessible labels for icon-only controls and vehicle imagery;
- correct roles/states for buttons, tabs, radio choices, and progress;
- logical focus and screen-reader order;
- reduced-motion behavior;
- text scaling without clipping primary actions;
- sufficient contrast over imagery and in disabled states;
- keyboard-safe forms and visible validation association;
- loading, empty, offline, retry, permission-denied, provider-failure, and long-content states.

Admin adds keyboard navigation, visible focus, table/list semantics, predictable pagination, and no colour-only status communication.

## 12. Failure-detector review

Run this named pass before accepting a redesigned surface:

| Failure | Signal | Required correction |
|---|---|---|
| Card carpet | Every section is boxed | Convert non-interactive groups to layout/dividers |
| Pill soup | Several horizontal capsule rails | Consolidate into one control or filter sheet |
| Eyebrow ladder | Every section repeats eyebrow/title/body | Remove labels that do not add orientation |
| Luxury costume | Gold/serif/shadow replaces service detail | Add real vehicle/journey proof; remove decoration |
| Generated atmosphere | Image is polished but vehicle/Lagos context is wrong | Reject or replace the asset |
| Equal-weight screen | Every region competes equally | Establish one task and one dominant visual/action |
| Status confetti | State appears repeatedly in colour/badges/icons | Keep one primary status treatment |
| Motion garnish | Animation has no state or hierarchy purpose | Remove it |
| Proof gap | Copy claims more than the backend or asset proves | Rewrite to the trusted capability |

The final polish pass should usually remove visible UI.

## 13. Implementation roadmap

This design roadmap follows the technical work packages; it does not create a separate feature sequence.

| Work package | Design deliverable | Current status |
|---|---|---|
| WP0 | Brand/token consistency, truthful terms/pricing/error copy | Mostly complete; server/client price parity remains |
| WP2 | Owner fleet wizard, upload states, fleet hub, admin vehicle queue/inspector | Substantially delivered; cleanup and approved-listing revision path remain |
| WP1 | Renter profile/address, privacy/deletion, admin MFA states | Foundation delivered; verified phone, deletion completion and MFA remain |
| WP3 | Live Lagos discovery, filter sheet, approved media gallery, exact-location privacy QA | Partial; source-level crash/preview repairs landed, but current-source runtime smoke remains blocked |
| WP4 | Availability calendar, quote/hold boundaries, owner response, intervention UI | Trusted intent foundation only; experimental branch is unmerged |
| WP5 | Payment-gated chat, notifications, journey timeline, completion states | Not started |
| WP6 | Owner earnings, wallet ledger views, payout profile, withdrawal operations | Not started |
| WP7 | Complete role-scoped admin workspace | Not started |
| WP8 | Accessibility, device E2E, offline/low-bandwidth, Crashlytics and release QA | Not started |

Immediate design priority:

1. Restore a repeatable current-source web/iOS/Android smoke and validation gate for the repaired renter paths.
2. Verify onboarding, product, pickup-sheet and booking-review behavior across supported development builds.
3. Connect discovery dates and booking review to the authoritative search/quote/hold boundary.
4. Preserve Prado-led preview fixtures for design review until approved live inventory is intentionally selected; never present fixture availability as production truth.

## 14. Design acceptance rubric

A screen is ready for implementation review only when:

- its single primary job is stated;
- its trusted data source and fixture/live mode are known;
- the first viewport has one dominant visual/action hierarchy;
- Prado leadership is evident on persuasive fleet surfaces without erasing broader inventory;
- no Toyota affiliation is implied;
- copy matches the real backend state;
- exact locations, PII, storage paths, and sensitive documents are absent from unsafe client projections;
- loading, empty, error, offline, denied, and retry states exist;
- typography, colour, radius, spacing, and icons use the shared system;
- touch, text, contrast, screen-reader, keyboard, and reduced-motion checks pass;
- generated/sourced assets pass the vehicle, privacy, and Lagos credibility review;
- screenshots are reviewed at 390 × 844, a small Android viewport, and one large-text setting.

## 15. Definition of done for a design implementation

A design task is not complete until:

1. Code and shared tokens agree.
2. Fixture and live behavior are explicitly separated.
3. Every primary and failure state is implemented.
4. Product language is truthful at payment, confirmation, review, and privacy boundaries.
5. Accessibility checks pass.
6. Web/static export and relevant iOS/Android builds compile.
7. The implementing agent provides mobile/admin screenshots, commands run, changed files, and unresolved risks.
8. The failure-detector pass records what was removed or simplified.

This document is the ongoing design source of truth. Update it when the product position, shared tokens, supported surfaces, or trusted backend capability changes; do not create a competing desktop copy.
