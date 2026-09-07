# Dau Viet - Contribution Architecture (Phase 09)

Audience: any engineer/agent touching `Contribution`, `ContributionSource`, `ContributionMedia`,
`ContributionReviewNote`, or `ContributionCatalogueResult`, and anyone building Admin/CMS review
tooling against them. This document is the contract for how community/user-submitted material
moves from a raw submission to (optionally) real catalogue material - if code disagrees with
this doc, treat it as a bug. It complements, and does not replace, `docs/backend/TRUST_MODEL.md`
(the Source/Citation/HistoricalFact trust chain a Contribution can only ever feed into
explicitly) and `docs/backend/COMMUNITY_ARCHITECTURE.md` (the separate, public UGC surface).

## 1. Philosophy - the core invariant

```
Contribution ACCEPTED   !=   HistoricalFact PUBLISHED
Contribution ACCEPTED   !=   Source VERIFIED
CommunityStory VERIFIED_CONTRIBUTION   !=   HistoricalFact
```

The contribution system is an **intake and review workflow**, never a shortcut into verified
historical knowledge. A contribution can become trusted catalogue material only through an
explicit, separately-audited **catalogue action** (section 8) - never merely by advancing its
own review status, however far.

```
Community / User submission
          |
     Contribution  (SUBMITTED)
          |
      TRIAGE                     structural/spam/completeness screening
          |
  PROVENANCE_REVIEW               where did this come from? who owns it? can it be supported?
          |
 HISTORICAL_REVIEW                relevance/plausibility/context - never auto-verifies truth
          |
 ACCEPTED                         review complete enough to accept the material
          |
 CATALOGUED                       >=1 canonical record was deliberately created/linked
          |
 Source / SourceDocument / MediaAsset promotion
          |
 optional future HistoricalFact (deferred - section 11)
```

## 2. What already existed vs. what Phase 09 added

Phase 01 (`init` migration) already had a minimal `Contribution`/`ContributionMedia`/
`ContributionReviewNote` skeleton: the seven-value `ContributionStatus` enum, a flat
`FORWARD`-only transition table, and a bare `advance(id, reviewerId, { status, note })` method
with no role separation beyond a blanket `EDITOR/HISTORIAN_REVIEWER/ADMIN` gate, no rights/
provenance review fields, no cataloguing action of any kind, and a `GET /contributions/:id` with
**no ownership check at all** - any authenticated user could read any other user's contribution
detail by id. Phase 09 kept the existing status enum and table names (reuse, not a rewrite) and
added: a `ContributionType` taxonomy, structured provenance evidence (`ContributionSource`),
reviewer-only provenance/rights/sensitivity assessment fields, a full review-decision vocabulary
(`ContributionReviewDecision`) with self-review refusal and per-stage role gates, optimistic
concurrency (`version`), soft withdrawal, a `needsInfo` request-more-information loop, and the
entire cataloguing surface (`ContributionCatalogueResult` + three catalogue actions). The
ownership gap above is fixed: `GET /contributions/mine/:id` now enforces owner-or-reviewer
access (see section 10).

## 3. Contribution status semantics

| Status | Meaning |
|---|---|
| `SUBMITTED` | The submitter has posted the material. Editable by its author, or withdrawable. |
| `TRIAGE` | Basic completeness/scope/spam/copyright screening - **not** historical truth verification. |
| `PROVENANCE_REVIEW` | Where did this come from? Who owns/created it? Can the claimed provenance be supported? |
| `HISTORICAL_REVIEW` | Historical relevance/authenticity/context assessment - still does not create a `HistoricalFact`. |
| `ACCEPTED` | Review is complete enough to accept the material as worth cataloguing. **Not** "verified as historically true." |
| `CATALOGUED` | One or more canonical catalogue records (`Source`/`SourceDocument`/`MediaAsset`) were deliberately created/linked via a catalogue action. |
| `REJECTED` | Rejected, with a reviewer, a documented reason, and a timestamp. Never hard-deleted; a fresh contribution may be resubmitted. |

