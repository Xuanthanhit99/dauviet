# Consumer Web Completion Matrix V1

Status: ACTIVE IMPLEMENTATION BASELINE
Scope: apps/web consumer experience only. Admin PR #9 remains separate/draft.

## Audit principles
- Preserve approved Home V5: sticky top global navigation, canonical Dấu Việt brand assets, dark Time Trace hero, discovery/story/trust flow.
- Use real published API data. No invented travel inventory, fake reviews, fake routes, fake availability, placeholder photography, or AI imagery presented as documentary media.
- Real media must preserve provenance/rights contracts.
- VI canonical; EN fallback remains explicit.
- Every route must support loading, empty, error, responsive and keyboard states.

## Route matrix

| Surface | Current implementation | Completion state | Production work |
| --- | --- | --- | --- |
| Global shell | Home owns full header/footer; other route families use several independent shells | PARTIAL / HIGH | Shared consumer header, mobile navigation, locale, account entry, footer, active route, skip target; remove visual fragmentation without changing Home V5 composition |
| Home V5 | Source-faithful top nav + Time Trace + Discover + Story + Trust | STRONG / PARTIAL DATA | Preserve composition; replace empty editorial areas only with real published media/data; final responsive/visual polish |
| Explore / Search | Real search endpoint and entity routing | FUNCTIONAL / VISUALLY THIN | Search-first discovery UI, suggestions only when backed by API, filters, result cards, trust/fallback metadata, richer empty/error/loading |
| Explore Map V3 | Real MapLibre map, backend viewport query, clusters, year/type controls | FUNCTIONAL | Shared shell, mobile map/list sheet, selected-place inspector, clearer filters/layers, route continuity, error/offline states |
| Destination Detail | Real detail client and hero-media contract | FUNCTIONAL / NEEDS POLISH | Destination V4 hierarchy, hero/trust, places/stories/journeys discovery, real media, mobile composition |
| Place Detail | Real detail + timeline/sources/media endpoints | FUNCTIONAL / NEEDS POLISH | Place V4 editorial hierarchy, source/provenance UX, gallery consistency, Then & Now only when supplied, mobile |
| Stories collection | PublicCollection | FUNCTIONAL / GENERIC | Story Explorer V4 discovery treatment, topic/context navigation, cards using real published data |
| Story detail | StoryExplorer exists | FUNCTIONAL / NEEDS POLISH | Reading rhythm, evidence/source rail, entity connections, media provenance, mobile typography |
| Journeys collection | PublicCollection | FUNCTIONAL / GENERIC | Journey discovery cards, duration/stop metadata when supplied, no invented route/price |
| Journey detail | Map + ordered stops + linked story/event | STRONG / NEEDS POLISH | Journey V3 responsive map/list behavior, sticky progress, travel context only from supplied data |
| Country V1 | Real country/regions/cities/destinations; no fake hero | FUNCTIONAL / INCONSISTENT | Fix Vietnamese typography/copy, shared shell, stronger hierarchy and discovery continuation |
| Region V2 | Real region detail/map/lists, VI/EN copy | STRONG / SEPARATE SHELL | Integrate shared shell and visual system; retain explicit data gaps/trust notes |
| Person V2 | Dedicated detail route exists | FUNCTIONAL / AUDIT NEEDED | Shared shell, timeline/relationships/sources hierarchy, responsive |
| Event V2 | Dedicated detail route exists | FUNCTIONAL / AUDIT NEEDED | Shared shell, chronology/place/source relationships, responsive |
| Culture / Theme | Baseline expected | GAP / DISCOVERY NEEDED | Locate/verify routes and API contracts before implementation; do not invent surface |
| Auth / account | Login entry exists from Home | PARTIAL | Audit actual auth/account routes and session UX separately |
| Community / UGC | Backend/admin contracts exist | CONSUMER AUDIT NEEDED | Verify consumer routes before adding UI; provenance/moderation state must remain explicit |
| SEO | Root metadata is generic | INCOMPLETE | Route metadata, canonical/hreflang, structured data where contract supports it, sitemap/robots verification |
| Accessibility | Skip link/focus/reduced motion partly present | PARTIAL | Landmark consistency, mobile nav keyboard behavior, map alternatives, 200% text/reflow |
| Performance | Next/Image on Home; MapLibre client-heavy by nature | AUDIT NEEDED | Route bundle/media/LCP audit after compositions stabilize |

## Highest-impact implementation order
1. Global consumer shell + responsive mobile navigation + route continuity.
2. Explore/Search + Map as the primary discovery loop.
3. Destination + Place as the primary travel decision/context loop.
4. Story + Journey as the historical/editorial depth loop.
5. Country/Region/Person/Event normalization.
6. Real-media/provenance presentation across all supported surfaces.
7. Auth/community consumer flows after route verification.
8. SEO, accessibility, performance and exact-head visual regression.

## Release gates
A surface is not COMPLETE until it has: real-data contract verified; desktop/tablet/mobile states; loading/empty/error; keyboard/focus; VI copy; EN/fallback behavior where supported; no fabricated media/data; visual evidence; exact-head typecheck/tests/build.
