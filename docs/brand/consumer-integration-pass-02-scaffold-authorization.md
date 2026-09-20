# Dấu Việt Global — Consumer Integration Pass #2: Scaffold Authorization

Date: 2026-09-20
Status: **AUTHORIZED — BACKEND_FREEZE_PASS VERIFIED**

The backend-first gate is satisfied by the authoritative Phase 12/12.1 freeze evidence. Consumer packages are absent from `main`, so the next implementation operation is to create the approved monorepo consumers rather than attach an existing consumer.

Locked targets:
- `apps/web`: Next.js consumer for the locked Web UX baselines.
- `apps/mobile`: React Native + Expo consumer for iOS/Android; no WebView wrapper.
- `apps/admin`: dedicated Admin/CMS consumer.
- API remains `apps/api` and is frozen; consumers integrate against `docs/backend/BACKEND_HANDOFF.md` + `docs/backend/openapi.json`.
- shared brand/domain/api-client/i18n contracts belong under `packages/*`.

Scaffold must not redesign Home V5, Explore Map V3, Destination/Place V4, Story/Journey and other locked UX baselines. It must consume the canonical Brand Bible packages and preserve Vietnamese canonical + English V1 / translation-ready architecture.

Implementation sequence:
1. shared consumer foundations and API contract client boundary;
2. Web App Shell/navigation/responsive foundation;
3. Mobile Expo shell/navigation/responsive foundation;
4. Admin shell/auth/editorial foundation;
5. route/screen implementation in locked-baseline order;
6. brand/accessibility/provenance/runtime QA.

No backend/API/Prisma/database schema changes are authorized by this pass.
