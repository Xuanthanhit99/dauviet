# Consumer Integration Pass #4 — Explore Map V3

Date: 2026-09-21
Status: **IMPLEMENTED FOUNDATION — CI QA PENDING**

Implemented in `apps/web/app/map/page.tsx` and shared Web styles:
- Explore Map V3 route at `/map`;
- responsive map workspace + synchronized accessible results panel;
- historical-year and place-type filter controls;
- 44/48px+ interaction targets and 32px default marker treatment aligned with the locked spatial identity;
- explicit empty/loading foundation that never fabricates map entities;
- zoom-density explanation aligned to backend discovery contract;
- mobile/tablet responsive states.

API integration boundary was upgraded so `@dauviet/api-client` supports typed query parameters. The backend contract remains unchanged: `GET /v1/map/features`, required bbox, zoom density, optional year/types/theme/eraId, and backend-provided truncation metadata.

No backend/API/Prisma/database/.env changes. No fake historical features, coordinates, imagery, ratings or reviews.

Next implementation slice: MapLibre runtime binding, viewport-to-bbox requests, GeoJSON PLACE/EVENT/TERRITORY rendering, accessible result synchronization, and loading/error/truncated states against the frozen API contract.
