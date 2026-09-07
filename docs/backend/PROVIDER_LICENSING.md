# Dau Viet - Provider + Licensing Architecture (G02)

Global Phase G02, Global Backend V2 Extension. Status: see `docs/backend/GLOBAL_V2_ROADMAP.md` for
the current verdict. Backend V1 (`BACKEND_FREEZE_PASS`) and G01 (`COMPLETE`) are unrelated, frozen
programs - this document does not amend either. Core principle (spec section 66):

> No external dataset can become active unless the platform knows what it is legally and
> technically allowed to do with that data. The platform must FAIL CLOSED when rights are unknown.

## 1. Trust boundary

`ExternalProvider` and everything under it (capabilities, integrations, licenses, data policies,
attribution rules, evidence) is a **separate trust domain** from two other parts of this codebase:

- **V1 historical Source/Citation** (spec sections 38/39): a provider record NEVER becomes
  historical evidence. There is no relation, no shared table, and no code path that promotes
  provider data into `HistoricalFact`/`Citation`. Structurally regression-tested
  (`common/providers/schema-graph.spec.ts`).
- **G01 global geography** (spec section 37): `ExternalProvider`/`ProviderLicense`/
  `ProviderIntegration` have no relation to `Country`/`Region`/`City`/`Destination`. This phase is
  entirely geography-independent; a future phase (G05) is expected to introduce the connecting
  models (`ProviderEntityReference`, `AccommodationIdentity`, etc.) - not G02.

## 2. Rights are tri/four-state, never Boolean

