# Dau Viet - Trust Model (Phase 04)

Audience: any engineer/agent touching `HistoricalFact`, `Source`, `Citation`, `FactReview`,
`Revision`, `SourceDocument`, or `AuditLog`, and anyone building Admin/CMS review tooling
against them. This document is the contract for how a claim earns the right to be shown to
the public as trusted historical knowledge - if code disagrees with this doc, treat it as a
bug. It complements, and does not replace, `docs/backend/HISTORICAL_DOMAIN.md` (entities,
dates, translations) - this file is specifically about the chain from a raw editorial claim
to a publicly-displayed fact.

## 1. Philosophy

```
Historical entity (Place/Person/Event/Era/Territory)
    |
HistoricalFact          <- an atomic, sourced, editorially-gated claim
    |
Citation                <- links a Fact to a Source, with a locator and a verification state
    |
Source                  <- bibliographic/provenance record (book, archive, record, etc.)
    |
review / provenance      <- who verified the citation, who reviewed the fact, when, why
```

A `HistoricalFact` never becomes trusted historical knowledge simply because an editor typed
it into a textarea. It must carry at least one `Citation` to a real `Source`, and that
citation must have been reviewed and marked `VERIFIED`, before the fact can reach
`FactEditorialStatus.PUBLISHED` (`FactsService.setEditorialStatus`, unit-tested in
`facts.service.spec.ts`). This is enforced in the service layer, not just documented - see
section 4.

## 2. HistoricalFact

Fields (see `prisma/schema.prisma`): `factType` (`FactType`), a point-value historical date
(section 2 of `HISTORICAL_DOMAIN.md`), `certainty` (`FactCertainty`), `sensitivity`
(`FactSensitivity`), `editorialStatus` (`FactEditorialStatus`), `createdById`,
`reviewedById`/`reviewedAt` (denormalized pointer to the *latest publish approval* - the full
history lives in `FactReview`, section 5), and localized `statement` text via
`HistoricalFactTranslation` (never `statementVi`/`statementEn` columns - Vietnamese is the
canonical/source language, English may be translated later, and a translation's `method`
(`ORIGINAL`/`HUMAN`/`AI_ASSISTED`) and `status` are tracked separately so AI-assisted English
is never silently treated as reviewed historical content).

A fact relates to entities via real join tables (`FactPlace`/`FactPerson`/`FactEvent`/
`FactEra`/`FactTerritory`), each `@@unique` on its two foreign keys - the same (fact, place)
pair cannot be linked twice (tested in `schema-graph.spec.ts`).

### Certainty vs sensitivity - two different axes

- **`FactCertainty`** (`CONFIRMED`/`HIGH_CONFIDENCE`/`DISPUTED`/`UNCERTAIN`/
  `TRADITIONAL_ACCOUNT`/`ORAL_HISTORY`) describes *how sure we are the claim is true*. A
  `DISPUTED` or `TRADITIONAL_ACCOUNT` fact is not automatically blocked from publication -
  historians disagreeing about a claim, or a claim being a well-known oral tradition, is
  itself something Dau Viet should be able to publish responsibly, clearly labeled, with
  sources for each position (see section 6).
- **`FactSensitivity`** (`NORMAL`/`HIGH`/`TERRITORIAL`/`LEGAL`/`CONTESTED`) describes *how
  much editorial review process this claim needs before publication* - it is a workflow
  control, never an encoding of an actual geopolitical claim. A `TERRITORIAL` fact is not "a
  fact about disputed territory is true" - it is "this claim needs stronger review than a
  normal fact because its subject matter is territorial." See section 7.

These are independent: a `CONFIRMED`, `NORMAL`-sensitivity fact and a `DISPUTED`,
`TERRITORIAL`-sensitivity fact can both exist, and neither implies the other.

## 3. Source

