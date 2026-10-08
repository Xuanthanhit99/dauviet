# Global Travel V1 — source inventory and reuse matrix
Audit: 2026-10-08; repository main tree and selected controller source. Static inspection only; no test execution or production claim.

## Inventory confirmed in repository
API module directories: accommodations, activities, affiliate, aliases, attractions, audit, auth, bookmarks, citations, cities, comments, community, contributions, cost-assumptions, countries, cuisines, destinations, dishes, dynasties, editorial, eras, events, facts, journeys, knowledge-ingestion, mailer, map, media, moderation, people, places, providers, regions, reports, restaurants, search, sources, stories, territories, themes, then-now, timeline, trips, users.
Web routes confirmed: /, /explore, /book, /book/stay/[slug], /book/activity/[slug], /book/food/[slug], /trips, /trips/[id], /destinations/[slug], /countries/[slug], /regions/[slug], /places/[slug], /journeys, /stories, /map, account/auth and community.
Expo mobile routes confirmed: explore, book/stay, book/activity, book/food, trips, destinations, places, community, account.
Admin routes confirmed: editorial, media, moderation, ingestion, operations, contributions.

## Reuse matrix
| Area | Existing source evidence | Decision | Gaps / acceptance criteria |
| --- | --- | --- | --- |
| Geographic catalog | countries, cities, regions, destinations, places, map, search | REUSE/EXTEND | Verify global dataset coverage, locale, geometry, timezones and search relevance; do not assume global completeness |
| Stay/activity/food discovery | accommodations, activities, restaurants and web /book routes | REUSE/EXTEND | Provider-backed availability, currency, cancellation terms, offer expiry, booking handoff, real-world QA |
| Affiliate | affiliate click tracking and opaque server-side redirect; admin reporting | REUSE/EXTEND | Live contracted partners, commission attribution, disclosure, fraud protection, reconciliation and expiry |
| Providers | admin/providers controller explicitly ADMIN-only; integrations/licenses services | REUSE governance | Public guide marketplace, onboarding, service listings, verified reviews, booking requests, identity/license checks, payouts NOT evidenced |
| Trip planner | private owner-only /trips controller, itinerary, expenses, settlement and finance services | REUSE/EXTEND | Check-in safety, reservation sync, localization, offline UX; preserve owner-only privacy |
| Content provenance | media, sources, citations, editorial, moderation | REUSE | Country-appropriate real photos, licensing, coverage, accessibility and media QA |
| Data ingestion | GeoNames adapter exists but disabled without GEONAMES_USERNAME; OSM/Google Places adapters | REUSE cautiously | Contract and source-policy checks, operator credentials, rate limits, freshness, deduplication, country coverage |
| Web and Expo | existing booking/trips/explore routes | REUSE shell/features | Global travel IA, visual masters, end-to-end UX, accessibility and mobile parity |
| Safety | No safety/check-in module identified in API module tree | NEW | Consent, verified contacts, state machine, alerts, access controls, abuse prevention and retention |
| Payments | No dedicated payments module identified in API module tree | RESEARCH/NEW | Payment processor, refund/chargeback, tax/KYC/legal obligations before direct checkout |
| Translation/currency | Existing internationalization to be inspected in depth | VERIFY/EXTEND | Language/currency preferences independent from current GPS and selected destination |

## Source-backed findings
- apps/api/src/modules/providers/providers.controller.ts: admin-only infrastructure; explicitly no public provider route.
- apps/api/src/modules/affiliate/affiliate.controller.ts: POST affiliate/clicks and GET affiliate/r/:token; redirect resolves prevalidated server-side token.
- apps/api/src/modules/trips/trips.controller.ts: owner-only private trips; itinerary/expenses/settlements.
- apps/api/src/modules/knowledge-ingestion/adapters/geonames.adapter.ts: disabled unless GEONAMES_USERNAME is configured and policy permits.
- Repository tree main, 2026-10-08.

## Readiness definitions
SOURCE EXISTS = files/routes present.
CONTRACT REVIEWED = DTO, controller, schema and security audited.
TESTED = exact-head local/unit/integration/consumer tests run with artifacts.
PRODUCTION READY = live partner/data, operational security, visual fidelity, monitoring, legal/compliance and release gates passed.
This document establishes SOURCE EXISTS and a small number of CONTRACT REVIEWED findings only.

## Immediate design deliverables
- Global Travel Desktop 1536 visual master: real photo hero, destination-first search, location control, editorial travel sections, provider disclosure, guides, trips and stories.
- Mobile 390 visual master: portrait hero, clear search, readable cards, fixed bottom nav, accessible forms.
- Side-by-side fidelity gate; do not merge code or PR #15 during visual design.
