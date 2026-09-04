# Dau Viet - Media Architecture (Phase 05 / 05.1)

Audience: any engineer/agent touching `MediaAsset`, `SourceDocument`, `EntityMedia`,
`ThenNowComparison`, `S3Service`, or `MediaService`. This document is the contract for how
media (photography, scans, maps, illustrations, reconstructions, audio, video) enters the
system, becomes usable, and is delivered - if code disagrees with this doc, treat it as a
bug. It complements `docs/backend/TRUST_MODEL.md` (Phase 04) - `SourceDocument` access
policy is defined there and reused here, not redefined.

**Phase 05.1 note:** Phase 05 shipped the full lifecycle/security contract (upload-confirm
verification, magic-byte validation, ownership enforcement, rights/access model) but left two
things as documented gaps: derivative image processing was a lifecycle-only no-op, and
`checksum` was client-supplied rather than server-verified. Phase 05.1 closed both - sections
5 and 8 below describe the real implementation, not a planned one. Every other section is
unchanged from Phase 05.

## 1. Storage abstraction

`S3Service` (`apps/api/src/modules/media/s3.service.ts`) is the *only* place any AWS SDK
call appears in this codebase - `MediaService`, `SourcesService`, and everything else go
through it. This is what lets MinIO (local dev) and a production S3-compatible provider be
swapped by config alone (spec section 9/38): `buildStorageKey`, `createUploadUrl`,
`createDownloadUrl`, `statObject`, `readLeadingBytes`, `deleteObject`, `publicUrl`.

### Object key strategy (spec section 10)

`buildStorageKey(mimeType, prefix)` generates `{purpose}/{nanoid()}.{safeExtension}` - the
original client filename is **never** used as or embedded in the key. The extension comes
from a fixed `EXTENSION_BY_MIME` allow-list (`file-signature.util.ts`) keyed by the
*validated* MIME type, not the client's filename - this rules out both path traversal
(`../../etc/passwd`) and extension smuggling (`photo.jpg.php`) by construction, not by
sanitizing the filename. The original filename is accepted in `RequestUploadDto.fileName`
and is metadata only - it is never used to build a path.

## 2. Upload flow (spec sections 11/13)

```
POST /v1/media/uploads                         (RequestUploadDto: purpose, type, mimeType,
    -> validates purpose/type/MIME/size          sizeBytes, fileName, + rights/provenance
    -> generates a server-controlled storageKey   metadata upfront)
    -> creates MediaAsset { status: PENDING_UPLOAD }
    -> returns { id, uploadUrl, storageKey, expiresInSeconds }

client PUTs the file directly to uploadUrl (presigned S3 PUT)

POST /v1/media/uploads/:id/confirm              (ConfirmUploadDto: optional checksum)
    -> caller must own the MediaAsset (or hold EDITOR+)
    -> must currently be PENDING_UPLOAD
    -> S3Service.statObject(storageKey) - HeadObject: does it actually exist? what size?
       -> missing -> MediaAsset.status = FAILED, 400
    -> S3Service.readLeadingBytes(storageKey) - a small Range GET, checked against the
       declared MIME's magic-byte signature (file-signature.util.matchesSignature)
       -> mismatch -> MediaAsset.status = FAILED, 400
    -> MediaAsset.status = UPLOADED, uploadConfirmedAt set, sizeBytes reconciled to the
       real HeadObject value, checksum stored (client-supplied, see section 8)
    -> enqueues a `media-processing` BullMQ job (idempotent jobId: `process-{mediaAssetId}`)

MediaProcessor (BullMQ worker)
    -> UPLOADED -> PROCESSING -> READY (idempotent, status-predicated - see section 5)

GET /v1/media/:id  (public)
    -> only ever returns a MediaAsset whose status is READY
    -> only ever returns a resolvable `url` when accessPolicy is PUBLIC
```

**The core invariant this whole flow exists to enforce:** a `MediaAsset` is never usable
just because the client says the upload succeeded (spec section 11). Every status
transition past `PENDING_UPLOAD` requires either a verified fact about the real object in
storage (`confirmUpload`) or a server-side background step (`MediaProcessor`) - never a
client-supplied "I'm done" flag.

**Small/multipart server-side uploads** (spec section 12) are not implemented - no such
endpoint existed before Phase 05 and none was added. If one is added later, it must run
through the same `assertWithinPolicy`/signature-check/lifecycle path as the presigned flow,
not a separate ad hoc validation.

## 3. Lifecycle (spec section 13)

