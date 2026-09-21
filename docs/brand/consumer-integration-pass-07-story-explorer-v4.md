# Consumer Integration Pass #7 — Story Explorer V4

Date: 2026-09-21
Status: **IMPLEMENTED — CI/BROWSER QA PENDING**

Implemented `/stories/[slug]` against frozen `GET /v1/stories/{slug}`.

The reading experience renders the backend's closed StoryBlock schema as native React elements rather than raw HTML: headings, paragraphs, quotes, source references, entity references, callouts, image/audio references. Citation references resolve to the Story's public citation links. Connections expose linked Places, People and Events; Evidence exposes published fact certainty and source citations.

Hero media metadata is treated as disclosure metadata only because the frozen Story public DTO intentionally does not flatten media to a URL. Historical/AI status and AI disclosure survive presentation. The frontend does not invent a media URL, historical claim, source, certainty, or relationship.

Responsive editorial reading, sticky context on desktop, mobile collapse, loading/error/empty/locale fallback states included. Backend/API/Prisma/database unchanged.


## Chromium browser QA gate

Added `apps/web/tests/story-explorer-v4.spec.ts` to the production-server Playwright Chromium suite. Contract-shaped interception validates 390×844, 834×1112 and 1536×960 responsive/no-overflow behavior; structured StoryBlock rendering; quote/source citation anchors; Place/Person/Event connections; fact certainty and citation evidence; historical + AI media disclosure without fabricated media URLs; empty body/citations; locale fallback; public API error; keyboard focus; and reduced motion.

Status remains open until the new Consumer QA run passes.
