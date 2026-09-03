# Dau Viet - Backend

Theo dau Viet Nam qua thoi gian. Living Digital Atlas of Vietnam - backend monorepo.

Full handoff documentation: [docs/backend/BACKEND_HANDOFF.md](docs/backend/BACKEND_HANDOFF.md)
Freeze/validation status: [docs/backend/BACKEND_FREEZE_REPORT.md](docs/backend/BACKEND_FREEZE_REPORT.md)
Implementation plan/phases: [docs/backend/BACKEND_PLAN.md](docs/backend/BACKEND_PLAN.md)

## Quick start

```bash
pnpm install
cp .env.example .env
pnpm infra:up          # Postgres+PostGIS, Redis, MinIO, Mailhog via Docker Compose
pnpm db:migrate:deploy # applies committed migrations
pnpm db:generate
pnpm db:seed           # golden dataset + dev accounts
pnpm api:dev           # http://localhost:3000, Swagger at /docs
```

Dev accounts created by the seed (password `DevPassword123!` for all): `admin@dauviet.vn`, `editor@dauviet.vn`, `historian@dauviet.vn`, `moderator@dauviet.vn`, `contributor@dauviet.vn`, `user@dauviet.vn`.

## Workspace layout

```
apps/api        NestJS backend (the only implemented app - see handoff doc)
prisma/         schema.prisma, migrations, seed.ts
docker-compose.yml   local infra (Postgres+PostGIS, Redis, MinIO, Mailhog)
docs/backend/    implementation plan, handoff, freeze report
```