```
PENDING_UPLOAD -> UPLOADED -> PROCESSING -> READY
       |                                      |
       v                                      v
     FAILED                               QUARANTINED / ARCHIVED
```

`MediaAssetStatus` (`PENDING_UPLOAD`/`UPLOADED`/`PROCESSING`/`READY`/`QUARANTINED`/`FAILED`/
`ARCHIVED`) defaults to `PENDING_UPLOAD` on every `MediaAsset` row - there is no code path
that creates a row already `READY`. **Every public read path filters on `status = READY`**
(`MediaService.findPublicById`; `MediaService.attachToEntity` also refuses to link a
non-`READY` asset into any entity gallery). `QUARANTINED` and `ARCHIVED` are terminal from
the public API's point of view regardless of `accessPolicy` - a `QUARANTINED` `PUBLIC` asset
is still never served (spec section 41).

## 4. MIME/size validation (spec sections 14/15)

`file-signature.util.ts` is the validator abstraction:

- `MEDIA_POLICIES` - a per-`UploadPurpose` (`photo`/`archival`/`document`/`audio`/`video`/
  `avatar`) allow-list of MIME types and a byte-size cap. `avatar` is deliberately the
  strictest (images only, 5MB) - no PDF/video/audio can ever be an avatar (spec section 31).
  `image/svg+xml` is not in **any** policy's allow-list (spec section 43 - "simplest safe MVP
  option: do not accept SVG uploads"; there is no sanitization pipeline in this codebase to
  make it safe, so it is not offered at all rather than half-implemented).
- `ALLOWED_MEDIA_TYPES_BY_PURPOSE` - which `MediaType` values make sense for a purpose (e.g.
  `document` only accepts `DOCUMENT_SCAN`), checked in `MediaService.requestUpload`.
- `matchesSignature(mimeType, buffer)` - hand-written magic-byte checks (JPEG/PNG/WebP/
  TIFF/PDF/MP3/WAV/MP4) with no external dependency. Declared-but-unchecked MIME types pass
  by default - the allow-list is the hard gate, this is defense in depth against a
  mislabeled `Content-Type`, not the only gate.

**Honest limit:** because uploads go directly client -> S3 via a presigned PUT, the backend
never sees the request body at upload time - signature checking cannot run at
`POST /media/uploads`. It runs in `confirmUpload` against a small Range GET of the *already
uploaded* object instead. This still can't catch every case a full content-type sniffing
library would (e.g. a byte-perfect polyglot file), but it does catch the common case (an
executable/script/HTML payload declared as an image or PDF) without adding a new dependency
or downloading full multi-hundred-MB files just to check a header.

## 5. Background jobs, derivative processing & idempotency (spec sections 2/5/6/7/8/10/11/12/13/52/53/54)

`MediaProcessor` (`@Processor('media-processing')`) is a BullMQ `WorkerHost`. The lifecycle
transition itself is unchanged from Phase 05 and remains idempotent by construction: every
status write is a status-predicated `updateMany` (`WHERE id = ? AND status IN (...)`), so
re-delivering the same job (BullMQ redelivery, a manual retry, two workers racing) is safe -
a job that finds the asset already past the expected status is a no-op. `confirmUpload`
enqueues with a deterministic `jobId` (`process-{mediaAssetId}`), which also gives BullMQ its
own dedupe-in-flight behavior for free.

**Phase 05.1: real image-processing pipeline.** `sharp` (added as a dependency; confirmed
working in this sandbox including AVIF encode support) now actually generates derivatives for
raster images. `image-processing.util.ts` exports `generateImageVariants(buffer)`, a pure
function (no S3/Prisma) the processor calls once it has downloaded the original:

```
UPLOADED -> PROCESSING -> [image? generate variants : skip] -> READY
                                    |
                            any mandatory variant throws -> FAILED (not rethrown - see below)
```