Bibliographic/provenance-first (`prisma/schema.prisma` `Source` model): `sourceType`
(`SourceType` - `BOOK`/`PRIMARY_DOCUMENT`/`ARCHIVAL_DOCUMENT`/`MAP`/`MANUSCRIPT`/
`ACADEMIC_PAPER`/`MUSEUM_RECORD`/`GOVERNMENT_DOCUMENT`/`UNESCO_RECORD`/`NEWSPAPER`/
`PHOTO_ARCHIVE`/`ORAL_HISTORY`/`WEBSITE`/`OTHER` - a URL is not treated as equivalent
evidence to a primary document just because it's also a "source"), `title`, `author`,
`organization`, `publisher`, `publicationYear`, `isbn`/`issn`, `edition`, `volume`,
`archiveName`/`archiveCode` (institution-specific, never forced into one global format),
`originalLanguage`, `url`, `accessedAt`, `credibilityLevel` (`SourceCredibility` - see below),
`notes`. Every field beyond `sourceType`/`title` is optional - a 19th-century archive record
legitimately has no ISBN, and the API never fabricates a placeholder for one.

**`SourceCredibility`** (`PRIMARY`/`SECONDARY`/`TERTIARY`/`UNKNOWN`) is an editorial aid, not
an objective truth score. It helps an editor/reviewer decide how much scrutiny a citation
needs; it is never presented to end users as a universal ranking of "how true" a source is.

**Original identity is never overwritten.** `SourceTranslation` (`sourceId`, `locale`,
`displayTitle`) adds an optional localized *display* title; it does not replace `Source.title`
(the original/canonical title) or `Source.originalLanguage`. A frontend can show "Original
title: ... / English display: ..." but must never present a fabricated official English title
as if it were the source's real title.

### Duplicate prevention (spec sections 40/41)

`SourcesService.create` rejects a second `Source` with an already-used `isbn` or `issn`
against any non-archived source (`assertNoDuplicateIdentifier`) - these are the only fields
here that are genuinely globally-unique identifiers. Title/author/year fuzzy-matching is
deliberately **not** implemented: two different editions, or a translation and its original,
can legitimately share a title, and auto-merging them would destroy real bibliographic
distinctions. ISBN/ISSN format/checksum validation is intentionally **not** enforced - many
legitimate archive/pre-ISBN records have none, and old or foreign records can have
irregular-looking (but real) identifiers; over-validating would reject real data.

### Archive, never hard-delete (spec section 35)

`SourcesService.archive` (`PATCH /sources/:id/archive`, `HISTORIAN_REVIEWER`/`ADMIN`) sets
`archivedAt`/`archivedById`/`archiveReason` rather than deleting the row. It refuses
(`SOURCE_IN_USE`) if any `Citation` on the source belongs to a currently `PUBLISHED` fact -
archiving must never retroactively invalidate a live, trusted claim out from under it; retract
the fact(s) first if the source truly should no longer back a published claim. Archived
sources are excluded from `GET /sources` (public browse) but remain directly retrievable by
id, and `CitationsService.create` refuses to attach a *new* citation to an archived source
(`SOURCE_RESTRICTED`) - existing citations and their history are untouched either way.

## 4. Citation

Connects a `Fact` to a `Source` (`factId`, `sourceId`), with `pageFrom`/`pageTo`/`volume`/
`chapter`, a `locator`-style excerpt (`excerpt`, `editorNote`), and `verificationState`
(`CitationVerificationState`):

| State | Meaning |
|---|---|
| `UNVERIFIED` | Default on creation - a citation exists but has not been reviewed. |
| `VERIFIED` | A `HISTORIAN_REVIEWER`/`ADMIN` confirmed the source actually supports the claim. |
| `REJECTED` | Reviewed and found **not** to support the claim (bad source/misreading) - never satisfies the publication gate. |
| `DISPUTED` | The source may be legitimate, but historians disagree about the claim it's used for - distinct from `REJECTED`. |

**"A citation exists" is not "a citation has been reviewed."** This is the core distinction
the publication gate enforces (section 4 below) - `CitationsService.verify`/`reject`/
`dispute` are separate, `HISTORIAN_REVIEWER`/`ADMIN`-only actions
(`PATCH /citations/:id/verify|reject|dispute`) from `CitationsService.create` (any
`CONTRIBUTOR`+). `verify` refuses to re-verify an already-`VERIFIED` citation
(`CITATION_ALREADY_VERIFIED`).

## 5. Publication rule - the core invariant (spec section 13)

`FactsService.setEditorialStatus`, enforced when transitioning to `PUBLISHED`, in this order:

1. The fact must have at least one translation (`FACT_CITATION_REQUIRED` does not fire here -
   this is a separate, earlier check).
2. The fact must have at least one `Citation` at all (`FACT_CITATION_REQUIRED` if zero).
3. At least one of those citations must be `VERIFIED` (`CITATION_NOT_VERIFIED` if citations
   exist but none are verified - a fact with only `DRAFT`/`UNVERIFIED`/`REJECTED`/`DISPUTED`
   citations cannot publish).
4. If `sensitivity != NORMAL`, the acting user must hold `HISTORIAN_REVIEWER`/`ADMIN`
   (`FACT_REVIEW_REQUIRED` otherwise) **and** must not be the fact's own creator
   (`FACT_SELF_APPROVAL_FORBIDDEN` otherwise - separation of duties, section 7).

This is enforced in the service layer (never only in Admin UI), unit-tested in
`facts.service.spec.ts`, and identical in spirit to the invariant that has existed since
Phase 01 - Phase 04 did not weaken it, only added the explicit error codes (section 12 below)
and closed the "citation exists vs. reviewed" gap more explicitly with `REJECTED`.

### Exceptions

There is no `skipCitation=true` escape hatch anywhere in the codebase. No exception path was
added in Phase 04 - if a genuine system/editorial-metadata exception is ever needed, it must
be a distinct, restricted, audited code path, never a flag ordinary editors can set.

## 6. Disputed facts

A `DISPUTED`-certainty fact is represented with the *existing* model, deliberately without a
new `FactPosition`/`Claim` entity: multiple `Citation` rows (some possibly `DISPUTED`, some
`VERIFIED`) attached to the same `HistoricalFact`, whose `HistoricalFactTranslation.statement`
is written by the editor to describe the disagreement honestly (e.g. "Sources disagree on X;
Source A states Y, Source B states Z"), with `certainty = DISPUTED`. This was judged
sufficient per spec section 16's explicit guidance ("if current HistoricalFact + translations
+ citations + sensitivity/context fields can represent this cleanly, do not add speculative
models") - a dedicated claim/interpretation model was not added.

## 7. Territorial / contested facts - stronger controls (spec section 17)

`FactSensitivity.TERRITORIAL`/`LEGAL`/`CONTESTED`/`HIGH` all route through the *same*
sensitivity gate as section 5 step 4 - there is no separate, weaker path for territorial
facts. Concretely, for any non-`NORMAL` fact:

- The creator can never be the sole final approver (`FACT_SELF_APPROVAL_FORBIDDEN`).
- A `HISTORIAN_REVIEWER`/`ADMIN` who is not the creator must approve (`FACT_REVIEW_REQUIRED`
  if the actor lacks the role).
- Every transition is recorded in `FactReview` (section 9) and audited (section 12).

**No dedicated claimant/current-control/legal-context fields were added.** Spec section 17
allows this ("only add fields where they are meaningful and generic enough... do not seed
actual contested claims without verified evidence") - since no real territorial/contested
`HistoricalFact` exists in this codebase to populate them, adding speculative attribution
fields now would be exactly the kind of unfounded content the spec repeatedly warns against
seeding. If a real, sourced territorial fact is added in a future phase, extend
`HistoricalFactTranslation`/`Citation` first; only add dedicated fields if the existing model
proves insufficient in practice.

## 8. Fact editorial workflow

```
DRAFT -> SOURCE_CHECK -> FACT_REVIEW -> EDITORIAL_REVIEW -> READY -> PUBLISHED -> RETRACTED
  ^___________________________________________________________|         |
  |_________________________________________________________________ __|
```

`FactsService`'s `FORWARD_TRANSITIONS` table is the single source of truth for what's legal;
`DRAFT -> PUBLISHED` is never permitted for any fact, sensitive or not (no low-risk/system
content exception exists). Additional rules, all enforced in `setEditorialStatus`:

- Completing `FACT_REVIEW -> EDITORIAL_REVIEW` requires a `HISTORIAN_REVIEWER`/`ADMIN` - this
  is the historical-accuracy checkpoint itself, not a general editorial step
  (`FACT_REVIEW_REQUIRED` otherwise).
- Sending an already-in-progress fact back to `DRAFT` requires a documented `notes` reason -
  never a silent mutation (spec section 22).
- `PUBLISHED -> RETRACTED` requires a `HISTORIAN_REVIEWER`/`ADMIN` and a documented reason
  (section 10 below).
- `RETRACTED -> DRAFT` is allowed (an editor can rework and resubmit a retracted claim); there
  is no `RETRACTED -> PUBLISHED` shortcut - it must go through the full workflow again.

A focused service function (`resolveReviewDecision`), not a generic state-machine framework,
maps each transition to a `ReviewDecision` (`APPROVED` for forward moves, `REJECTED`/
`CHANGES_REQUESTED` for `DRAFT`/`RETRACTED` moves) - per spec section 19's explicit guidance
against building unnecessary state-machine infrastructure.

## 9. Review history (`FactReview`)

Added in Phase 04. Previously, `HistoricalFact.reviewedById`/`reviewedAt` were the *only*
record of review - a single pointer that is overwritten on every publish, losing all prior
review history (exactly the anti-pattern spec section 21 warns against). `FactReview` is now
a full append-only history: one row per transition, `{ factId, reviewerId, stage
(FactEditorialStatus the fact was leaving), decision (ReviewDecision), notes, createdAt }`.
`HistoricalFact.reviewedById`/`reviewedAt` are kept as a denormalized "latest publish
approval" convenience pointer - `FactReview` is the source of truth for anything historical.
`GET /facts/:id/reviews` exposes it. Written in the same DB transaction as the `Revision`
snapshot for that transition (`FactsService.snapshot`, spec section 48) - a fact's history can
never end up with a review decision but no matching snapshot, or vice versa.

## 10. Revision and retraction

**Revision strategy (spec section 24):** the existing generic `Revision` model
(`entityType`/`entityId`/`snapshot: Json`/`changeNote`/`changedById`/`factId`) from Phase 03
was reused rather than adding a typed `FactRevision` - it already captures a full JSON
snapshot of the fact (translations, citations, dates, certainty, sensitivity, links) on every
`create`/`setEditorialStatus` call, tagged with `factId` for fact-scoped queries. It was
judged to retain enough typed meaning for this purpose (a JSON snapshot plus a stage-tagged
`changeNote` answers "what did this fact look like, and why did it change" without needing a
column-per-field revision table). If a future phase needs structured field-level diffing
(e.g. "what exactly changed between revision N and N+1"), that is a real reason to introduce
a typed `FactRevision` - not done here since nothing currently consumes revisions that way.

**Retraction (spec sections 36/37):** `FactEditorialStatus.RETRACTED` (added in Phase 04) is
the controlled way to remove a previously-`PUBLISHED` claim from public output without
destroying its history. Unlike `PublicationStatus.ARCHIVED` (used by Place/Person/Event/etc.),
facts get their own status value rather than reusing `PublicationStatus`, because
`FactEditorialStatus` is already its own closed workflow enum distinct from
`PublicationStatus` (see `HISTORICAL_DOMAIN.md` section 7) - adding a second, unrelated enum
to a fact would be more confusing than adding one value to the one it already has. A
retraction requires a `HISTORIAN_REVIEWER`/`ADMIN` and a documented reason (`notes`), is
recorded as a `FactReview` (`decision = REJECTED`, `stage = PUBLISHED`) plus a `Revision`
snapshot plus an audit entry - the fact's full prior state, citations, and review history are
untouched. `getPublicSourcesForEntity` (section 11) and every public read path treat
`RETRACTED` exactly like every other non-`PUBLISHED` status: excluded.

**Source archive** (section 3 above) is the equivalent policy for `Source` - archive/deactivate,
never hard-delete, blocked while a published fact still depends on it.

## 11. SourceDocument access & rights

`SourceDocument` (`sourceId`, `mediaAssetId`, `pageCount`, `extractedText`, `usageRights`,
`rightsHolder`, `accessPolicy: AccessPolicy`) represents a digitized page/scan attached to a
`Source`. `AccessPolicy` (`PUBLIC`/`PREVIEW_ONLY`/`METADATA_ONLY`/`RESTRICTED`) is enforced in
two independent places, both server-side:

1. **`SourcesService.redactDocumentForPublic`** - used by the public `GET /sources/:id`,
   strips `extractedText` unless the document is `PUBLIC` (or `PREVIEW_ONLY`, which keeps a
   text preview but never a full asset).
2. **`SourcesService.getDocumentForViewer`** (`GET /sources/:id/documents/:documentId`,
   any authenticated user) - full-fidelity access to a `METADATA_ONLY`/`RESTRICTED` document
   requires `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN` (`DOCUMENT_ACCESS_DENIED` otherwise);
   `PUBLIC`/`PREVIEW_ONLY` documents are readable by any authenticated caller.

**Underlying `MediaAsset` access policy is synced, not independent.** A `MediaAsset` carries
its own `accessPolicy` (it can be attached to galleries/avatars/etc. independently of any
`SourceDocument`), defaulting to `PUBLIC` on registration. Before Phase 04,
`SourcesService.addDocument` never touched the underlying asset's policy - a `RESTRICTED`
`SourceDocument` could point at a `MediaAsset` still flagged `PUBLIC`, and (a second, now-fixed
bug - see below) `GET /media/:id` would happily hand back a full download URL for
`PREVIEW_ONLY`/`METADATA_ONLY`/`RESTRICTED` assets regardless. `addDocument` now tightens
(never loosens) the asset's `accessPolicy` to match the document's when the document is
non-`PUBLIC`, inside the same transaction as the `SourceDocument` insert.

**Bug fixed in Phase 04:** `MediaService.withPublicUrl` previously returned a resolvable URL
for every `accessPolicy` except `RESTRICTED` - meaning `PREVIEW_ONLY` and `METADATA_ONLY`
assets leaked a full download link through the public, unauthenticated `GET /media/:id`. It
now resolves a URL only for `accessPolicy === PUBLIC`; every other policy returns `url: null`
through that unauthenticated path (unit-tested in `media.service.spec.ts`). There is currently
no authenticated "full download" endpoint for a non-public `MediaAsset` outside the
`SourceDocument` path above - documented as a known limitation, not silently worked around.

**Rights fields** (`usageRights`, `rightsHolder` on `SourceDocument`; `license`,
`rightsHolder`, `isAiGenerated`/`aiDisclosure` on `MediaAsset`) store provenance/policy
metadata only - this is not a legal opinion engine, and the backend does not attempt to
determine copyright status automatically.

**Phase 05 addendum (full contract: `docs/backend/MEDIA_ARCHITECTURE.md`):** `GET /media/:id`
now additionally requires `status === READY` before returning anything beyond a 404 - a
`SourceDocument`'s underlying asset being `accessPolicy: PUBLIC` no longer matters if the
asset itself is still `PENDING_UPLOAD`/`PROCESSING`/`QUARANTINED`. `SourceDocument` also
gained an OCR-status foundation (`ocrStatus`/`ocrConfidence`/`ocrReviewedById`/
`ocrReviewedAt`) - `extractedText` remains extraction assistance only, never a substitute for
a real `Citation` when quoting a document as evidence.

## 12. Community trust boundary (spec section 44)

A source attached to a `CommunityStory`, or a document attached to a `Contribution`, is never
automatically trusted historical evidence. Structurally: neither `CommunityStory` nor
`Contribution` has any relation field to `Source` or `Citation` at all (verified statically in
`schema-graph.spec.ts` - "a CommunityStory/Contribution has no direct relation to Source or
Citation"). The only path from community-submitted material to a citable `Source` is manual:
an editor/historian reviews the contribution and creates a real `Source` record (and
`SourceDocument` if a scan is involved) through the normal, role-gated `POST /sources` /
`POST /sources/:id/documents` endpoints - there is no automatic promotion.

## 13. Audit

`AuditService.log` (append-only, no update/delete method anywhere in the codebase) is called
for every trust-relevant mutation: fact create/link/transition, citation create/verify/
reject/dispute, source create/archive, source-document create (including the access-policy
sync decision), and every review decision. `GET /admin/audit` (`ADMIN`/`MODERATOR`/
`HISTORIAN_REVIEWER`) exposes it; no controller anywhere exposes an audit-log write/delete
endpoint, so a normal editor cannot mutate it through any documented API path.

## 14. Error codes (spec section 51)

`apps/api/src/common/errors/trust-error-codes.ts`:

| Code | Thrown by | Meaning |
|---|---|---|
| `FACT_CITATION_REQUIRED` | `FactsService.setEditorialStatus` | Publishing a fact with zero citations. |
| `CITATION_NOT_VERIFIED` | `FactsService.setEditorialStatus` | Citations exist, but none are `VERIFIED`. |
| `FACT_REVIEW_REQUIRED` | `FactsService.setEditorialStatus` | A reviewer role or a documented reason is required for this transition (sensitive-fact publish, `FACT_REVIEW` completion, `DRAFT`/`RETRACTED` regression). |
| `FACT_SELF_APPROVAL_FORBIDDEN` | `FactsService.setEditorialStatus` | The fact's own creator tried to publish a sensitive fact. |
| `FACT_INVALID_TRANSITION` | `FactsService.setEditorialStatus` | The requested `editorialStatus` move is not in `FORWARD_TRANSITIONS`. |
| `CITATION_ALREADY_VERIFIED` | `CitationsService.verify` | Re-verifying an already-`VERIFIED` citation. |
| `SOURCE_IN_USE` | `SourcesService.archive` | The source is cited by a `PUBLISHED` fact. |
| `SOURCE_RESTRICTED` | `CitationsService.create` | The referenced source is archived and cannot take new citations. |
| `DOCUMENT_ACCESS_DENIED` | `SourcesService.getDocumentForViewer` | A `METADATA_ONLY`/`RESTRICTED` document was requested by a caller without `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN`. |

## 15. Public API surface

`GET /v1/places/:slug/sources`, `GET /v1/people/:slug/sources`, `GET /v1/events/:slug/sources`
(all `@Public()`, added for people/events in Phase 04, places already existed) share one
implementation, `getPublicSourcesForEntity` (`apps/api/src/modules/facts/fact-sources.util.ts`)
- one query per entity (not N+1 per fact), returning the deduplicated set of `Source` rows
reachable through that entity's **`PUBLISHED`** facts only. `DRAFT`/`SOURCE_CHECK`/
`FACT_REVIEW`/`EDITORIAL_REVIEW`/`READY`/`RETRACTED` facts never contribute a source to this
response (unit-tested in `fact-sources.util.spec.ts`), regardless of what their citations look
like - this is the same "public filtering is a server-side guarantee, not a frontend concern"
principle documented for `PublicationStatus` in `HISTORICAL_DOMAIN.md` section 7. `Source`
responses never include internal reviewer notes, restricted object paths, or audit metadata -
only the bibliographic fields listed in section 3.

## 16. Hoang Sa / Truong Sa (spec section 54)

Both remain seeded only as real `ARCHIPELAGO` `Place` rows with approximate public
coordinates and an English alias (see `HISTORICAL_DOMAIN.md` section 3) - Phase 04 added no
`HistoricalFact`, `Citation`, or `Territory` row referencing either. `trust-regression.spec.ts`
statically asserts: no `Territory` rows are seeded at all, the two seeded facts (1010 capital
move, 1954 Dien Bien Phu) link to neither archipelago, and the `PlaceSeedSpec` type carries no
claimant/sovereignty/legal-status field. If real, sourced territorial data for these (or any
disputed area) is ever added, it must go through `Territory` + `TerritoryGeometryRevision`
with a real `Source`/verified `Citation` and `HISTORIAN_REVIEWER`/`ADMIN` sign-off (existing
Phase 03 policy, unchanged) - never fabricated from model memory, and never bypassing the
sensitive-fact workflow in section 7 above.
