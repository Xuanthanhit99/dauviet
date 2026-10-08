# Anciquest — Global Travel Product V1
Status: PRODUCT BASELINE / implementation not started
Date: 2026-10-08
Scope: Global consumer travel, provider marketplace, commerce integration, voluntary trip safety.

## Product promise
Explore anywhere → choose a destination → plan → book verified services → travel → check in safely → share experiences.
Culture, history, and evidence remain optional differentiating layers, not the default travel category. Preserve all existing historical records, API contracts, Golden Dataset, provenance and editorial workflows.

## Non-negotiable boundaries
- PR #15 Home V6 remains Draft and isolated. No cherry-pick, merge, CSS edits or production deploy as part of this blueprint.
- Global content is never represented as available unless backed by a real published record/provider.
- Real photography only, with source, attribution, license, geographic correctness and permission status.
- No fabricated availability, room prices, bookings, reviews, ratings, guides or travel advisories.
- Location permission is optional, contextual, revocable. Manual destination selection must work without GPS.
- Separate current position, selected destination, home country, language, currency and time zone.
- Booking/commission requires a partner contract, provider-specific availability and cancellation terms.
- Do not collect or expose precise location by default; never publish a missing-person alert automatically.

## Navigation / information architecture
Public desktop: Discover, Destinations, Stays, Experiences, Transport, Local Guides, Trips, Stories; account, currency/language, location selector.
Mobile: Discover, Explore, Trips, Bookings, Profile; contextual search and Safety shortcut within active trip.
Public routes proposed: /, /explore, /destinations/[slug], /places/[slug], /stays, /experiences, /transport, /guides, /guides/[slug], /trips, /trips/[id], /bookings, /stories.
Provider portal (RBAC): /partner/onboarding, /partner/profile, /partner/services, /partner/availability, /partner/requests, /partner/payouts.
Admin: provider identity/licensing, catalog moderation, media provenance, disputes, safety audit, partner operations.
Existing history/culture routes stay functional; add Culture & Stories entry points and internal links.

## Home experience contract
1. Cinematic destination-first hero with real geographically matched image; prominent 'Where to?' destination input, dates, travelers; optional 'Near me' permission action.
2. Country/city discovery based on explicitly selected destination, not IP assumptions.
3. Stay / experience / transport discovery modules with provider disclosure and no invented prices.
4. Editorial journeys and trip planner (editable multi-day plan; budget and logistics).
5. Verified local guides and licensed businesses, no invented reviews.
6. Travel inspiration and local culture/history stories as editorial differentiator.
7. Safety Check-in CTA only in active trip context, never intrusive.
8. Clear footer: partner disclosures, policies, accessibility, safety limitations.

## Desktop 1536 visual master specification (design gate, not an approved rendering)
Canvas: editorial travel photography, spacious restrained typography, high contrast; retain brand Deep Forest #062A24 and Bronze Gold #D4AF7C as accents, Warm Sand #EADDC7 as a restrained neutral. Do not use generic SaaS dashboards or AI photos.
Above fold: full-bleed/cinematic hero + search and destination context, uncluttered nav. Subsequent sections visually distinct; image hierarchy first, editorial text second.
Required screenshots: viewport 1536x960, full-page screenshot, first-fold crop, asset/source inventory.

## Mobile 390 visual master specification (design gate, not an approved rendering)
Portrait-first hero with visible focal photo and readable search; destination switcher; single-column editorial rhythm; horizontally scrollable discovery where appropriate; accessible bottom nav; avoid tall empty cards.
All interactive targets >=44 CSS px, legible typography, safe-area support, no horizontal overflow.
Required screenshots: viewport 390x844, full-page screenshot, first-fold crop, touch/keyboard accessibility evidence.
Desktop and Mobile masters require explicit human approval before implementation. Pixel/composition fidelity gate after implementation.

## Data and APIs (design proposal, not implemented)
Global geographic hierarchy: Country, AdministrativeRegion, City, Destination, Place; geometry in PostGIS, IANA time zone, ISO country/currency/language codes, localized names and summaries.
Discovery: GET /v1/travel/discover?destinationId=&locale=&currency= ; GET /v1/travel/destinations ; GET /v1/travel/providers.
Keep existing endpoints operational; use versioned additive contracts and schema migrations.
Affiliate: Partner, OfferSnapshot, OutboundReferral, ConversionAttribution, Disclosure; TTL and source timestamps for quotes; signed tracking links; reconciliation and privacy controls.
Marketplace: ProviderProfile, IdentityVerification, BusinessLicense, ServiceListing, ServiceAvailability, BookingRequest, CancellationPolicy, Review (verified booking only), Dispute, PayoutLedger.
Never accept direct payment or promise confirmed booking until payment-provider, regulatory, tax, refund and chargeback contracts are implemented.
Trip: Trip, TripParticipant, TripStop, TripReservationReference, TripCheckIn, TravelPreference.

## Safety — privacy-first contract
Opt-in per trip; explicit end time, grace period, verified trusted contact, granular consent for what may be shared and when. User can pause, cancel, revoke and delete where legally permissible.
States: OFF → ACTIVE → CHECKIN_DUE → REMINDING → OVERDUE → CONTACT_NOTIFIED → ASSISTANCE_REQUESTED → RESOLVED/CANCELLED.
Queue must be idempotent, timezone-aware and auditable. A 48-hour delay is a configurable preference, not a universal missing-person determination.
Notify only verified trusted contacts privately on nonresponse; message says 'check-in not confirmed', never 'missing'.
Last-known location shared only with explicitly authorized contact after agreed escalation and strong reauthentication; strict retention, access logs and abuse prevention.
Community search alerts: NO automatic public distribution, no public last coordinates, personal phone, home address or identifying image; only verified, moderated, legally appropriate assistance workflows with protected contact relay and takedown.
Web background geolocation cannot be guaranteed; native mobile permissions, OS limitations, battery/network and emergency-service disclaimers must be explicit. Not a replacement for rescue/emergency services.

## Delivery gates
G0: inventory existing monorepo modules, routes, schemas, dependencies, media rights and operational QA; baseline snapshot.
G1: product IA + desktop 1536/mobile 390 visual masters approved; no code beforehand.
G2: global destination catalog, localization, explicit destination switcher, location opt-in, production media provenance.
G3: planner, provider-backed affiliate offers, referral audit, booking handoff and real provider status.
G4: provider marketplace with verification, moderation, service requests, payments only after compliance signoff.
G5: safety consent, contacts, state machine, idempotent alerts, abuse/security/privacy QA; staged opt-in launch.
G6: load/performance, accessibility, localization, security, incident response, consumer QA, visual side-by-side, staged rollout.
Every gate: local-first tests, screenshots 1536/390, exact HEAD proof, no fabricated PASS; GitHub Actions only at meaningful checkpoints within user's monthly budget.

## Next execution
Audit current main branch and PR #15 separately. Produce source-backed route/module/schema inventory and gap matrix, then propose actual Desktop and Mobile masters for user approval. No merge or production change until reviewed.