- **Which assets get processed:** only `PROCESSABLE_IMAGE_MIME_TYPES` (`image/jpeg`,
  `image/png`, `image/webp`, `image/tiff`) - anything else (PDF, audio, video, and
  deliberately **not** `image/gif` or `image/svg+xml`, neither of which is in any upload
  policy's allow-list to begin with - see section 4) skips derivative generation entirely and
  goes straight `PROCESSING -> READY`. GIF's explicit status: it is not accepted by any
  purpose's MIME allow-list today, so it can never reach this pipeline; if animated GIF
  support is ever added, it must **not** be routed through this static-frame resize path
  (which would flatten it to one frame) without a deliberate decision.
- **Mandatory variants (spec section 5/11):** `THUMBNAIL` (max 320px), `MEDIUM` (max 960px),
  `LARGE` (max 1920px), each encoded as WebP (spec section 6 - "generate optimized WebP
  derivatives"). All three use `fit: 'inside'` + `withoutEnlargement: true`, so aspect ratio
  is always preserved and an image is never upscaled past its own resolution (a 200px-wide
  original never gets a bigger-than-200px "LARGE" variant). **All three must succeed for the
  parent to reach READY** - this is the "simple all-required-variants-success" behavior the
  spec recommends for V1; there is no partial-READY state.
- **Optional variant:** `OPTIMIZED_WEB` (AVIF, max 960px) is attempted and, if it throws for
  any reason (platform/libvips AVIF support varies), the failure is swallowed - it never
  blocks the mandatory set or the parent's `READY` transition (spec section 6).
- **Orientation (spec section 7):** every variant pipeline calls `.rotate()` with no
  arguments, which auto-rotates from the EXIF orientation tag and then strips it - a
  derivative is never upside-down/sideways regardless of how the source camera wrote it
  (verified in `image-processing.util.spec.ts` with a synthetic image carrying an
  `orientation: 6` tag).
- **Metadata stripping (spec section 8):** derivatives never call `.withMetadata()`, so sharp
  does not carry EXIF/GPS/ICC/camera-serial data into the output at all - verified directly
  in tests (`meta.exif`/`meta.icc` are `undefined` on every generated variant). The *original*
  object in storage is untouched and access-controlled as before; only public derivatives are
  guaranteed metadata-free.
- **Storage (spec section 9):** each variant gets its own server-generated key
  (`S3Service.buildStorageKey`, under `derivatives/{variantType}/...`) and is written via the
  new `S3Service.putObject` (a direct server-side write, distinct from the presigned-PUT flow
  used for original client uploads - the backend never becomes a generic upload proxy for
  arbitrary client bytes). Nothing is ever "just a URL" - every variant is a full `MediaAsset`
  row (parent relation, `variantType`, MIME, width, height, byte size, its own SHA-256
  checksum, its own `status`).
- **Idempotency (spec section 10):** `MediaAsset` gained a `@@unique([parentAssetId,
  variantType])` constraint (the one schema change this remediation needed - see
  "Migrations"). Every variant write is a Prisma `upsert` keyed on that constraint -
  re-running the job for the same asset overwrites the existing derivative row rather than
  creating a duplicate (unit-tested).
- **Retry vs. permanent failure (spec section 12):** the processor distinguishes two failure
  classes. A storage read error (`S3Service.getObjectStream` rejecting - network blip, bucket
  unavailable) is rethrown, letting BullMQ's configured retry/backoff
  (`attempts: 3, backoff: { type: 'exponential', delay: 5000 }`, set in `MediaModule`) run its
  course. A `sharp` decode/processing failure (corrupt bytes, not really the declared image
  type) is caught and the asset is marked `FAILED` **directly, without rethrowing** - retrying
  a corrupt file can never succeed, so it is never handed back to BullMQ's retry queue.
  If a transient storage error persists through every configured attempt, an
  `@OnWorkerEvent('failed')` handler fires once BullMQ has exhausted `job.opts.attempts` and
  marks the asset `FAILED` then - an asset can never be left stuck in `PROCESSING` forever
  just because storage was down for the whole retry window.
- **Error handling hygiene (spec section 13):** failure reasons logged to `AuditLog`
  (`media.processing.failed`) are short, truncated strings (`err.message.slice(0, 200)` or a
  fixed reason string like `storage_retries_exhausted`) - never a raw stack trace, and no
  broken/nonexistent derivative URL is ever returned to a client (a `FAILED` asset never
  passes the `status === READY` filter in `findPublicById`).
- **Access/rights/disclosure inheritance (spec section 23/24):** every derivative is created
  with the parent's `accessPolicy`, `rightsStatus`/`license`/`rightsHolder`/`attributionText`,
  and - critically - `isAiGenerated`/`aiDisclosure`/`isHistorical` copied at creation time. A
  reconstruction's thumbnail is still visibly a reconstruction; a `RESTRICTED` parent's
  variants are never created `PUBLIC`. See section 7 below for what happens when the parent's
  policy changes *after* variants already exist.
- **Audio/video/PDF (spec section 21/22):** explicitly untouched by this pipeline beyond the
  existing lifecycle/checksum work (section 8) - they reach `READY` via the same
  `PROCESSING -> READY` step as before Phase 05.1, with no image derivatives. Full
  transcoding was out of scope per the brief; the `PROCESSABLE_IMAGE_MIME_TYPES` check is the
  documented extension point if audio/video processing is added later.

### Derivative model (spec section 17)

No separate `MediaVariant` table was added. `MediaAsset` already had a self-relation
(`parentAssetId` / `derivatives`) from Phase 01, plus its own `width`/`height`/`storageKey`/
`mimeType`/`sizeBytes` - exactly the fields a derivative row needs. Phase 05 added one field,
`variantType: MediaVariantType?` (`THUMBNAIL`/`MEDIUM`/`LARGE`/`OPTIMIZED_WEB`), meaningful
only when `parentAssetId` is set; Phase 05.1 added the `@@unique([parentAssetId,
variantType])` constraint that makes derivative writes safely idempotent. This satisfies spec
section 17's "if current schema already has sound derivative fields, preserve it" - a
derivative is just another `MediaAsset` row pointing at its parent, not a new concept.

## 6. Rights & provenance (spec sections 4/5/6)

Provenance fields (unchanged from Phase 01, preserved): `creatorName`, `sourceId`,
`captureYear`/`captureMonth`/`captureDay`/`capturePrecision` (never fabricates a day/month -
same historical-date discipline as everywhere else), `provenanceNote`, `isHistorical`.

Rights fields (Phase 05 additions in **bold**): `license`, `rightsHolder`, **`rightsStatus`**
(`RightsStatus`: `PUBLIC_DOMAIN`/`LICENSED`/`PERMISSION_GRANTED`/`COPYRIGHTED`/`UNKNOWN`/
`RESTRICTED`/`COMMUNITY_OWNED`), **`attributionText`**, **`rightsReviewedById`/
`rightsReviewedAt`**. `rightsStatus` defaults to `UNKNOWN` - **`UNKNOWN` is never treated as
permission to publish**; it is exactly as restrictive as any other non-`PUBLIC_DOMAIN`/
`LICENSED`/`PERMISSION_GRANTED` value from a workflow point of view (`accessPolicy` is the
actual publication gate, and defaults to `PUBLIC` only because the uploader chose it at
request time - see section 7).

**Not implemented, by design:** `commercialUseAllowed`/`derivativesAllowed`/
`publicDisplayAllowed`/`rightsExpiresAt` as separate boolean/date columns. Spec section 5
says "support concepts *including*" - these usage-restriction nuances are folded into the
free-text `license`/`provenanceNote` fields rather than adding four more nullable columns
that nothing in this codebase yet reads or enforces differently. If a future phase needs to
*programmatically* gate on "is a derivative allowed", promote that specific concept to a
real column then, backed by an actual enforcement point - not speculatively now.

### Who can set what (spec section 46)

`rightsStatus`/`license`/`rightsHolder`/`attributionText` are only settable via
`PATCH /media/:id/rights`, gated to `EDITOR`/`HISTORIAN_REVIEWER`/`ADMIN` - **never** the
uploader alone, regardless of their other roles. An ordinary `CONTRIBUTOR` cannot self-
declare their own upload `PUBLIC_DOMAIN`. Every call sets `rightsReviewedById`/
`rightsReviewedAt` and is audited (`media.rights.changed`).

## 7. Access control (spec sections 7/8/36/37)

`AccessPolicy` (`PUBLIC`/`PREVIEW_ONLY`/`METADATA_ONLY`/`RESTRICTED`) is the same enum
`SourceDocument` uses (Phase 04, see `TRUST_MODEL.md` section 11) - one coherent policy
concept across the media domain, not two. Enforcement for `MediaAsset` itself:

- `MediaService.findPublicById` (`GET /media/:id`, public) only resolves a `url` when
  `accessPolicy === PUBLIC` **and** `status === READY`. Every other combination returns
  `url: null` (metadata still returned) or a flat 404 (not `READY`).
- `PATCH /media/:id/access-policy` (`EDITOR`+) is the only way to change it post-creation;
  audited (`media.accessPolicy.changed`).

### The Phase 04 bug, and the audit that followed it (spec section 8)

Phase 04 found and fixed a real leak: `MediaService`'s URL resolver special-cased only
`RESTRICTED`, so `PREVIEW_ONLY`/`METADATA_ONLY` assets still got a full download URL through
the public endpoint. Phase 05 re-audited every path that can return a `MediaAsset`-derived
URL or a `SourceDocument`-derived field for the same class of bug:

| Path | Before Phase 05 | After Phase 05 |
|---|---|---|
| `GET /media/:id` | Fixed in Phase 04 (`accessPolicy !== PUBLIC -> url: null`) | Unchanged; now additionally gated on `status === READY` |
| `SourcesService.addDocument` -> underlying `MediaAsset` | The `SourceDocument`'s `accessPolicy` was never synced to its `MediaAsset`, so a `RESTRICTED` document's asset could still default to `PUBLIC` and leak via `GET /media/:id` (fixed in Phase 04 - `addDocument` now tightens the asset's policy in the same transaction) | Unchanged (still correct) |
| `EntityMedia` galleries (`PlacesService.getMedia`, etc.) | Returns whatever `MediaAsset` rows are attached, no policy filtering | **New in Phase 05:** `MediaService.attachToEntity` refuses to attach a non-`READY` asset, so a gallery can never contain a dangling/unusable reference; the attached `MediaAsset` row's own `accessPolicy`/`status` still governs whether `GET /media/:id` on that specific asset resolves a URL - a gallery listing itself was already only ever returning ids/metadata (`PlacesService.getMedia` returns the raw `mediaAsset` rows, which do not carry a `url` field - the client must call `GET /media/:id` per asset to resolve one, which re-applies the policy check) |
| `ContributionsService.findById` -> `media: { include: { mediaAsset: true } }` | Returns full `MediaAsset` rows including `storageKey` to `EDITOR`+ reviewers only (route-gated) | Unchanged - this is an internal review path, not a public one; `storageKey` is never returned by any `@Public()` route in this codebase |
| A derivative generated *before* its parent's `accessPolicy` was tightened | **Phase 05.1 finding:** once derivative processing existed, a real gap appeared - a derivative inherits the parent's policy only at creation time, so a `PUBLIC` original processed into variants and *then* tightened (via `PATCH /media/:id/access-policy`, or via `SourcesService.addDocument` syncing a newly-attached `SourceDocument`'s stricter policy) would leave the already-generated `THUMBNAIL`/`MEDIUM`/`LARGE` rows stuck `PUBLIC` | Fixed: `MediaService.updateAccessPolicy`/`quarantine`/`archive` now cascade the same change to every row with `parentAssetId = this asset` in the same `$transaction`; `SourcesService.addDocument`'s existing MediaAsset-tightening logic now also tightens `WHERE parentAssetId = :mediaAssetId AND accessPolicy = PUBLIC` (unit-tested in both `media.service.spec.ts` and `sources.service.spec.ts`) |

No new leak was found beyond the ones listed above; the audit's conclusion is recorded here
so a future phase doesn't have to re-derive it.

### Signed URL TTLs (spec section 37)

`S3Service` no longer hardcodes `900` inline - `uploadUrlTtlSeconds` (default 900s),
`downloadUrlTtlSeconds` (default 3600s), and `restrictedDownloadUrlTtlSeconds` (default
300s, shorter on purpose) are configured via `S3_UPLOAD_URL_TTL_SECONDS`/
`S3_DOWNLOAD_URL_TTL_SECONDS`/`S3_RESTRICTED_DOWNLOAD_URL_TTL_SECONDS` (see `.env.example`).
`createDownloadUrl(key, restricted?)` picks the appropriate TTL.

## 8. Checksum & deduplication (spec sections 14/15/16/17/18/55/56/57)

**Phase 05.1: the server now computes an authoritative SHA-256 itself.** `MediaAsset.checksum`
is populated from a value `MediaService.confirmUpload` computes server-side - a
client-supplied checksum (`ConfirmUploadDto.checksum`, still optional) is only ever *compared*
against it, never stored in its place. If both are present and they differ, confirmation is
rejected (`MEDIA_CHECKSUM_MISMATCH`) and the asset is marked `FAILED`, exactly like a
signature mismatch.

**Streaming, not buffered (spec section 16).** `checksum.util.ts` exports `hashStream(stream,
leadingByteCount?)`, a generic Node-stream SHA-256 hasher (no S3-specific type - trivially
testable with `Readable.from(...)`) that processes the object in constant memory regardless
of size, respecting the existing per-purpose upload caps (up to 500MB for video) without ever
holding the whole file in memory. It also captures the object's leading bytes **in the same
pass**, so `confirmUpload` gets both the magic-byte signature check (spec section 20 - still
required, checksum does not replace it) and the authoritative checksum from **one** object
read, not two:

```
confirmUpload:
  1. S3Service.statObject(key)        -> exists? real size?           (HeadObject, cheap, fails fast)
  2. S3Service.getObjectStream(key)   -> hashStream(stream)            (ONE streamed read)
       -> { checksum, leadingBytes }
  3. matchesSignature(mimeType, leadingBytes)  -> mismatch -> FAILED, MEDIA_SIGNATURE_MISMATCH
  4. dto.checksum && dto.checksum !== checksum -> FAILED, MEDIA_CHECKSUM_MISMATCH
  5. persist status=UPLOADED, checksum (server value), uploadConfirmedAt
```

**Storage abstraction (spec section 17):** `MediaService` never touches the AWS SDK directly.
`S3Service.getObjectStream(key): Promise<Readable>` is the only new primitive it needed - a
generic Node `Readable`, not an SDK-specific type - alongside the pre-existing
`S3Service.statObject`. `S3Service.putObject(key, buffer, contentType)` (server-side write,
distinct from the presigned-PUT client flow) was added for the processor's derivative writes
(section 5).

**Dedup remains detection-only, never automatic merging (spec section 18/57) - unchanged
from Phase 05's stance**, now on a value that is actually trustworthy: spec section 57
explicitly warns that even an exact binary match must never auto-merge different rights/
provenance records, and no safe "share the object, keep metadata separate" mechanism exists
yet to make merging safe. A future phase adding real dedup tooling should query on the now-
authoritative `checksum` for a human reviewer's attention, not auto-merge.

## 9. SourceDocument integration (spec sections 21/22/23)

`SourceDocument.mediaAssetId` (Phase 01) is unchanged in shape. Phase 05 adds an OCR-status
foundation directly on the existing model rather than a new `SourceDocumentPage` table:
`ocrStatus` (`DocumentOcrStatus`: `NOT_REQUESTED`/`REQUESTED`/`PROCESSING`/`COMPLETE`/
`FAILED`), `ocrConfidence`, `ocrReviewedById`/`ocrReviewedAt`. `extractedText` (Phase 01) is
reused as the output store - no separate text-storage column was added.

**Why no `SourceDocumentPage` model (spec section 22):** nothing in this codebase currently
needs page-level addressing (no multi-page-scan UI, no per-page citation locator beyond the
existing free-text `Citation.pageFrom`/`pageTo`). Adding a page model now, with no consumer,
would be exactly the premature complexity spec section 22 warns against. If per-page OCR/
preview is needed later, `SourceDocument` already has `pageCount`; a page model can be added
then without disturbing this shape.

**Why no OCR job was actually wired up (spec section 23):** the brief is explicit that this
phase must not build a full OCR product. The four fields above are the complete "foundation"
asked for - a real OCR pipeline (external engine call, `REQUESTED -> PROCESSING -> COMPLETE`
transition, confidence scoring) is future work with no engine available to integrate in this
sandbox. **OCR output is never treated as reviewed historical text** - a citation quoting a
document's `extractedText` still goes through the ordinary Fact/Citation trust path
(`TRUST_MODEL.md`) regardless of `ocrStatus`.

## 10. Archival photography, historical maps, and reconstructions

`ARCHIVAL_PHOTO` and `MAP` use the same provenance/rights fields as any other `MediaAsset`
(section 6) - no dedicated sub-model, since nothing about them needs different columns, only
different expected *values* (a real photographer/archive/collection for `ARCHIVAL_PHOTO`; a
real cartographer/publisher for `MAP`). Neither is forced to have complete metadata - an
archive record with an unknown photographer stays `creatorName: null`, never a placeholder.

**A `MAP`-type `MediaAsset` is not geographic truth (spec section 24/61).** It is a picture of
a map. It has no schema-level relation to `Territory`/`TerritoryGeometryRevision`/PostGIS
geometry at all (statically verified in `schema-graph.spec.ts`) - reviewed historical
boundary data only ever comes from `Territory` + `TerritoryGeometryRevision` with a real
`Source`/verified `Citation` and `HISTORIAN_REVIEWER`/`ADMIN` sign-off, exactly as documented
in `HISTORICAL_DOMAIN.md` section 9. Uploading a map image can never create or imply a
`Territory` row.

**`RECONSTRUCTION` requires disclosure of its basis, always** (spec section 25/26,
`MediaService.requestUpload`): a `RECONSTRUCTION` upload with neither `provenanceNote`
(method/basis) nor `aiDisclosure` is rejected - not just when `isAiGenerated` is set. A
hand-drawn, non-AI artist reconstruction still cannot be silently indistinguishable from an
archival photo. `isAiGenerated`/`aiDisclosure` continue to be enforced together as before
(Phase 01): AI-generated/reconstructed media always needs its disclosure text, and the
public `MediaAsset` DTO exposes `isAiGenerated`/`aiDisclosure` as plain fields - a frontend
can render "Minh hoa phuc dung" (reconstruction illustration) directly from them.

## 11. Community media & ownership (spec sections 28/29/30/44/59)

**Community media is never automatically archival/trusted media.** Structurally: a
`CommunityStory` has no relation to `Source`/`Citation` (Phase 04 finding, still true).
A community member's upload is an ordinary `MediaAsset` (`isHistorical: false` by default,
`rightsStatus: UNKNOWN` by default) attached via the generic, role-gated
`POST /media/attach` - promotion into curated/archival status is a distinct, later editorial
action (rights review + `isHistorical` flag + `PATCH /media/:id/rights`), never automatic.

**Ownership is enforced wherever a client references an *existing* media id, not just where
they upload one** - this was a real gap closed in Phase 05:
`ContributionsService.create` previously accepted any `mediaAssetIds` array with **zero**
ownership check, letting a `CONTRIBUTOR` attach a stranger's private upload to their own
contribution just by guessing/knowing its id. `MediaService.assertOwnedByOrPrivileged`
(`uploadedById === caller.id`, or the caller holds `EDITOR`+) is now called for every id in
`CreateContributionDto.mediaAssetIds` (and reused identically by `ThenNowService.create` for
`beforeMediaId`/`afterMediaId` - see section 12). Unit-tested in
`contributions.service.spec.ts` and `then-now.service.spec.ts`.

**Known open question, not resolved in this phase:** `POST /media/uploads` itself is gated
to `CONTRIBUTOR`+ (unchanged from Phase 01), and `CONTRIBUTOR` is "not self-assignable -
granted by an ADMIN" per `AUTHORIZATION_MATRIX.md`. That means a plain `USER`-role community
member (writing a `CommunityStory`/personal memory) cannot currently upload *any* media,
including a Then & Now submission, without first being granted `CONTRIBUTOR`. Whether that
is the intended policy (all uploads vetted at the account level) or a real product gap for
casual community participation is an authorization-policy question outside Phase 05's
media/storage scope - flagged here rather than silently changed.

## 12. Then & Now ("Xua & Nay") (spec section 27/63)

`ThenNowComparison` (`placeId`, `beforeMediaId`, `afterMediaId`, `historicalPeriod`,
`viewpointNote`, `publicationStatus`, `moderationStatus`, `createdById`) plus
`ThenNowComparisonTranslation` (locale-scoped `description`, same
`TranslationStatus`/`TranslationMethod` pattern as every other translated entity). One model
serves both editorial and community-submitted pairs - `publicationStatus` (reused
`PublicationStatus`, the same DRAFT/PUBLISHED gate every entity in this codebase uses) is
the editorial-promotion checkpoint, and `moderationStatus` (reused `ModerationStatus`, the
same gate `CommunityStory` uses) is the post-publish visibility control. This mirrors the
existing `CommunityStory`-vs-`Story` distinction rather than inventing a third trust
mechanism (spec section 63's explicit instruction: "community comparison remains community-
layer unless editorially promoted through explicit workflow").

`ThenNowService.create` enforces: `beforeMediaId !== afterMediaId`; both must reference a
real, `READY` `MediaAsset`; `placeId` must reference a real `Place`; the caller must own (or
be `EDITOR`+ for) both media assets. `GET /then-now?placeId=` (public) returns only
`publicationStatus = PUBLISHED` and `moderationStatus != REMOVED` rows -
`PATCH /then-now/:id/publication-status` (`EDITOR`+) and
`PATCH /then-now/:id/moderation-status` (`MODERATOR`+) are the only ways past `DRAFT`/into
`REMOVED`.

## 13. Audit (spec section 45)

Every trust-relevant media mutation is logged via the same append-only `AuditService` used
everywhere else: `media.upload.requested`, `media.upload.confirmed` (Phase 05.1: now includes
the server-computed `checksum`), `media.upload.failed` (with a `reason`: `object_not_found`,
`signature_mismatch`, or `checksum_mismatch` - never a raw signed URL or token),
`media.rights.changed`, `media.accessPolicy.changed`, `media.quarantined`, `media.archived`,
`media.translation.upserted`, `media.cleanup.expiredPendingUploads`, and (Phase 05.1)
`media.processing.completed`/`media.processing.failed` (reason truncated to 200 chars, never
a raw stack trace), plus the Phase 04 `sourceDocument.created` (now also logging the
access-policy sync decision, which Phase 05.1 extended to derivatives). No signed URL, token,
or raw object credential is ever written into an audit `metadata`
field.

## 14. Orphan cleanup (spec section 40)

`MediaService.cleanupExpiredPendingUploads(actorId, olderThanMinutes?)` marks any
`PENDING_UPLOAD` row older than the cutoff (default `MEDIA_PENDING_UPLOAD_EXPIRY_MINUTES`,
60) as `FAILED` - it never touches anything past `PENDING_UPLOAD`, so a confirmed/processed
asset is never "cleaned up" by age alone. Exposed as `POST /media/admin/cleanup-expired-
uploads` (`ADMIN`). **No cron/scheduler wiring was added** (`@nestjs/schedule` is not a
dependency of this API) - this is an on-demand admin action today; wiring it to run
automatically is a small addition (either add `@nestjs/schedule` and a `@Cron` decorator, or
point an external cron/CI job at the endpoint) left for whenever recurring background jobs
are actually needed elsewhere too, rather than adding a new dependency for this one job.

## 15. Malware/virus scanning (spec section 42)

**Not implemented, and not claimed to be active.** No scanner is available in this sandbox.
The `FAILED` status and `confirmUpload`'s verification step are the structural hook a future
scanning job would plug into (mark `PENDING_UPLOAD`/`UPLOADED` -> scan -> `FAILED` or
proceed to `PROCESSING`) - PDFs and documents in particular should route through such a
scan before ever reaching `READY` once a scanner exists. Classify this explicitly as
`UNVERIFIED_MALWARE_SCANNER` - not `PASS_STATIC`, not `PASS_UNIT` - there is no code path to
unit-test here because none exists yet.

## 16. Local development (spec section 65)

Unchanged prerequisites from `BACKEND_HANDOFF.md`: `pnpm infra:up` (Docker Compose: MinIO
among others) then `pnpm api:dev`. Docker/WSL2 remains unavailable in this sandbox (see
`BACKEND_FREEZE_REPORT.md`) - **no live MinIO behavior in this document is claimed as
verified**; every S3-touching code path here is `PASS_UNIT` (mocked `S3Client`) at best. A
bucket must exist before `S3_BUCKET` points at it in a real environment - `docker-compose.yml`
does not currently auto-create one; document this as a manual/scripted one-time step
(`mc mb local/dauviet-media` via the MinIO client, or an init container) when Docker is
actually available - not attempted here since it cannot be verified.

## 17. Known limitations (be explicit, not hidden)

- No live MinIO/S3 validation in this build session (environment blocker, unchanged from
  Phase 01-05). `sharp` itself was smoke-tested directly in this sandbox (JPEG/PNG/WebP/AVIF
  encode/decode, EXIF-orientation auto-rotate, metadata stripping all confirmed working) - it
  is the *object storage round trip* that remains unverified, not the image library.
- **Resolved in Phase 05.1** (previously listed here as gaps): real image-processing pipeline
  (section 5) and server-computed streaming SHA-256 checksum verification (section 8).
- No malware/virus scanner. See section 15. `UNVERIFIED_MALWARE_SCANNER` - unchanged, no
  scanner exists to integrate.
- No `@nestjs/schedule`/cron wiring for orphan cleanup - on-demand admin endpoint only. See
  section 14.
- No `SourceDocumentPage` model; no real OCR engine. See section 9.
- No audio/video transcoding or thumbnail extraction - explicitly out of scope for this
  remediation (spec section 22), and Phase 05's "keep processing architecture extensible"
  note still applies: `PROCESSABLE_IMAGE_MIME_TYPES` is the documented extension point.
- `POST /media/uploads` requires `CONTRIBUTOR`+, which is not self-assignable - a plain
  community `USER` cannot currently upload media at all, including for a Then & Now
  submission. See section 11. Unchanged by this remediation (out of scope - an authorization-
  policy question, not a media-pipeline one).
- No `GET /places/:slug/then-now` convenience route was added (the standalone
  `GET /then-now?placeId=` covers the same query) - can be added trivially later if a
  frontend wants the nested shape.
- `S3Service.readLeadingBytes` (the original small Range-GET helper) is now unused by
  `confirmUpload` (superseded by the combined `getObjectStream` + `hashStream` pass) but was
  left in place as a public method - it is a reasonable primitive for a future caller that
  only needs a header check without a full read, and removing it isn't required by anything
  in this remediation.