`ContributionsService.submitReview` is the single centralized transition method (spec section 3/27,
mirroring `FactsService.setEditorialStatus`'s "one function is the source of truth" pattern). The
client never sends a target status directly - it sends a `decision`:

| Decision | Effect |
|---|---|
| `APPROVE` | Moves the contribution one stage forward (`FORWARD` table), if the actor holds the role required to *complete* the current stage (section 6). **Never valid from `ACCEPTED`** - `ACCEPTED -> CATALOGUED` only ever happens through a catalogue action (section 8), enforced by `FORWARD['ACCEPTED']` being absent. |
| `REJECT` | Moves to `REJECTED`. Requires a documented `notes` reason; sets `rejectionReason`/`rejectedById`/`rejectedAt`. |
| `REQUEST_INFO` | Leaves `status` unchanged, sets `needsInfo = true` (section 5) - the "return for more information without rejecting" concept from spec section 23, deliberately expressed as a review decision rather than a new workflow status, to avoid polluting the main status enum. |
| `RETURN_TO_PREVIOUS_STAGE` | Moves exactly one stage backward (`BACKWARD` table). Requires a documented `notes` reason, same principle as `FactsService`'s regression-requires-reason rule. Never reachable from `SUBMITTED`/`CATALOGUED`/`REJECTED`. |

Every decision is refused if `reviewer.id === contribution.contributorId` -
`CONTRIBUTION_SELF_REVIEW_FORBIDDEN`, checked once at the top of `submitReview` so it applies
uniformly to all four decisions, not just `APPROVE` (spec section 25: "the submitter cannot be
sole reviewer").

## 4. Contribution types

`ContributionType`: `DOCUMENT`, `PHOTO`, `ARCHIVAL_PHOTO`, `MAP`, `ORAL_HISTORY`,
`PERSONAL_MEMORY`, `FAMILY_ARCHIVE`, `BOOK_REFERENCE`, `LOCAL_HISTORY`, `CORRECTION`, `OTHER`.
Deliberately not narrower - spec section 5 explicitly warns against an over-fragmented taxonomy.
`CORRECTION` is its own type because it targets an *existing* canonical record rather than
contributing new material (section 9); every other type behaves the same at the workflow level
and is distinguished only by which fields/attachments are meaningful for it (e.g. oral-history
fields below are populated only for `ORAL_HISTORY`).

## 5. Fields on `Contribution`

Beyond the original title/description/media/place fields: `type`, `originalLocale` (defaults
`'vi'`, never silently translated - AI-assisted translation is a separate, disclosed layer added
later, per spec section 7), `linkedEntityType`/`linkedEntityId` (contextual-only tag for
`PERSON`/`EVENT`/`ERA`/`TERRITORY` - deliberately excludes `PLACE`, which already has its own
`placeId` FK), `correctionTargetType`/`correctionTargetId` (section 9),
`submitterDeclaration`/`attribution` (submitter's own claims, section 7 below),
`provenanceConfidence`/`rightsReviewState`/`sensitivity` (reviewer-only assessments, section 6/7),
`rejectionReason`/`rejectedById`/`rejectedAt`, `withdrawnAt`, `needsInfo`,
`lastReviewedById`/`lastReviewedAt` (a denormalized "latest reviewer touched this" convenience
pointer - `ContributionReviewNote` remains the append-only source of truth for full history, same
convention as `HistoricalFact.reviewedById`), and `version` (optimistic concurrency, section 12).

**Linked entities are contextual metadata only.** A user linking a photo to "Hoang thanh Thang
Long" does not verify the photo's date/provenance - linking never mutates any trust-relevant
field, and is existence-checked (`assertLinkedEntityExists`/`assertCorrectionTargetExists`)
against a closed allow-list, never a trusted arbitrary `(type, id)` pair (same pattern as
`ReportsService.assertTargetExists`/`EditorialService.RESOLVABLE_KINDS`).

## 6. Provenance evidence (`ContributionSource`)

Structured evidence a submitter points to: `referenceType` (`ContributionSourceType` -
`BOOK`/`ARCHIVE`/`WEBSITE`/`FAMILY_RECORD`/`ORIGINAL_DOCUMENT`/`ORAL_TESTIMONY`/`INSTITUTIONAL`/
`OTHER` - a distinct, smaller enum from the canonical `SourceType`, since a submitter's claim is
not the same kind of thing as a reviewed bibliographic record), `claimedCreator`/`claimedOwner`,
`acquisitionMethod`, `approxDateLabel`, `sourceOrganization`, `archiveCatalogRef`,
`publicationInfo`, `url`, `notes`, and an optional `evidenceMediaAssetId` (ownership-checked the
same as any other media reference). **Never automatically creates a canonical `Source`** - it
exists purely to give a `PROVENANCE_REVIEW` reviewer something concrete to assess
(`POST /contributions/:id/provenance-sources`, owner while editable or any reviewer at any time).
Unknown fields stay `null` - nothing here is ever fabricated to fill a gap.

**Provenance confidence** (`ProvenanceConfidence`: `UNASSESSED`/`LOW`/`MEDIUM`/`HIGH`/
`CONFIRMED`/`DISPUTED`) is a reviewer-only field (`PATCH /admin/contributions/:id/provenance-
confidence`, self-review refused) - an internal assessment of how well-supported the claimed
provenance is, never historical certainty (that remains `FactCertainty`, only reachable via the
real `HistoricalFact` workflow) and never exposed publicly as an unqualified trust label.

## 7. Rights: submitter claim vs. reviewer decision

Two structurally separate fields, never conflated:

- **`submitterDeclaration`** (`SubmitterRightsDeclaration`: `OWN_MATERIAL`/`HAVE_PERMISSION`/
  `PUBLICLY_AVAILABLE`/`UNKNOWN`) - the submitter's own claim at creation time. A claim, never an
  adjudicated rights state.
- **`rightsReviewState`** (`ContributionRightsReviewState`: `UNREVIEWED`/`NEEDS_INFORMATION`/
  `APPROVED_FOR_CATALOGUE`/`RESTRICTED`/`REJECTED`) - reviewer-only
  (`PATCH /admin/contributions/:id/rights-review`, self-review refused, same
  never-self-declared-`PUBLIC_DOMAIN` principle as `MediaService.updateRights` in
  `MEDIA_ARCHITECTURE.md`). **Cataloguing refuses outright unless this is
  `APPROVED_FOR_CATALOGUE`** (`CONTRIBUTION_RIGHTS_INCOMPLETE` otherwise) - a contributor cannot
  self-approve their own public-display rights by construction, since `submitReview`/
  `setRightsReview`/every catalogue action refuse when the actor is the contribution's own author.

`attribution` (`ContributionAttribution`: `NAMED`/`ANONYMOUS`/`INSTITUTIONAL`) is a separate,
explicit submitter choice for public credit if the material is ever catalogued - never inferred
from upload alone (spec section 65), and never automatically exposing the account's real display
name without this being set.

## 8. Cataloguing - the explicit promotion boundary

Three privileged, audited, idempotent actions, all `HISTORIAN_REVIEWER`/`ADMIN` only (a stricter
gate than ordinary review - the same tier as `PATCH /sources/:id/archive`), all refusing
self-cataloguing, all requiring `status IN (ACCEPTED, CATALOGUED)` and `rightsReviewState =
APPROVED_FOR_CATALOGUE` (`ContributionsService.assertCatalogueAllowed`):

1. **`POST /admin/contributions/:id/catalogue/source`** - creates a real `Source` via
   `SourcesService.create` (reusing its existing ISBN/ISSN dedup, section 9 below), inside the
   same DB transaction as the `ContributionCatalogueResult` row and the `ACCEPTED -> CATALOGUED`
   status flip. **`credibilityLevel` is always the reviewer's own explicit input on the
   request body - never copied from `Contribution`/`ContributionSource`/`provenanceConfidence`**
   (spec section 32: a contribution's own claimed trust never becomes the canonical Source's
   trust classification).
2. **`POST /admin/contributions/:id/catalogue/document`** - refuses outright unless this
   contribution already has a catalogued `Source` (`CONTRIBUTION_CATALOGUE_NOT_ALLOWED`
   otherwise - a `SourceDocument` can never exist without a real `Source` to attach to). Reuses
   `SourcesService.addDocument`, so it inherits the same `METADATA_ONLY` default and
   MediaAsset-access-policy-tightening behavior documented in `TRUST_MODEL.md` section 11 -
   **an unknown-rights contributed document is never defaulted to `PUBLIC`.**
3. **`POST /admin/contributions/:id/catalogue/media`** - promotes an already-attached
   `ContributionMedia` row (refuses a `mediaAssetId` not attached to this contribution,
   `CONTRIBUTION_MEDIA_NOT_OWNED`) via `MediaService.promote`, which only ever writes
   `MediaAsset.type`/`sourceId` - e.g. a plain `PHOTO` promoted to `ARCHIVAL_PHOTO`, or a
   contributed image promoted to `MediaType.MAP`. **Promoting to `MAP` never creates
   `TerritoryGeometry`** - `MediaAsset` has no schema-level relation to `Territory` at all (see
   `schema-graph.spec.ts`/`trust-regression.spec.ts`), so this is a structural guarantee, not just
   a behavioral one. The original contribution's provenance trail (uploader, `ContributionMedia`
   row, `ContributionSource` evidence) is untouched - the same binary object gains a canonical
   role without losing its contribution history.

**`ACCEPTED -> CATALOGUED` happens automatically** the moment the *first* catalogue result is
created for a contribution (`markCataloguedIfNeeded`) - never through `submitReview`, and never
regressing an already-`CATALOGUED` contribution. A contribution can accumulate more than one
catalogue result (e.g. a `Source`, its `SourceDocument`, and a promoted `MediaAsset`) - modeled as
a set of `ContributionCatalogueResult` rows (`resultType` + one of `sourceId`/`sourceDocumentId`/
`mediaAssetId`), deliberately not a single nullable `createdSourceId` column on `Contribution`
itself (spec section 29).

## 9. Idempotency and transaction safety

Each catalogue action checks for an existing `ContributionCatalogueResult` of the relevant
`resultType` (and, for media, the specific `mediaAssetId`) *before* creating anything, and simply
returns the existing result if found - a second call never creates a second `Source`/
`SourceDocument`/duplicate media promotion. `SourcesService.create`/`addDocument` and
`MediaService.promote` all accept an optional `Prisma.TransactionClient` parameter (defaulting to
the ambient `PrismaService`) specifically so `ContributionsService`'s catalogue actions can fold
the canonical-record write and the `ContributionCatalogueResult`/status-flip write into one real
`$transaction` - a crash partway through can never leave a canonical `Source` with no linked
result row. `SourcesService.create` additionally still runs its own ISBN/ISSN duplicate check
(`assertNoDuplicateIdentifier`) against the same transaction client, so cataloguing a contribution
whose claimed book already exists as a `Source` is rejected the same way a direct `POST /sources`
call would be. **True concurrent-write races (two reviewers finalizing at once against a live
database) remain `UNVERIFIED_LIVE_DB`** - the `expectedVersion` optimistic-concurrency check
(section 12) is the mitigation the unit tests can actually verify.

## 10. Privacy, visibility, and the submitter's own view

- `GET /contributions/mine/:id` (submitter's own detail) never includes internal
  `ContributionReviewNote` text - only `rejectionReason` (a reviewer-authored field meant to be
  read by the submitter) is exposed there. Full review history, provenance evidence, and
  catalogue results are visible only via `GET /admin/contributions/:id`
  (`EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN`).
- `GET /contributions/mine/:id` and `PATCH /contributions/mine/:id` both enforce
  owner-or-reviewer access (`assertOwnerOrPrivileged`) - fixing the pre-Phase-09 gap where any
  authenticated user could read any contribution by id.
- **Raw contributions never appear in public search or editorial curation** - `SearchService` has
  no `searchContribution` runner, and `EditorialService.RESOLVABLE_KINDS` is `STORY`/`JOURNEY`/
  `PLACE` only (never `CONTRIBUTION`), both asserted in `trust-regression.spec.ts`.
- A `CommunityStory` may reference its related `Contribution` only if the product later chooses
  to wire that link explicitly - no such relation exists in the schema today, and none is
  required (spec section 68: not every `CommunityStory` needs a `Contribution`, and vice versa).

## 11. HistoricalFact / Citation boundary - deferred by design

**No automatic `HistoricalFact` draft creation was implemented in Phase 09.** Spec section 37
explicitly permits deferring this ("If not necessary now, defer... and document why"). The reason:
there is no reviewed, non-fabricating mapping yet from an arbitrary contribution's free-text
`title`/`description`/`contextNote` to a well-formed `FactType` + historical date + citable
statement - building that mapping now would mean either inventing placeholder historical claims
from unstructured submitter text, or building a non-trivial NLP/extraction pipeline with no real
data to validate it against. If a future phase adds this, the contract is fixed regardless of
implementation: any Fact created from a contribution **must** start at `HistoricalFact.DRAFT` and
then pass through the full, unmodified Phase 04 workflow (citations, review, sensitivity gate) -
it is never `READY`/`PUBLISHED`, and is never considered verified merely because the contribution
was `ACCEPTED`. Similarly, a catalogued `Source` may later support ordinary `Citation` creation
through the normal `POST /citations` endpoint, but no citation is ever auto-created for an
unrelated `HistoricalFact` just because a contribution was catalogued - citation remains
fact-specific, unchanged from `TRUST_MODEL.md` section 4. `SourceDocument.extractedText`/
`ocrStatus` (OCR) remain exactly as unverified as documented in `TRUST_MODEL.md` section 11/Phase
05 addendum - OCR output from a contributed document is never transformed into `HistoricalFact`
text automatically, and the OCR engine itself is `UNVERIFIED_OCR_ENGINE` (no live engine available
in this environment, unchanged from prior phases).

## 12. Concurrency

`Contribution.version` (`Int`, default `0`) is required on every reviewer/admin write
(`submitReview`, `setRightsReview`, `setProvenanceConfidence`, `setSensitivity`, all three
catalogue actions) as `expectedVersion` in the request body. A mismatch throws
`CONTRIBUTION_VERSION_CONFLICT` before any write happens; every successful write increments it.
This is the structural guard against two reviewers independently finalizing the same contribution
- the actual concurrent-request race is `UNVERIFIED_LIVE_DB` (no live database in this
environment), but the version-mismatch *rejection* itself is unit-tested directly.

## 13. Correction contributions

`type = CORRECTION` requires `correctionTargetType`/`correctionTargetId`
(`CONTRIBUTION_INVALID_TARGET` if either is missing, or if `correctionTargetType` is outside the
closed allow-list `PLACE`/`PERSON`/`EVENT`/`ERA`/`STORY`/`SOURCE`/`FACT`), existence-checked
against the real target row before the contribution is created. A correction is a contribution
like any other - it becomes a review task, never a direct mutation of the canonical target record.
There is no "apply this correction automatically" action anywhere in this codebase.

## 14. Oral history and personal memory

Oral-history contributions (`type = ORAL_HISTORY`) use the same `Contribution` shape as every
other type - speaker/interviewer/recording-date/location/language/transcript/consent all fit into
existing free-text fields (`description`, `contextNote`, `originSource`, `currentOwner`,
`sharingRights`, `approxDateLabel`) rather than a dedicated `OralHistoryContribution` model, per
spec section 16's explicit guidance against speculative single-purpose models. An oral history is
never treated as automatically confirmed historical fact - if it later supports a
`HistoricalFact`, that fact's `certainty` may be set to `FactCertainty.ORAL_HISTORY` (an existing
Phase 04 enum value), but only through the normal, unmodified Fact workflow (section 11).
`PERSONAL_MEMORY`-type contributions and `CommunityStory` are two distinct, non-cloning paths -
nothing in this codebase silently copies one into the other; if a submitter wants both, that is
two separate, explicitly-created rows.

## 15. Withdrawal and removal

A submitter may withdraw their own contribution (`POST /contributions/mine/:id/withdraw`) any time
before it is `CATALOGUED` - sets `withdrawnAt` (soft, never deletes the row or its
`ContributionReviewNote`/audit history) and blocks further edits/review. **A `CATALOGUED`
contribution cannot be withdrawn** - its canonical `Source`/`SourceDocument`/`MediaAsset` records
already stand on their own by then, independent of the originating contribution row (following the
same "archive, never hard-delete, never retroactively invalidate downstream trust" principle as
`Source.archive` in `TRUST_MODEL.md` section 3). If a contributor later requests removal of
already-catalogued material (e.g. a copyright complaint), the correct path is the same one
`TRUST_MODEL.md`/`MEDIA_ARCHITECTURE.md` already document for `Source`/`MediaAsset`: restrict
access policy or quarantine/archive the canonical record through its own review path, never a
blind delete that would also destroy citation/provenance history.

## 16. Separation of duties / role matrix

| Role | Can do |
|---|---|
| `USER` (any authenticated account) | Submit a contribution; edit/withdraw their own while `SUBMITTED` or awaiting info; add provenance evidence to their own; respond to a `REQUEST_INFO` decision by editing again. |
| `EDITOR` | Complete `TRIAGE`/`PROVENANCE_REVIEW` (approve, reject, request info, return to a previous stage); set rights review / provenance confidence / sensitivity (never on their own contribution). Cannot complete `HISTORICAL_REVIEW` or catalogue anything. |
| `HISTORIAN_REVIEWER` | Everything `EDITOR` can do, plus complete `HISTORICAL_REVIEW -> ACCEPTED` (the historical-accuracy checkpoint) and every catalogue action. |
| `ADMIN` | Everything above, elevated override. |
| `MODERATOR` | **No contribution-review or cataloguing privilege at all** - community moderation (comments/reports/`CommunityStory` visibility) is a structurally separate concern (spec section 71); `ContributionsAdminController`'s class-level `@Roles` never includes `MODERATOR`, and the catalogue routes' `CATALOGUE_ROLES` constant never includes it either (asserted in `trust-regression.spec.ts`). |

Self-review is refused for every role, at every stage, on every reviewer/admin action listed
above - holding a role never overrides being an interested party in your own submission, the same
principle documented for `HistoricalFact`/`CommunityStory` in `TRUST_MODEL.md`/
`COMMUNITY_ARCHITECTURE.md`.

## 17. Error codes

`apps/api/src/common/errors/contribution-error-codes.ts`:

| Code | Thrown by | Meaning |
|---|---|---|
| `CONTRIBUTION_NOT_FOUND` | most methods | Unknown contribution id. |
| `CONTRIBUTION_NOT_EDITABLE` | `update`/`withdraw` | Not in an editable state, or already `CATALOGUED`/withdrawn. |
| `CONTRIBUTION_INVALID_TRANSITION` | `submitReview` | The requested decision has no legal effect from the current status (e.g. `APPROVE` from `ACCEPTED`, or `RETURN_TO_PREVIOUS_STAGE` from `SUBMITTED`). |
| `CONTRIBUTION_SELF_REVIEW_FORBIDDEN` | every reviewer/admin method | The actor is the contribution's own author. |
| `CONTRIBUTION_REVIEW_REQUIRED` | `submitReview`/catalogue actions | The actor lacks the role required for this stage/action. |
| `CONTRIBUTION_RIGHTS_INCOMPLETE` | every catalogue action | `rightsReviewState != APPROVED_FOR_CATALOGUE`. |
| `CONTRIBUTION_ALREADY_CATALOGUED` | reserved for future stricter re-catalogue guards | (Cataloguing today is idempotent-by-return rather than throwing - see section 9.) |
| `CONTRIBUTION_CATALOGUE_NOT_ALLOWED` | catalogue actions | Wrong `status`, or (for `catalogue/document`) no `Source` catalogued yet. |
| `CONTRIBUTION_MEDIA_NOT_OWNED` | `catalogueMedia` | The `mediaAssetId` is not attached to this contribution. |
| `CONTRIBUTION_INVALID_TARGET` | `create` | `linkedEntityType`/`correctionTargetType`/`placeId` outside the allow-list or does not exist. |
| `CONTRIBUTION_VERSION_CONFLICT` | every reviewer/admin write | Stale `expectedVersion`. |

## 18. Hoang Sa / Truong Sa

A contribution may link to Hoang Sa or Truong Sa exactly like any other `Place` - via the ordinary
`placeId` FK, no special-cased code path. Linking never creates a `Source`/`HistoricalFact`/
`TerritoryGeometry`; any subsequent promotion (a catalogued `Source`, a promoted archival photo, a
map) follows the exact same provenance/rights/sensitivity/cataloguing gates as material linked to
any other place - there is no shortcut, and no fabricated geopolitical content was added anywhere
in this phase. `trust-regression.spec.ts` asserts this structurally (see the "Phase 09 contribution
trust-boundary regression" block).

## 19. Live verification status

`PASS_STATIC` / `PASS_UNIT` for everything described above (schema validated via `prisma validate`,
Prisma Client generated cleanly, full unit-test suite green with mocked Prisma/Media/Sources
collaborators). **`UNVERIFIED_LIVE_DB`**: the Phase 09 migration was hand-written (no live shadow
database available for `prisma migrate diff`) and has not been executed against a real
PostgreSQL/PostGIS instance; true concurrent-write races and the ISBN/ISSN dedup check's behavior
under real concurrent transactions are unverified. **`UNVERIFIED_OBJECT_STORAGE`**: catalogue
actions that reference a `mediaAssetId` assume the referenced `MediaAsset` is genuinely `READY` in
a real MinIO/S3 bucket - not exercised against live object storage here. **`UNVERIFIED_OCR_ENGINE`**:
unchanged from prior phases, no live OCR engine available.
