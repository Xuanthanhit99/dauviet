# Consumer Integration Pass #8 — Journey Detail V3

Date: 2026-09-22
Status: **IMPLEMENTED — CI/BROWSER QA PENDING**

Frontend-only implementation at `/journeys/[slug]`, consuming the existing public `GET /v1/journeys/{slug}` contract. Backend was read for contract understanding and was not modified.

The page renders only backend-supplied duration, distance, difficulty, region, ordered stops, recommended stop duration, coordinates, Story/Event links and route geometry provenance. When route geometry is absent it explicitly states that stop ordering is editorial and does not draw/fabricate a route. Hero media remains disclosure-only because the public DTO does not expose a display URL.

Responsive editorial hero, journey metrics, ordered stop narrative, Place/Story/Event relationships, route/trust disclosure, locale fallback and explicit loading/error/empty states are implemented.
