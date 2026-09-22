# G06.5 Pre-Implementation Report — Knowledge & Place Data Ingestion

Status: **DRAFT FOR IMPLEMENTATION** (this report precedes any schema/migration/code change; it is
the mandatory pre-implementation audit + design gate the G06.5 phase brief requires before touching
`prisma/schema.prisma`).

Baseline: commit `9a16e4a9880c38a1ff973ec1dd1fb069b1445c01` on `main`, clean working tree, no
uncommitted changes, as of 2026-09-22. G06 ("Trip Planner + Cost Engine") is the most recent
completed phase (`docs/backend/GLOBAL_V2_ROADMAP.md`: "290/290 canonical gates PASS ... Verdict
COMPLETE, not LOCKED — not a Backend V2 Freeze claim"). No phase named G06.5 exists anywhere in the
roadmap or docs prior to this report — this is a genuinely new insertion between G06 and G07 (Trip
Collaboration, not started).

This report is based on a full audit of the actual repository state: `prisma/schema.prisma` (4,537
lines, single file — the only source-of-truth schema; copies under `node_modules/.prisma` are
generated client artifacts, not source), `apps/api/src` conventions (RBAC, audit/transaction
pattern, error-code registry, queue/Redis setup, config/env loading, seed, OpenAPI, E2E harness),
and the existing G02 provider-licensing precedent (`docs/backend/PROVIDER_LICENSING.md`,
`docs/backend/PROVIDER_RESEARCH.md`), which is the closest architectural relative to this phase and
is followed wherever its conventions apply.

---

## 1. Reuse inventory — what already exists (do not duplicate)

Every model named in brief section 80 exists except a generic cross-domain review-queue model
(which the codebase deliberately does not have — see 1.4 below):

| Model | Exists | Location (schema.prisma line) | Notes |
|---|---|---|---|
| `Source` | Yes | 2547 | Historical/editorial evidence — reused as promotion target, never written to directly by an adapter |
| `Citation` | Yes | 2600 | `source` relation is `onDelete: Restrict` — a cited Source can never be deleted |
| `HistoricalFact` | Yes | 2413 | Promotion target only; `certainty`/`editorialStatus` stay editorial-decided |
| `SourceDocument` | Yes | 2625 | OCR/document evidence — not reused directly by G06.5 (no OCR pipeline in scope) |
| `Place` / `Person` / `HistoricalEvent` | Yes | 1794 / 1883 / 1966 | Canonical entities; **zero schema edits**, zero new relations added onto them |
| `Country` / `Region` / `City` / `Destination` | Yes | 961 / 1027 / 1087 / 1148 | G01 geography — zero schema edits |
| `EntityAlias` | Yes | 868 | Generic `(entityType: EntityKind, entityId, locale, alias)` — reused once a candidate is promoted; never written pre-promotion |
| `MediaAsset` | Yes | 743 | Already has every rights field G06.5 needs (`license`, `rightsHolder`, `rightsStatus`, `attributionText`, `checksum`, `provenanceNote`, `creatorName`, `sourceId`) — **zero schema changes needed**, media promotion just populates these from Commons/candidate evidence |
| `ExternalProvider` + `ProviderCapability`/`ProviderIntegration`/`ProviderLicense`/`ProviderDataPolicy`/`ProviderAttributionRule` | Yes | 1573–1789 | G02 commercial-provider trust domain — **structurally distinct from `IngestionSource`** per canonical law (brief section 1); not reused as a base, but its `ProviderRightState`/`ProviderAttributionRequirement` **enums are reused verbatim** |
| `ProviderPolicyEvidence` | Yes | 1774 | FK'd to `ProviderLicense.id` specifically — cannot be reused for ingestion-source policy evidence (wrong FK target, wrong trust domain); G06.5 adds a structurally identical but separate `IngestionSourcePolicyEvidence` |
| `AuditLog` | Yes | 2673 | Append-only, generic `entityType: EntityKind` — reused as-is; `EntityKind` gains new values additively |
| `Revision` | Yes | 2652 | Generic snapshot store — available for future use, not required for G06.5 MVP (candidates are pre-canonical and don't need editorial revision history the way a published `HistoricalFact` does; `IngestionCandidate.status` transitions are already fully audited via `AuditLog`) |
| Generic review-queue model | **No** | — | Confirmed by direct audit: each domain (`FactReview`, `Contribution*`, `ProviderLicense.status`) has its own dedicated status enum + service-level transition logic. **This is the established convention G06.5 follows** — `IngestionCandidate.status` is its own explicit state machine, not a shared queue table. |

**RBAC** (`Role` enum, schema.prisma:37): `USER, CONTRIBUTOR, EDITOR, HISTORIAN_REVIEWER,
MODERATOR, ADMIN` — reused verbatim, no new role. `RolesGuard`/`@Roles()`
(`common/guards/roles.guard.ts`, `common/decorators/roles.decorator.ts`) reused verbatim.

**Audit transaction pattern** (Phase 12.1 fix, `modules/audit/audit.service.ts`): every mutating
G06.5 service method accepts `db: Db = this.prisma` and threads it through to
`this.audit.log(entry, db)`, exactly matching `sources.service.ts`'s `addDocument` pattern. This is
not optional — it is how the codebase avoids the exact orphaned-audit-row defect Phase 12.1 fixed.

**Error codes**: new `apps/api/src/common/errors/ingestion-error-codes.ts` (or module-local
equivalent), registered in `error-codes.spec.ts`'s `REGISTRIES` map — mandatory, matches every
prior domain.

**Queues**: BullMQ + Redis already wired (`app.module.ts`, `BullModule.forRootAsync`, Redis
service present in `docker-compose.yml`). Exactly one queue exists today (`media-processing`,
`attempts: 3` + exponential backoff) — this is the only convention precedent; G06.5's queues follow
the same naming/retry shape.

**Outbound HTTP**: **does not exist anywhere in this codebase.** No `axios`/`got`/`undici`/
`@nestjs/axios` dependency, no generic HTTP client. G05's "provider ingestion" is an admin-submitted
DTO upsert, never a live fetch — confirmed no prior phase has ever made a real outbound call to an
external API. **G06.5 is the first phase requiring genuine outbound network egress from the server
process** and must build a centralized safe-HTTP utility from scratch (timeouts, size caps, redirect
policy, User-Agent injection) per brief section 57. `S3Service`
(`modules/media/s3.service.ts`) is the structural precedent to imitate ("one injectable service,
nothing outside it touches the transport directly"), not a reusable HTTP layer itself.

**Config/env**: `@nestjs/config` + `class-validator` (`apps/api/src/config/configuration.ts`,
`env.validation.ts`). No external-API-key config group exists yet — G06.5 is first to add one.
`load-env.ts` must be imported first in any new worker entrypoint, exactly as `main.ts` and
`generate-openapi.ts` already do (a real, previously-found defect: Prisma's root `.env` auto-load
can silently win over `apps/api/.env` if this isn't done first).

**Seed**: `prisma/seed.ts` + `prisma/golden/*.ts`, idempotent upsert-by-natural-key convention. A
new `prisma/golden/knowledge-ingestion.ts` is added and wired into `index.ts`, seeding only
deterministic registry data (`IngestionSource` rows + their `IngestionSourcePolicy`) — never fake
historical facts or fake Google data, per brief section 62.

**Idempotency precedent**: G05's `@@unique([providerId, externalEntityId])` upsert key on
`Provider*Reference` is the direct template for `ExternalEntityIdentity`'s
`@@unique([sourceId, externalId])`.

---

## 2. Canonical law enforcement in the schema design

Per brief section 1 (`EXTERNAL RECORD != VERIFIED KNOWLEDGE`, `INGESTION SOURCE != HISTORICAL
SOURCE != COMMERCIAL PROVIDER`), every new model below:

- Has **zero Prisma relation** to `Place`/`Person`/`HistoricalEvent`/`Country`/`Region`/`City`/
  `Destination`/`HistoricalFact`. Where a candidate must reference a resolved canonical entity, it
  uses the same generic `(entityType: EntityKind, entityId: String)` pair `EntityAlias` and
  `AuditLog` already use — a soft reference, not a foreign key. This mirrors G02's own explicit
  design choice (`ExternalProvider` has zero relation to G01 geography) and means the G06.5
  migration touches **no existing table** — every change is a new table or an additive enum value.
- Never writes `HistoricalFact`, `Source`, `Citation`, or `MediaAsset` directly from adapter code.
  Only a promotion transaction (admin/editor-triggered, reusing existing service methods on
  `SourcesService`/`FactsService`(-equivalent)/`MediaAssetsService`) creates those rows, with
  `IngestionEvidence` as its input, never a raw external payload.

---

## 3. Proposed additive Prisma models

All new, all additive (one new migration, no edits to any existing model/migration). Field lists
below are the design-level contract; exact Prisma syntax is written directly into `schema.prisma` in
the implementation step following this report.

**`IngestionSource`** — acquisition-system registry root. `id, code (unique, e.g. "WIKIDATA"), name,
sourceClass: IngestionSourceClass, enabled: Boolean, createdAt, updatedAt`. Relations: `policy`
(1:1), `jobs`, `records`, `externalIdentities`.

**`IngestionSourcePolicy`** — 1:1 with `IngestionSource`. `id, sourceId (unique), enabled, transport:
IngestionTransport, authRequired: Boolean, rateLimitPerSecond?, rateLimitPerDay?, concurrencyLimit?,
maxRetries: Int, rawPayloadStorage: RawPayloadStoragePolicy, normalizedStorageRight:
ProviderRightState (reused enum), cacheMaxAgeSeconds?, retentionDays?, attributionRequirement:
ProviderAttributionRequirement (reused enum), licenseCode?, licenseUrl?, sourceUrl?,
commercialUseRight: ProviderRightState, mediaReusePolicy: ProviderRightState?,
lastPolicyReviewAt?, policyVersion: Int @default(1), createdById?, updatedAt`.

**`IngestionSourcePolicyEvidence`** — structurally identical to `ProviderPolicyEvidence` but FK'd to
`IngestionSourcePolicy`. `id, sourcePolicyId, title, sourceUrl, accessedAt, sourceType:
ProviderPolicyEvidenceSourceType (reused enum), notes?, createdById?, createdAt`.

**`IngestionJob`** — bounded unit of intended work. `id, sourceId, scopeType: IngestionScopeType
(COUNTRY|REGION|CITY|DESTINATION|EXTERNAL_IDS|EXPLICIT_ENTITY_SET), scopeParams: Json, label?,
createdById, createdAt, updatedAt`. Relation: `runs`, `checkpoint` (1:1, nullable).

**`IngestionRun`** — one auditable execution of a job. `id, jobId, sourceId, status: IngestionRunStatus
(QUEUED|RUNNING|SUCCEEDED|PARTIAL|FAILED|CANCELLED), trigger: IngestionRunTrigger
(MANUAL|SCHEDULED|RETRY), startedAt?, finishedAt?, adapterVersion, policyVersion, counts: Json,
cancelledById?, cancelledAt?, createdById?, createdAt`. Relations: `records`, `errors`.

**`IngestionRecord`** — raw per-external-record acquisition. `id, runId, sourceId, externalId,
retrievedAt, payloadHash, storageClassification: RawPayloadStoragePolicy, rawPayload: Json?,
normalizationStatus: NormalizationStatus (PENDING|NORMALIZED|FAILED|SKIPPED), createdAt`.
`@@unique([sourceId, externalId, payloadHash])` (idempotency + change-detection key — a materially
unchanged record re-fetch never creates a duplicate row); `@@index([sourceId, externalId])` for
"most recent version of this external record" lookups.

**`IngestionCandidate`** — source-neutral, normalized, pre-canonical entity proposal. `id, recordId?,
sourceId, candidateType: IngestionCandidateType (COUNTRY|REGION|CITY|DESTINATION|PLACE|PERSON|
EVENT|HISTORICAL_FACT|MEDIA), normalizationVersion: Int, normalizedData: Json, status:
IngestionCandidateStatus (UNRESOLVED|AUTO_MATCHED|NEEDS_REVIEW|APPROVED|REJECTED|MERGED),
mergedIntoCandidateId?, resolvedEntityType: EntityKind?, resolvedEntityId?, reviewedById?,
reviewedAt?, createdAt, updatedAt`. Relations: `evidence` (`IngestionEvidence[]`), `resolution`
(1:1, nullable), `externalIdentities`.

**`ExternalEntityIdentity`** — durable external-identity registry, namespaced by source. `id,
sourceId, externalId, entityType: EntityKind, candidateId?, resolvedEntityId?, state:
ExternalIdentityState (ACTIVE|STALE|DISAPPEARED), firstSeenAt, lastSeenAt, createdAt, updatedAt`.
`@@unique([sourceId, externalId])` — enforces brief section 24's "never assume numeric IDs from
different sources share identity" structurally, since the source is always part of the identity key.

**`EntityResolution`** — one resolution attempt/outcome per candidate. `id, candidateId (unique),
outcome: ResolutionOutcome (EXACT_MATCH|HIGH_CONFIDENCE_MATCH|AMBIGUOUS|NO_MATCH|CONFLICT),
matchedEntityType?, matchedEntityId?, signals: Json, confidenceScore?, autoResolved: Boolean,
decidedById?, decidedAt?, createdAt`. Only `EXACT_MATCH` may be `autoResolved: true`; every other
outcome requires a human `decidedById` before a candidate can move past `NEEDS_REVIEW`.

**`IngestionEvidence`** — provenance record backing a candidate, the direct input to a future
`Source`/`Citation` on promotion. `id, candidateId, sourceId, externalRecordId, sourceUrl?,
retrievedAt, licenseCode?, licenseUrl?, attributionText?, adapterVersion, payloadHash, policyVersion,
createdAt`.

**`IngestionError`** — classified failure record. `id, runId, recordId?, externalId?, errorClass:
IngestionErrorClass (TRANSIENT|PERMANENT|POLICY_REJECTED|AUTH_ERROR|VALIDATION_ERROR), message,
retryCount: Int, createdAt`.

**`IngestionCheckpoint`** — resumable cursor for a job. `id, jobId (unique), runId?, cursor: Json,
updatedAt`.

**New enums**: `IngestionSourceClass`, `IngestionTransport`, `RawPayloadStoragePolicy`,
`IngestionScopeType`, `IngestionRunStatus`, `IngestionRunTrigger`, `NormalizationStatus`,
`IngestionCandidateType`, `IngestionCandidateStatus`, `ExternalIdentityState`, `ResolutionOutcome`,
`IngestionErrorClass`.

**Reused enums (not redefined)**: `ProviderRightState`, `ProviderAttributionRequirement`,
`ProviderPolicyEvidenceSourceType`, `EntityKind` (gains additive values:
`INGESTION_SOURCE, INGESTION_JOB, INGESTION_RUN, INGESTION_CANDIDATE`, following the exact precedent
of G05's `20260910164912_g05_entity_kind_values` migration).

---

## 4. Migration plan

One new migration, `<timestamp>_g06_5_knowledge_ingestion`, containing only: the 12 new enums, the
12 new tables above, and the additive `EntityKind` values. No existing table is altered. No existing
migration is edited, renamed, or squashed. This matches every prior Global V2 phase's stated
discipline ("purely additive, zero destructive changes"). The repo's known recurring drift artifact
(stray `EntityKind.FACT`/trigram-index-drop noise appearing in `prisma migrate dev` diffs, called out
in every prior phase's final report) is stripped from the generated diff before applying, exactly as
every prior phase has done — not introduced by G06.5, not fixed by G06.5 either (out of scope per
brief section 98).

Path A (fresh DB: all migrations → seed twice → boot) and Path B (reconstruct pre-G06.5 state, apply
only the new migration, diff row counts/content hashes on locked tables) are both required before
final verdict, per brief sections 60/61.

---

## 5. RBAC decisions

Following the existing `AUTHORIZATION_MATRIX.md` precedent that provider/commercial/legal
configuration is `ADMIN`-only with no `EDITOR` carve-out (G02 Providers, G06 Admin/Cost Assumptions):

- `IngestionSource` / `IngestionSourcePolicy` / `IngestionSourcePolicyEvidence` mutation: **`ADMIN`
  only.**
- `IngestionJob` creation/cancellation: **`ADMIN` only** (a job defines what gets fetched and from
  where — same operational-config tier as provider integration).
- `IngestionCandidate` review (approve/reject/merge) for non-historical types (`COUNTRY`, `REGION`,
  `CITY`, `DESTINATION`, `PLACE`, `MEDIA`): **`EDITOR` or `ADMIN`** — matches the existing tier for
  Place/Destination/geography content edits.
- `IngestionCandidate` review/promotion for `PERSON`, `EVENT`, `HISTORICAL_FACT` candidates:
  **`HISTORIAN_REVIEWER` or `ADMIN`** — matches the existing `FactReview` tier exactly, including
  the existing self-approval restriction (a candidate's `createdById`-equivalent — here, whichever
  admin queued the ingestion run — must differ from `reviewedById` for sensitive fact promotion,
  mirroring `FactReview`'s separation-of-duties rule already enforced for hand-authored facts).
- `EntityResolution` manual override: same tier as the candidate it belongs to.
- Read-only candidate list/detail/preview endpoints: **`EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN`** (never
  `CONTRIBUTOR`/`USER` — candidates are pre-publication, brief section 2/23).

---

## 6. Adapters — live vs. fixture

Per `G06_5_SOURCE_POLICY_RESEARCH.md`'s findings:

| Source | G06.5 status |
|---|---|
| Wikidata | **Live** — CC0, no credential, bounded explicit-entity/country-scoped jobs only |
| Wikimedia Commons | **Live**, metadata-only — per-file license/attribution read from the API response, never assumed |
| UNESCO | **Live** via `data.unesco.org`'s public Explore API v2.1 (`whc001` dataset, CC BY-SA 4.0) — the paid `whc.unesco.org` XML syndication transport is never used |
| GeoNames | Contract implemented, **disabled by default** — activates only if the operator supplies a real `GEONAMES_USERNAME`; fixture-tested otherwise |
| OpenStreetMap | Contract implemented, **permanently disabled** in G06.5 — public Nominatim usage policy structurally forbids the bulk/systematic use this pipeline would otherwise need |
| Google Places | Contract implemented, **disabled by default** — no real `GOOGLE_PLACES_API_KEY` available in this environment; all proof is fixture/mocked-transport only, per brief section 52 |

Live pilot proof (brief sections 50/81) uses **Wikidata** as the primary real external call (no
purchased credential needed, fully permissive license) — matches the brief's explicit preference
order in section 50.

---

## 7. Pilot scope

Countries: Vietnam, Japan (existing Golden Dataset identities only — no new geography created).
Destinations checked against `prisma/golden/geography.ts` and confirmed to already exist: **Hà Nội,
Hội An, Huế** (via `prisma/golden/places.ts`'s "Cố đô Huế" Place), **Kyoto, Tokyo**. **Nara does not
exist anywhere in the Golden Dataset** (grepped — zero hits in `geography.ts`; only an unrelated
`HistoricalEvent` "Nara Period" exists in `japan.ts`, which is not a City/Destination). Per brief
section 49 ("do not fabricate missing Golden Dataset IDs"), **Nara is excluded from the G06.5 pilot
destination set** — the pilot uses Hà Nội, Hội An, Huế, Kyoto, Tokyo only.

---

## 8. Required environment variables

```
KNOWLEDGE_INGESTION_ENABLED=false      # master switch; ingestion module no-ops entirely when false
WIKIMEDIA_USER_AGENT=                  # required if Wikidata or Commons enabled — see policy doc §1/§2
WIKIMEDIA_CONTACT=                     # required if Wikidata or Commons enabled
GEONAMES_USERNAME=                     # optional — GeoNames adapter stays disabled (clean, not a startup failure) if empty
GOOGLE_PLACES_API_KEY=                 # optional — Google Places adapter stays disabled if empty
INGESTION_WORKER_CONCURRENCY=1
INGESTION_MAX_RETRIES=3
INGESTION_RAW_RETENTION_DAYS=90
```

No UNESCO credential is added (its live transport is keyless — see policy doc §3). Missing optional
credentials (`GEONAMES_USERNAME`, `GOOGLE_PLACES_API_KEY`) must produce a clean disabled adapter
state at boot, never an application startup failure — validated in `env.validation.ts` as optional
fields, not required ones.

---

## 9. Risks / blockers going in

1. **No outbound HTTP infrastructure exists** — building a centralized safe-fetch utility
   (timeouts/size caps/redirects/User-Agent) from zero is the single largest net-new piece of
   infrastructure this phase adds; no prior phase's code can be copied for this specific piece
   (only `S3Service`'s *structural* isolation pattern applies, not its transport code).
2. **GeoNames' exact global rate limit was not confirmed** on an official page reviewed this
   session (only per-endpoint free/premium deltas were found) — mitigated by defaulting to a
   conservative fixed `rateLimitPerSecond: 1` rather than an unconfirmed number, and the source
   ships disabled by default regardless.
3. **`whc.unesco.org` returned HTTP 403 to automated fetch** during this session's research (both
   direct and via a cached search-result summary) — mitigated by using the `data.unesco.org`
   DataHub transport instead, which fetched successfully and is independently documented as
   CC BY-SA 4.0 / keyless.
4. **No real credentials available** for GeoNames or Google Places in this environment — both ship
   disabled by default with fixture-only proof, which is explicitly permitted (not merely
   tolerated) by brief sections 51/52; this is not a gap in G06.5's completeness, it is the
   specified behavior for an unconfigured optional source.
5. **Scale of the brief** — 105 numbered sections spanning schema, six adapters, entity resolution,
   review workflow, provenance, queues, security, RBAC, audit, multilingual handling, and ~20
   "REQUIRED ... PROOF" live-verification sections. This is comparable in scope to all of G01–G06
   combined. Implementation proceeds in the order: schema/migration → outbound HTTP + policy gate
   → Wikidata/Commons/UNESCO adapters → normalization → entity resolution → review APIs → queue
   wiring → live pilot → the required proof suite (idempotency/change/ambiguity/policy/media/
   security/queue/restart/outage/RBAC/audit/public-leak/multilingual/Google-policy/Nominatim-safety)
   → final report. Given the scale, this session's final verdict may legitimately land on
   `COMPLETE_WITH_ENVIRONMENT_BLOCKERS` (for the credential-gated sources) rather than a bare
   `COMPLETE`, which is consistent with brief section 102's instruction not to claim `COMPLETE` with
   missing mandatory live/DB/security proof for something structurally outside this environment's
   reach (a purchased Google/GeoNames credential).

---

## 10. Acceptance gate manifest

A canonical `G06_5-GATE-001`-onward manifest, derived directly from this brief's numbered sections,
is produced alongside the schema implementation (next step) once the exact set of testable
assertions is finalized against real code — estimated at roughly 100–120 gates given the brief's
own ~105 sections, most of which map close to 1:1 onto a gate. The manifest and its final PASS/FAIL/
UNVERIFIED/PASS-NOT-APPLICABLE disposition is recorded in `G06_5_FINAL_REPORT.md`.