Every legal right (`display`, `cache`, `store`, `modify`, `redistribute`, `commercialUse`) on
`ProviderLicense` is a `ProviderRightState`: `UNKNOWN | ALLOWED | PROHIBITED | CONDITIONAL`. A
plain Boolean was rejected by design (spec section 11) - `false` must never be forced to mean both
"explicitly forbidden" and "nobody has reviewed this yet." `CONDITIONAL` carries its constraint in
`conditionalNotes` (required whenever any right is `CONDITIONAL, enforced in
`ProviderLicensesService.setRights`) - the constraint is always surfaced to the caller via
`ProviderExecutionContext.policy.conditionalNotes`, never silently dropped.

Attribution requirement is a parallel, distinct four-state enum
(`ProviderAttributionRequirement`: `UNKNOWN | REQUIRED | NOT_REQUIRED | CONDITIONAL`) - attribution
is a different kind of obligation than a use-right, so it gets its own state space rather than
being folded into the six rights above.

## 3. The activation gate (fail-closed)

`ProviderRegistryService.getExecutionContext({ providerCode, environment, capability, usage })` is
the **only** safe path to determine whether a given use is currently allowed. It re-evaluates,
fresh from the database, every single time it is called:

1. Provider exists and `status === ACTIVE` (else `PROVIDER_NOT_FOUND` / `PROVIDER_NOT_ACTIVE`).
2. The provider has declared the requested capability (`ProviderCapability` exists) (else
   `PROVIDER_CAPABILITY_UNSUPPORTED`).
3. An integration exists for this provider+environment and is `ACTIVE` (else
   `PROVIDER_INTEGRATION_NOT_CONFIGURED` / `PROVIDER_INTEGRATION_SUSPENDED`).
4. If `credentialMode !== NONE`, a `credentialReference` is configured (else
   `PROVIDER_CREDENTIALS_MISSING`).
5. The capability is enabled for our account (`ProviderIntegrationCapability` exists with a
   non-null `approvedAt`) (else `PROVIDER_CAPABILITY_NOT_ENABLED`).
6. An applicable license exists, is `APPROVED`, and is within its `effectiveFrom`/`effectiveUntil`
   window **checked against wall-clock time on every call** - a runtime check, not a scheduled job
   (spec section 42) - (else `PROVIDER_LICENSE_NOT_FOUND` / `_NOT_APPROVED` / `_EXPIRED` /
   `_REVOKED`).
7. The specific right needed for the requested `usage` is `ALLOWED` - `PROHIBITED`, `UNKNOWN`, and
   `CONDITIONAL` all fail closed identically (else `PROVIDER_USAGE_NOT_ALLOWED`). See "Defects
   found during live QA" below for why `CONDITIONAL` is in this list.
8. If attribution is `REQUIRED` or `UNKNOWN`, a matching `ProviderAttributionRule` with real
   `displayText` (or `logoRequired` + `linkUrl`) must exist (else `PROVIDER_ATTRIBUTION_REQUIRED`).

The pure decision logic lives in `provider-access.util.ts::evaluateProviderAccess` - a
DB-independent function taking plain rows, unit-tested directly with 25 cases covering every
branch above (`provider-access.util.spec.ts`). `ProviderRegistryService` is the only piece that
actually queries Postgres; it fetches **every** license row applicable to the requested capability
(not pre-filtered by status - see defect #2 below) and delegates to that pure function.
**Nothing is cached between the gate and the decision** - a license revocation or a provider/
integration suspension is visible to the very next call, with nothing to invalidate (spec sections
20/42/43/44), and this was live-verified end to end, including through the real registry/Postgres
path, not just the pure evaluator (see `docs/backend/LIVE_QA_REPORT.md`'s G02 section and the
"real registry (not just the pure evaluator)" test in `provider-activation.e2e-spec.ts`).

`ProviderIntegrationsService.activateCapability` (the admin write path) calls this **exact same**
evaluator before stamping `ProviderIntegration.lastVerifiedAt` - so "can this be activated" and
"can this actually be served" can never silently disagree. It is a **separate, later** step from
`enableCapability` (item 5 above) - see "Defects found during live QA" below for why these two are
deliberately not the same action.

## 3a. Defects found during live QA (and fixed within G02 - not deferred)

Two runtime defects and one under-specified behavior were caught by live QA against a real Nest
server + PostgreSQL, not by unit tests alone (the pure evaluator's unit tests were, in each case,
already correct in isolation - the defects were in how the registry/service layer around it wired
things together). All three are fixed in the code this document describes, not left open.

**Defect #1 - capability enablement was incorrectly coupled to the license gate.** The first
implementation of `activateCapability` both checked the full 9-point gate *and* wrote
`ProviderIntegrationCapability` (item 5, "enabled for our account") in the same gated call. Spec
section 19 lists "capability enabled for our account" (item 4) and "license approved" (item 6) as
*independent* checklist entries, and the mandated live-QA flow requires enabling a capability to
succeed as its own step *before* an activation attempt is expected to fail for a missing license.
With the original coupling, enabling could never happen before licensing was already in place,
so every activation attempt failed with the same misleading `PROVIDER_CAPABILITY_NOT_ENABLED`
regardless of the actual blocking reason. **Fix:** split into `enableCapability` (ungated - a plain
declarative "our account has API-level access to this capability" fact, mirroring how
`ProviderCapability` itself just declares provider-level support) and `activateCapability` (fully
gated, requires `enableCapability` to have already run, stamps `ProviderIntegration.lastVerifiedAt`
on success). No schema change was needed - `ProviderIntegrationCapability.approvedAt` always meant
"this account is approved for this capability," never "our license is approved."
**Regression:** `provider-integrations.service.spec.ts`'s `enableCapability`/`activateCapability`
describe blocks. **Live proof:** enabling a fresh integration's capability succeeded with zero
licenses configured anywhere; a subsequent activation attempt then failed with the specific
`PROVIDER_LICENSE_NOT_FOUND` (not `PROVIDER_CAPABILITY_NOT_ENABLED`).

**Defect #2 - the registry pre-filtered licenses to `status: APPROVED` in the database query.**
This made the pure evaluator's `PROVIDER_LICENSE_REVOKED` / `_EXPIRED` (by status) /
`_NOT_APPROVED` (for `DRAFT`/`TERMS_REVIEW`/`LEGAL_REVIEW`) branches **structurally unreachable in
production** - a revoked or under-review license was invisible to the query entirely, so the
evaluator always saw `license: null` and returned the generic `PROVIDER_LICENSE_NOT_FOUND`
regardless of the license's real state. Live QA caught this directly: revoking a previously-active
license produced `PROVIDER_LICENSE_NOT_FOUND` instead of the expected `PROVIDER_LICENSE_REVOKED`,
even though the pure evaluator's own unit tests (which construct the license row by hand and never
touch this query) correctly returned the specific code. **Fix:** `ProviderRegistryService` now
fetches every license row matching the provider+capability regardless of status, and
`pickLicense` selects the single most relevant one by (capability specificity, `APPROVED` status
preferred, most-recently-updated as the final tie-break) - so a valid replacement license is
chosen over an old revoked one for the same capability, but a revoked/under-review license with no
approved competitor is correctly surfaced with its own specific code instead of a generic
not-found. **Regression:** the new `provider-activation.e2e-spec.ts` test ("the real registry (not
just the pure evaluator) returns the correct lifecycle-specific code for every license status")
drives `DRAFT`/`TERMS_REVIEW`/`LEGAL_REVIEW`/not-yet-effective/expired-by-date/`REVOKED` through
the real Postgres-backed registry path. **Live proof:** re-run via curl against the real server -
see `docs/backend/LIVE_QA_REPORT.md`'s G02 section for the exact request/response pairs.

**Correction - `CONDITIONAL` must fail closed, not pass.** The first implementation let a
`CONDITIONAL` right through the gate (surfacing `conditionalNotes` to the caller) on the reasoning
that the constraint would be "surfaced, not silently dropped." On reflection this was wrong:
surfacing a constraint is not the same as *verifying* it, and G02 has no machine-evaluable
condition checker - treating `CONDITIONAL` as effectively `ALLOWED` would let an unverified
constraint slip through as if satisfied. **Fix:** `CONDITIONAL` now fails closed identically to
`PROHIBITED`/`UNKNOWN` (`PROVIDER_USAGE_NOT_ALLOWED`, with the recorded `conditionalNotes` included
in the error message for diagnosability). A future phase may introduce an explicit condition
evaluator and let `CONDITIONAL` pass once its specific condition is actually checked; until then it
is deliberately not distinguished from an unmet right. **Regression:**
`provider-access.util.spec.ts`'s CONDITIONAL test now asserts fail-closed; the same matrix e2e test
above also drives a `CONDITIONAL` right through the real registry.

## 4. Attribution

First-class (`ProviderAttributionRule`), not left to frontend conditionals. A rule may be scoped to
a specific `licenseId`+`capability` (most specific), a `licenseId` alone, a `capability` alone, or
neither (provider-wide default) - `ProviderRegistryService` picks the most specific applicable rule
by a simple specificity score. `logoRequired`/`linkUrl`/`placementNotes` are metadata only; G02
does not download or redistribute any provider logo asset (spec section 15).

## 5. Data retention / cache policy

`ProviderDataPolicy` is deliberately a **separate** model from `ProviderLicense`, even though both
can be scoped by capability, because:

- A License's rights review has a different approval cadence/authority (a full rights
  determination, potentially legal review) than tuning an operational cache-TTL number.
- Every `ProviderDataPolicy` row has a **required** `licenseId` - retention policy can never exist
  without an underlying rights grant to trace back to (structurally enforced,
  `common/providers/schema-graph.spec.ts`).

`ProviderRegistryService` resolves the applicable `ProviderDataPolicy` (scoped to the matched
license + requested capability) into `ProviderExecutionContext.policy` - a caller (future G05 code)
never queries `ProviderDataPolicy` rows directly; it reads `cache`/`maxCacheSeconds`/`store`/
`storeIdentity` off the resolved context. When no `ProviderDataPolicy` row exists yet, those fields
resolve to `UNKNOWN`/`null` - the fail-closed default, never an assumed permission.

## 6. Policy evidence & revision history

- **Evidence** (`ProviderPolicyEvidence`): metadata only - title, source URL, access date, source
  type, a short internal note. Never the full copyrighted terms text (spec section 18). Always
  attached to a `licenseId` (required) - a `ProviderDataPolicy`/`ProviderAttributionRule`'s
  evidence is its License's evidence, transitively, avoiding a second polymorphic evidence table.
- **Revision history** (spec section 17): reuses the **existing** generic `Revision` model (no new
  table) - `EntityKind` gained `PROVIDER`/`PROVIDER_LICENSE`/`PROVIDER_INTEGRATION` additively.
  Every `setRights` call and every `setStatus` call on `ProviderLicensesService` snapshots the full
  license row into a `Revision` (`entityType: PROVIDER_LICENSE`) before/after the change, so "what
  did we believe applied when this was activated" stays answerable without a parallel revision
  mechanism.

## 7. Credential handling

`ProviderIntegration.credentialReference` is an **env-var / secret-manager KEY NAME only** (e.g.
`"GOOGLE_PLACES_API_KEY"`) - never a secret value. No model anywhere in this domain has a field for
an actual secret value (structurally regression-tested: `common/providers/schema-graph.spec.ts`
scans every Provider-related model for `apiKey`/`secret`/`password`/`token`/`clientSecret`-shaped
field names). `.env.example` carries only empty placeholder keys for the credential names this
architecture actually needs - no speculative provider variables were added (spec section 48).
Resolving a `credentialReference` into an actual secret value is explicitly a G05+ adapter
concern, out of scope here.

## 8. Admin authority

Every provider/capability/integration/license/data-policy/attribution-rule mutation requires
`ADMIN` - no `EDITOR` carve-out (spec section 23's "prefer ADMIN for initial V2"). No new role
(e.g. a hypothetical `PARTNERSHIP_MANAGER`) was introduced. A license's `status: APPROVED` means
"approved in product configuration," never "legally certified" (spec section 24) - no field named
anything like `legallyApproved` exists; `reviewedById`/`reviewedAt` record who/when a product
reviewer acted, and `ProviderPolicyEvidence.sourceType: LEGAL_REVIEW` is available for recording
that actual legal counsel review occurred, as a distinct, explicit fact rather than an inferred one.

## 9. No public surface

G02 exposes **zero** public routes (spec section 22) - every controller in
`apps/api/src/modules/providers/` requires `@Roles(ADMIN)`, with no `@Public()` anywhere. This is
pure infrastructure/governance for this phase; a future phase may choose to surface
`provider`/`attribution`/`fetchedAt`/`expiresAt` metadata alongside real provider-backed travel
results, but that is a G05+ decision built on top of this foundation, not part of G02 itself.

## 10. How G05 (or later) should consume this

1. Inject `ProviderRegistryService` (exported from `ProvidersModule`).
2. Call `getExecutionContext({ providerCode, environment, capability, usage })` **every time**
   before making a real provider API call or serving cached provider data - never cache the
   decision yourself; the registry already re-evaluates cheaply on every call.
3. On `ok: false`, fail closed - do not serve any provider-backed content, and surface the
   returned `code`/`message` (do not swallow it).
4. On `ok: true`, use `context.credentialReference` to look up the actual secret from your own
   secret-manager/env layer (never expose it further), respect `context.policy` for
   cache/store/commercialUse decisions, and render `context.attribution` wherever the provider's
   content is displayed.
5. Implement a narrow, typed adapter (e.g. a future `PlacesProviderAdapter`) that also satisfies
   the minimal `ProviderAdapter` shape (`provider-access.types.ts`) - never a generic
   `execute(action, params): any`.
6. Register the real provider (`ExternalProvider`, capabilities, integration, license, data
   policy, attribution rule) via the G02 admin API before any adapter code can succeed - the gate
   fails closed by construction if any of this is missing.

## 11. Seed policy

No real provider is seeded as `ACTIVE`, credentialed, or partnered. See
`docs/backend/PROVIDER_RESEARCH.md`'s summary table - if a future phase chooses to seed the
researched candidates (Google Places, Booking.com, Agoda, Viator, Amadeus) into the Golden Dataset
as architecture-proving fixtures, they must be seeded `DRAFT`/`UNDER_REVIEW`, with every right
`UNKNOWN` unless a specific right was actually quoted from an official source, no
`credentialReference`, and no license `status` beyond `DRAFT`/`TERMS_REVIEW`. G02 itself seeds no
production provider rows at all (see `docs/backend/GLOBAL_V2_ROADMAP.md` for what, if anything,
was ultimately seeded) - the internal `TEST_FIXTURE_PROVIDER_CODE` fixture
(`provider-test-fixture.ts`) exists only for integration/e2e tests and is never seeded into the
production Golden Dataset.
