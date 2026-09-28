# G10 — Affiliate & Commercial Attribution: Final Report

## Verdict: **COMPLETE_WITH_ENVIRONMENT_BLOCKERS**

Not LOCKED. Not a Backend V2 Freeze claim. Does not reopen G00–G09. Does not start G11 or G12.

The verdict is not bare `COMPLETE` for one reason only: no Booking.com Demand API, Agoda Partner API
or Viator Partner API credential (sandbox or production) exists in this environment, so no real
provider adapter could be implemented or live-proven. No provider proof was fabricated. Every live
proof below uses the clearly-named internal fixture provider. See "Environment blockers".

## Baseline

- Branch `main`, HEAD `9931a16 docs: close Country Detail V1 with verified Consumer QA` — unchanged
  since G07 (G07–G10 all remain uncommitted in this working tree, per each phase's "do not commit"
  instruction).
- Working tree at start: the cumulative G07+G08+G09 diff plus the untracked, unrelated
  `frontend-pass-10/`, never touched.
- Full detail: `docs/backend/G10_PRE_IMPLEMENTATION_REPORT.md`.

## Provider policy research

`docs/backend/G10_PROVIDER_POLICY_RESEARCH.md` (retrieved 2026-09-23 from official provider
domains). Confirmed: Booking.com Demand API bearer-token + `X-Affiliate-Id` auth and a `label`
attribution field (partner-gated); Agoda's move to OAuth 2.0 partner-gated access; Viator's 30-day
cookie window and three affiliate access tiers. Specific values that could not be re-confirmed
against a first-party page (Booking.com's exact latest API version, Agoda's legacy-auth deprecation
date, Viator's exact commission percentage and literal campaign parameter name) are flagged
unverified, not asserted. None of these values is hard-coded anywhere in code; provider policy
values live in G02's `ProviderAttributionRule`/`ProviderPolicyEvidence` data.

## Schema

Four additive tables (`AffiliateSession`, `AffiliateClick`, `AffiliateConversion`,
`ProviderBookingReference`), four additive enums (`AffiliateSourceSurface`, `AffiliatePlacement`,
`AffiliateConversionStatus`, `AffiliateEvidenceType`), one additive `EntityKind` value
(`AFFILIATE_CONVERSION`), plus additive relation arrays on `ExternalProvider`/`Trip`/`Destination`/
`User`. Every reference into `Trip`/`Destination`/`User` is nullable with `onDelete: SetNull`
(commercial evidence is detached, never cascade-deleted). No FK to `TripMember`. `AffiliateClick`'s
link to a G05 reference/offer is a soft pointer (no relation, no payload copy), the same pattern as
`TripCostEstimateItem.offerId`. Idempotency key: `@@unique([providerId, providerConversionId])`.
No G05, G06, G08 or G09 model was modified.

## Domain laws (all structurally enforced)

PROVIDER OFFER != AFFILIATE CLICK; CLICK != BOOKING; CLICK != CONVERSION; REDIRECT != CONVERSION;
CONVERSION != PAYMENT; CONVERSION != GUARANTEED COMMISSION; AFFILIATE SESSION != AUTH SESSION.
`AffiliateConversion` is created only by the ADMIN-only ingest endpoint from provider-supplied
evidence. Live-proven: a click, and a click followed by a successful redirect, create zero
conversion rows.

## Policy gate

`ProviderRegistryService.getExecutionContext` (G02) is reused unchanged as the sole gate for both
click creation (`AFFILIATE_LINK`) and conversion ingestion (`CONVERSION_REPORTING`), always with
`usage: 'commercialUse'`. Nothing is cached. Live-proven: eligible provider → successful click →
license revoked → the very next click fails `403 PROVIDER_LICENSE_REVOKED`, no restart. Live-proven:
an otherwise-eligible provider whose more-specific license requires attribution that is not
configured fails `403 PROVIDER_ATTRIBUTION_REQUIRED`. A nonexistent provider fails
`403 PROVIDER_NOT_FOUND`.

## Redirect security

The client supplies only canonical identifiers (`providerCode`, `providerEntityReferenceId`/
`providerOfferId`, `surface`, `placement`, optional `tripId`/`destinationId`/`sessionId`).
`CreateAffiliateClickDto` has no URL field; live-proven that a body containing `url`/`label` is
rejected `400 VALIDATION_ERROR`. The adapter builds the destination server-side, and
`validateRedirectUrl` independently re-validates it: CRLF/control characters rejected before
parsing, `https:` only, userinfo rejected, exact hostname match (never suffix). 16 unit tests cover
the matrix (arbitrary host, http, `javascript:`, `data:`, protocol-relative, userinfo, lookalike
host, subdomain trick, encoded trick, CRLF). Live e2e proves the redirect only ever targets the
approved fixture host over `https:`. The redirect token is `randomBytes(32)` base64url, SHA-256
hashed at rest (the G07/G08 pattern), TTL 300 s (configurable). Replay within the TTL is idempotent
and documented; an unknown token is `404`, an expired one `410`.

## Conversion ingestion, idempotency, out-of-order, reconciliation

`INSERT ... ON CONFLICT (providerId, providerConversionId) DO UPDATE ... WHERE stored.
providerOccurredAt <= EXCLUDED.providerOccurredAt RETURNING ...` inside one `$transaction` (the
G08/G09 newer-wins pattern), with `COALESCE` so a later evidence update never clobbers an existing
click/session/booking-reference link. Zero rows returned is disambiguated into an idempotent
duplicate (same `providerOccurredAt`, no-op) or `409 AFFILIATE_CONVERSION_STALE_EVIDENCE`. Real
PostgreSQL proofs (`affiliate.e2e-spec.ts`): duplicate delivery → exactly one row; status update
(cancel, reverse) updates the same row in place; older evidence cannot override newer (row stays
`CONFIRMED`); two simultaneous ingestions of the same conversion → exactly one row, both `201`;
forced rollback (a real unique-constraint violation mid-transaction, after a conversion row was
already written, leaves no partial state). Reconciliation is deterministic-only via the
provider-echoed `campaignKey` scoped to the provider; valid evidence without a match is retained
with `affiliateClickId = null`, never fabricated. Missing commission is stored as `null`. Money is
`Decimal(12,2)` via G09's `parseMoney`; booking and commission currencies are independent; no FX.

## Authorization

`POST /v1/affiliate/clicks` and `GET /v1/affiliate/r/:token` are `@Public()`; the click route adds
`OptionalJwtAuthGuard` (new; never throws, captures identity when present) so anonymous callers work
and authenticated callers are attributed. A `tripId` on a click requires an authenticated current
participant (`VIEW_TRIP`, reused unchanged). `/v1/admin/affiliate/**` (list conversions, summary,
ingest) is `ADMIN` only. No new `TripCapability`. Live-proven: anonymous/USER/unrelated get `403`/
`401` on every admin route, and a trip OWNER/EDITOR/VIEWER token gets no commercial access. See
`AUTHORIZATION_MATRIX.md`'s "G10 extension".

## Privacy and retention

No traveler name, passport, phone, email, billing address, card data, GPS or auth token exists in
any G10 model (live-proven by inspecting stored click rows and click responses). `campaignKey` is a
random opaque value, never derived from PII. No cookie is set by the backend. No raw provider payload
is stored, only normalized fields plus an evidence hash and reference. Retention is documented as
policy (session 90 d, click 180 d, conversion/booking reference per contractual need); no automatic
deletion job was built, matching existing codebase precedent (pre-implementation report §10).

## Defects found and fixed during e2e (disclosed, not left latent)

1. **Adapter lookup by exact code.** `AffiliateAdapterRegistry.get` matched only the literal fixture
   code, so any fixture provider row with a unique suffixed code (required by the unique
   `ExternalProvider.code` when tests need isolated rows) threw an unhandled `AdapterNotFoundError`
   (`500`). The unit tests used the exact constant and could not see it. Fixed: exact match first,
   then an `<adapterCode>_` prefix match. Real providers still map one-to-one; the security gate
   remains the exact-code G02 lookup, so the prefix rule cannot widen access.
2. **`IngestAffiliateConversionDto.evidence` had no validator.** With the global
   `whitelist + forbidNonWhitelisted` pipe, an undecorated property is rejected, so every ingest
   returned `400`. Unit tests bypass the pipe and could not see it. Fixed with `@IsObject()`.
3. Test-only issues (not product defects): `/v1/auth/register` throttle (5/60 s) exceeded by the
   e2e `beforeAll`; incomplete rights payload to the G02 rights endpoint; provider code casing
   (`@Transform(upper)`); and a 30 s hook timeout under full-suite load, raised to 60 s (precedent:
   three existing e2e files use 60 s). No assertion was weakened.

## Migration / Path A / Path B / seed

- One additive migration `prisma/migrations/20260925000000_g10_affiliate_attribution`, generated by
  diffing the live dev database against the working schema (`prisma migrate diff --from-url ...
  --to-schema-datamodel ... --script`, no shadow database), with the pre-existing `EntityKind.FACT`
  add and 17 trigram/GIST `DROP INDEX` drift artifact stripped, as in every phase since G04. No
  prior migration folder changed.
- **Path A** (fresh database, real run): created `dauviet_path_a`; applied all 23 migrations
  (`migrate status` up to date); ran `prisma/seed.ts` twice with byte-identical output; the four
  G10 tables start at 0 rows and `Country`/`Destination` counts did not double; `nest build` clean;
  booted the real compiled app, `/v1/health` all `ok`; smoked the full G10 flow over real HTTP
  (register → promote ADMIN → create and fully activate a fixture provider through the real G02
  admin API → click `201` → redirect `302` to `https://www.fixture-provider.example/...` → ingest
  `201` → list → summary); stopped the server and dropped the database.
- **Path B**: performed earlier in this phase against the live dev database: the G10 migration
  alone applied, with before/after row counts and hashes for Trip/Country/ExternalProvider/
  TripExpense and the G08/G09 tables byte-identical, and the four new tables empty.
- No fake commercial data was seeded (`prisma/golden/*` untouched).

## Tests

- **Unit:** 93/93 suites, 1197/1197 tests (G09: 1151, +46). New: redirect-security util (16),
  clicks service (11), conversions service (10), reporting service (4), fixture adapter (5). Zero
  assertions weakened. Final full run after the last source edit (lint-only import removals in two
  spec files): 93 passed / 93 total suites, 1197 passed / 1197 total tests.
- **E2E (real PostgreSQL + Redis, `--runInBand`):** 11/11 suites, 157/157 tests (G09: 126, +31 new
  in `affiliate.e2e-spec.ts`): redirect flow, policy gate including live revocation and missing
  attribution, open-redirect live proof, full conversion matrix, concurrent duplicate ingestion,
  forced rollback, authorization matrix, privacy matrix, G09 and G08 regression checks.
- `openapi-contract.spec.ts`: 32/32.

## Regression

G02 (`provider-activation.e2e-spec.ts`), G05 (`stay-food-activities`), G06 (`trips`,
`cost-assumptions`), G07/G08/G09 (`trip-location`, `trip-expense`, `trips`) all pass unchanged.
The affiliate module imports no G08 or G09 symbol beyond G09's pure `parseMoney` utility and G07's
`TripAuthorizationService`; no G10 code path writes `TripExpense`, `TripSettlement`, location rows,
`TripCostEstimate*`, or any G05 offer/reference row (live regression tests for G09 and G08).

## OpenAPI

Regenerated from the real app: 311 path templates (+5 from G09's 306): `POST /v1/affiliate/clicks`,
`GET /v1/affiliate/r/{token}`, `GET /v1/admin/affiliate/conversions`,
`GET /v1/admin/affiliate/summary`, `POST /v1/admin/affiliate/conversions/ingest`. No existing path
changed.

## Sensitive-data scan and public API leak scan

Grep over `apps/api/src/modules/affiliate` for credentials, PAN/CVV, bearer, password: only
Swagger's `@ApiBearerAuth()` and the redirect validator's userinfo rejection. No secret, token or
`DATABASE_URL` in the G10 diff or docs. `Affiliate*`/`ProviderBookingReference` are referenced only
inside `apps/api/src/modules/affiliate/**`; no public module exposes them. The only fixture
credential string (`E2E_G10_FIXTURE_KEY_REF`) is a reference name, and the e2e proves the click
response never echoes it.

## Working-tree isolation

`frontend-pass-10/` untouched. Only read-only git commands were used (`git status`, `git log`,
`git diff`); no add/commit/push/reset/restore/stash/clean/rebase/cherry-pick/amend. The
temporary Path A database was dropped; the two local API server processes started for the smoke test
were stopped.

## Environment blockers

| Provider | Missing | Effect |
|---|---|---|
| Booking.com | Managed Affiliate Partner approval, Demand API bearer token, `X-Affiliate-Id` | no real adapter, no live redirect/report proof |
| Agoda | Partner Program access, OAuth 2.0 client credentials | same |
| Viator | Partner API key and an approved affiliate access tier | same |

To close each blocker: obtain the credential and agreement, store it in secret infrastructure and
`ProviderIntegration.credentialReference` (never in code or docs), register a new adapter in
`AffiliateAdapterRegistry` (additive, no pipeline change), verify the parameter shape against the
first-party docs, and re-run the live redirect/report proof in the provider's sandbox.

## Scope exclusions (confirmed, none built)

No Dấu Việt Booking aggregate, checkout, Wallet/Payment/PaymentIntent/Charge/Payout/Card/BankAccount
model, exchange-rate service, ledger/invoice/tax system, generic webhook receiver, cross-site
profiling, or automatic G09 expense creation. No G11/G12 code.

## Known risks (carried forward, none blocking)

1. Real provider adapters are not implemented; the adapter requirement is met at the
   interface/registry/fixture level.
2. No automatic retention-deletion job; retention is documented policy only.
3. Replay of a redirect token within its TTL is intentionally idempotent, and the destination is
   pre-validated at click time, not re-evaluated at redirect time.
4. `OptionalJwtAuthGuard` is new shared infrastructure, applied locally beside `@Public()` so the
   global `JwtAuthGuard` was not modified.
5. Provider values that could not be re-verified (see research doc) must be re-checked before a
   real adapter ships.

## P0 / P1

None.

## Individual gate manifest

See `docs/backend/G10_ACCEPTANCE_GATE_MANIFEST.md` — 164 gates, all `PASS` or
`PASS — NOT APPLICABLE`, 0 `FAIL`, 0 `UNVERIFIED`.

## After G10

G11 and G12 remain NOT STARTED. Backend V2 Freeze remains NOT CLAIMED. G10 is not independently
labeled LOCKED.
