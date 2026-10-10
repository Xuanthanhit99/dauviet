# Dấu Việt Home V6 — LOCK

Status: LOCKED for implementation.
Viewports: Desktop 1536×960 and Mobile 390×844.

## Core product rule

**Đi đâu → Ở đâu → Làm gì → Lên hành trình → Hiểu nơi mình đến.**

Travel and trip planning are the dominant Home layer. History is the differentiator. Evidence and provenance remain available without turning Home into a history-reference homepage.

## Location states

- GPS available → Nearby Discovery using the existing public `GET /v1/places/nearby` contract.
- GPS denied/unavailable → Home remains fully usable; no permission wall.
- Coarse country context → Country Discovery.
- Country unknown → Global Discovery.
- User-selected destination always overrides automatic context.
- Precise coordinates are request-scoped only and are never persisted by Home.

## Locked composition

1. Cinematic travel-first hero and destination search.
2. Regional / nearby discovery context.
3. Featured historical journeys.
4. Trip planner: destination, duration, travelers, accommodation.
5. Travel services: stay, tickets, historical tours, food, transport, experiences.
6. Destinations worth visiting.
7. Local experiences.
8. History signature: one place, many time layers / Then → Now.
9. Stories behind the destination.
10. Final discovery CTA.

## Visual rules

- Warm Sand / cream is the primary content canvas.
- Deep Forest is an accent and immersive section color, not the dominant page surface.
- Bronze Gold is reserved for actions, highlights and time markers.
- Noto Serif + Noto Sans remain the typography system.
- Production media must be real media with provenance. No AI imagery.
- Do not fabricate prices, ratings, availability or provider offers.
- No fabricated place entities or fallback records.
- Search uses `/v1/search`.
- Nearby uses `/v1/places/nearby`.

## Implementation gate

The implementation must be reviewed at exactly 1536×960 and 390×844 before Ready/Merge. Production screenshots are the final source of truth for visual fidelity.
