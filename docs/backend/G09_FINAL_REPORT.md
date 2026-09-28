# G09 — Trip Expense & Settlement: Final Report

## Verdict: **COMPLETE**

Not LOCKED. Not a Backend V2 Freeze claim. Does not reopen G00–G08. Does not start G10.

## Baseline

- Branch: `main`, HEAD: `9931a16 docs: close Country Detail V1 with verified Consumer QA` —
  unchanged since G07/G08 (all still uncommitted in this same working tree, per each phase's own
  "do not commit" instruction).
- Working tree at start: the full G08 diff plus one untracked, unrelated directory
  `frontend-pass-10/`, never touched.
- Full detail: `docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md`.

## Pre-audit summary

Money/currency conventions, cost-category reuse, concurrency patterns (pre-check-only vs. true
conditional `updateMany`), idempotency infrastructure (none to reuse), and the migration-history
drift artifact (`EntityKind.FACT` + 17 trigram/GIST index drops, stripped exactly as G04–G08 each
did) were all audited before any schema change — see the pre-implementation report sections 3–5, 15.

## Schema

Three additive tables (`TripExpense`, `TripExpenseShare`, `TripSettlement`), one additive
`TripExpenseSplitMode` enum, one additive `EntityKind` value (`TRIP_EXPENSE`... plus
`TRIP_SETTLEMENT`), four additive `TripCollaborationEventType` values. No FK from any G09 table to
`TripMember` — only to `User`, which this codebase never hard-deletes. No field added to
`TripMember`/`Trip` beyond the standard additive relation arrays. `TripCostEstimate`/
`CostAssumption` (G06) are completely untouched — confirmed by inspection that no G09 code path
reads or writes either.

## Money representation, currency validation, minor-unit strategy

Uniform `Decimal(12,2)` for every currency (matches every other money column in this schema — no
per-currency minor-unit table exists anywhere, and none was invented). Client amounts are accepted
as decimal strings (`@IsNumberString()`), never JS numbers. Currency codes use the exact same bare-
`String` + `@Matches(/^[A-Z]{3}$/)` + uppercase-transform convention as `Trip.primaryCurrency` — no
new currency-specific error code was needed (a malformed code 400s via the ordinary
`VALIDATION_ERROR` envelope, same as `Trip.primaryCurrency`'s own behavior). Full detail:
`G09_TRIP_EXPENSE_SETTLEMENT.md` sections 1–2.

## Rounding

`split-money.util.ts` (new, the first rounding/remainder-distribution utility in this codebase)
centralizes all three split modes. 21 dedicated unit tests
(`split-money.util.spec.ts`) cover the brief's own required rounding cases: 100/3, a larger
remainder over three people, a percentage remainder, a large amount (`9999999999.99`) split seven
ways, a zero-decimal-currency-shaped whole number, and an uneven two-decimal-currency split — every
case proven to sum back to the original total exactly, with deterministic, stable (`userId`-
ascending) remainder placement, never randomized. `parseMoney` rejects more than 2 decimal places,
non-finite input, and overflow beyond `Decimal(12,2)`'s maximum magnitude — never silently rounds or
truncates.

## Expense lifecycle

Create/update are atomic (expense + shares + audit + collaboration event, one `$transaction`,
`withDeadlockRetry`-wrapped). Update is a full replace (title/category/amount/currency/payer/
splitMode/occurredOn/note + the complete share set) — matching the "replace the entire set" idiom
G06's itinerary sub-resources already use, never a partial patch. Delete is a soft delete
(`deletedAt`) — excluded from the default list and every balance/summary/suggestion projection,
still readable by id, `AuditLog` unaffected.

## Split modes

EQUAL/EXACT/PERCENTAGE all implemented; `sum(resolved shares) === amount` proven in every mode
(unit + e2e). No additional mode was added. Payer-included and payer-excluded (zero-share payer)
both proven with the brief's own worked example (§20/21: A pays 900, A/B/C each consume 300 → A
net +600, B/C net −300 each).

## Authorization

No new `TripCapability` was added — `VIEW_TRIP` gates every read (VIEWER included), `EDIT_TRIP`
gates every mutation including settlement recording. Full role matrix (OWNER/EDITOR/VIEWER/
UNRELATED/UNAUTHENTICATED/PENDING-INVITE) proven live across list/detail/create/edit/delete/
summary/suggestions/settlement-read/settlement-write. See `AUTHORIZATION_MATRIX.md`'s "G09
extension" section.

## Former-member semantics

Structural, not a runtime safeguard: no relation path exists from `TripMember` to any G09 table, so
member removal/leave/role-change/ownership-transfer cannot cascade into financial history no matter
what. Live-proven: a removed member's prior expenses/shares remain fully visible to current
participants (payer id, amounts, everything), while the removed member's own API access is denied
(403) on the very next request with their unchanged JWT. A current member cannot add a removed/left
user to a **new** expense (fails closed with `TRIP_EXPENSE_PARTICIPANT_INVALID`). Ownership transfer
proven to leave every expense/share/balance byte-for-byte identical.

## Archive semantics

Archived trip: reads (list/detail/summary/suggestions/settlements) remain available; every mutation
(`create`/`update`/`delete` expense, settlement `create`) is rejected with `409 TRIP_ARCHIVED`;
balances/history are provably unchanged before vs. after archiving (byte-identical response body).

## Soft delete

Covered above (Expense lifecycle). Live-proven: excluded from list, present in detail with
`deletedAt` set, excluded from `summary`'s balance projection.

## Optimistic concurrency + race proofs (all real PostgreSQL, `--runInBand`)

- **Edit/edit** (§34): two concurrent `PATCH` requests with the same `expectedVersion` against the
  same expense — exactly one `200`, one `409`, final stored title matches whichever won, version
  increments exactly once. Deterministic by construction (see "Lock-ordering incident" below — full
  serialization per trip means no ambiguous outcome here, unlike a per-user-row design).
- **Edit/delete** (§35): two concurrent requests (one `PATCH`, one `DELETE`) with the same
  `expectedVersion` — exactly one wins; if delete wins, the concurrent edit is rejected `404` (gone,
  not merely stale) and the title is proven never to have applied; if edit wins, the concurrent
  delete is rejected `409` (stale version) and the row is proven not deleted. A deleted expense is
  never resurrected either way.
- **Member-removal-vs-create** (§36): a real race between an EDITOR's `POST .../expenses` and the
  OWNER's `DELETE .../members/:id` for that same EDITOR — no 500s, internally consistent result, and
  a **sequential, non-racing follow-up** proves the block is permanent (the same JWT is denied every
  time once removal has genuinely landed).
- **Role-downgrade-vs-mutation** (§37): same pattern, racing `POST .../expenses` against
  `PATCH .../members/:id` (EDITOR→VIEWER) — permanent-block follow-up proven.
- **Archive-vs-mutation** (§38): same pattern, racing `POST .../expenses` against
  `POST .../archive` — permanent-block follow-up proven (`409 TRIP_ARCHIVED` on every subsequent
  attempt).
- **Forced rollback** (§84): a genuine PostgreSQL unique-constraint violation
  (`@@unique([expenseId, userId])`) was engineered directly via Prisma inside a transaction that
  first updates the expense's title/version, then deletes its old shares, then attempts to insert a
  duplicate-userId share pair. The whole transaction throws and rolls back; a fresh read proves the
  title, version, AND the original share set are all fully intact — nothing partially committed.
  (This specific sequence could not be reached through the HTTP API itself, since the service's own
  duplicate-userId validation prevents constructing such a request — a genuine defensive property,
  not a gap; the forced-rollback proof deliberately bypasses the API to exercise the underlying
  transactional guarantee the API's defense relies on.)

### Lock-ordering incident (found and fixed live, not left latent)

The first working version of `lockTripAndAssertMutable` (the transaction-internal re-validation
guard shared by every G09 mutation) locked the `Trip` row first, then the `TripMember` row second —
matching `TripMembersService.transferOwnership`'s own internal order, which the pre-implementation
audit had already identified as one of two conflicting lock orders already present in the locked G07
baseline (`transferOwnership` locks `Trip`-then-`Member`; `remove`/`updateRole` lock `Member`-then-
`Trip`).

Running the member-removal-vs-create race test (above) against the real PostgreSQL instance
produced a genuine `40P01` deadlock: `TripMembersService.remove`'s transaction (locking `TripMember`
then `Trip`) and the concurrent expense-create transaction (locking `Trip` then `TripMember`)
deadlocked on each other, and Postgres aborted one side with a raw `PrismaClientUnknownRequestError`
that the original `withDeadlockRetry` (which only recognized Prisma's own `P2034` code) did not
catch, surfacing as an unhandled `500`.

Fixed by: (1) reordering `lockTripAndAssertMutable` to lock `TripMember` first, then `Trip` second —
matching `remove`/`updateRole`'s order exactly, eliminating that specific deadlock; and (2)
broadening `withDeadlockRetry` to also recognize a raw `40P01` "deadlock detected" message inside a
`PrismaClientUnknownRequestError`, as a safety net for the narrower, still-present tension with
`transferOwnership` (which locks the opposite order and was not modified — it is G07 locked code).
Re-run of the full race suite after the fix: clean, zero deadlocks, all tests green. This is
disclosed in detail rather than presented as if the final design were the first attempt.

## Balance formula, conservation, multi-currency

Formula, sign convention, and the "by construction" conservation proof are documented in the pre-
implementation report §8 and the contract doc §8, and verified two ways: 8 unit tests against
`TripFinanceSummaryService` with hand-computed expected balances (including the brief's own §20
worked example and the §49 settlement-effect worked example), and a live e2e conservation test
matrix (single expense, payer-included, payer-excluded, 3-way equal, exact, percentage, multiple
expenses, a settlement, a former member, a soft-deleted expense — `sum(net) == 0` to within 1e-6).
Multi-currency isolation (VND/JPY/USD) proven live — three independent per-currency totals, no
conversion, no cross-currency aggregation.

## Settlement suggestions

Deterministic greedy debtor/creditor matching, `userId`-ascending stable ordering, proven
deterministic (repeated calls on the same ledger produce byte-identical output), proven to zero
every balance when conceptually applied, proven never to cross currencies.

## Manual settlement

Implemented (pre-audit confirmed it fits cleanly — see pre-implementation report §"TripSettlement
implemented only after pre-audit"). Append-only (GET+POST only, no edit/delete route). Validates
`fromUserId != toUserId`, a positive amount, and both parties as current trip participants. Never
clamped to the currently-suggested balance — an intentional over-settlement is accepted structurally
(live-proven).

## Audit / collaboration activity

Every expense create/update/delete and every settlement create writes an `AuditLog` row
(`TRIP_EXPENSE`/`TRIP_SETTLEMENT` entity types) inside the same transaction, and a
`TripCollaborationEvent` (`EXPENSE_ADDED`/`EXPENSE_UPDATED`/`EXPENSE_DELETED`/
`SETTLEMENT_RECORDED`). Live-proven: collaboration-event metadata never contains the monetary
amount (grepped for known test amounts, none found, and no key resembling "amount"); audit metadata
never contains the free-text note (grepped for a known secret test note, not found — audit metadata
does carry `amount`/`currency`/`category`/`payerUserId` deliberately, which is a security/evidence
trail, not the user-facing activity feed the brief's §61 specifically restricts).

## Migration / Path A / Path B / seed

- One additive migration (`prisma/migrations/20260924000000_g09_trip_expense_settlement`), generated
  by diffing the live dev database (already at the accepted G08 baseline) against the working
  schema (`prisma migrate diff --from-url <DATABASE_URL> --to-schema-datamodel prisma/schema.prisma
  --script`) — a read-only introspection of the FROM side, no shadow database touched at all, since
  G08's own changes were never committed to git (so a `--from HEAD`-style diff would have bundled
  G08 and G09 together). One spurious `EntityKind.FACT` add plus 17 trigram/GIST `DROP INDEX`
  statements — the same pre-existing drift artifact every phase since G04 has found and stripped —
  were manually removed before the migration was placed. Zero changes to any prior migration folder
  (confirmed).
- **Path A** (fresh isolated database, real run): created `dauviet_path_a`; applied all 22
  migrations from scratch (clean, `prisma migrate status` reports "up to date"); ran
  `prisma/seed.ts` twice — byte-identical output, no duplicate-key errors, row-count check confirmed
  no doubling and confirmed all three new G09 tables start empty; built (`nest build`, clean);
  booted the real compiled app — `/v1/health` reported all-`ok`; smoke-tested the full G09 flow over
  real HTTP (register → login → create trip → create expense → summary → suggestions →
  settlements-list), all correct; shut down cleanly and dropped the disposable database.
- **Path B** (pre-existing accepted state, real run against the actual dev database): captured
  BEFORE — migration status, row counts (`Trip` 3, `TripMember` 3, `TripInvitation` 12,
  `TripCollaborationEvent` 14, `TripLocationSharing` 0, `TripMemberLocation` 0, `User` 90, `Country`
  2, `AuditLog` 1542), and deterministic hashes (`md5` of sorted `Trip.id`, `md5` of sorted
  `Country.canonicalSlug`). Applied only the G09 migration. Captured AFTER — every count and both
  hashes byte-identical; the three new tables existed with zero rows. `User`/`AuditLog` growth after
  that point is this session's own e2e test-data churn (cleaned per-suite in each file's own
  `afterAll`), never a G09 migration effect.
- No fake personal expense data was seeded into the Golden Dataset (`prisma/golden/*` untouched;
  the new tables start and remain empty in the seed).

## Unit tests

88/88 suites, 1151/1151 tests (up from G08's 1150 — one net regression fixture update plus new
tests). New: `split-money.util.spec.ts` (21), `trip-financial-guard.util.spec.ts` (11, later extended
to 12 to cover the lock-ordering fix), `trip-expenses.service.spec.ts` (19), `trip-settlements.
service.spec.ts` (6), `trip-finance-summary.service.spec.ts` (7, one assertion simplified during
lint cleanup). Zero assertions weakened.

## E2E tests (real PostgreSQL + Redis)

10/10 suites, 126/126 tests (up from G08's 91), `--runInBand`. New: 35 tests in
`trip-expense.e2e-spec.ts` — authorization matrix, all three split modes, edit/delete/version-
conflict, all five required real-PostgreSQL race proofs (including forced rollback), former-member
preservation, archive, settlement (including the never-clamped over-settlement case), the full
conservation matrix, multi-currency isolation, settlement-suggestion determinism, and three leak-
scan tests.

## G08 regression

All pre-existing G08 unit/e2e tests pass unchanged; `trip-location.e2e-spec.ts` (29 tests) green,
proving G09's membership-transaction interactions (none — see pre-implementation report §11) did
not regress location privacy.

## G07 regression

All pre-existing G07 unit tests pass; the extended `trip-members.service.spec.ts` mocks (already
extended for G08) needed no further change for G09 (G09 adds zero lines to `trip-members.
service.ts`).

## G06 regression

All pre-existing G06 unit/e2e tests pass unchanged, including `trips.e2e-spec.ts` and
`cost-assumptions.e2e-spec.ts`. Confirmed by inspection that no G09 code path touches
`TripCostEstimate`/`CostAssumption`/`TripCostEstimateGeneration`/`TripCostEstimateItem` at all.

## G05 regression

Not applicable to touch — confirmed no G09 code references any G05 provider/offer table.

## G06.5 regression

Not disturbed — no ingestion code touched; `shadow-database-guard.spec.ts` passes as part of the
full unit run.

## OpenAPI

Regenerated from the real running app: 306 paths (+5 from G08's 301) — the five new G09 routes.
`openapi-contract.spec.ts`'s no-drift assertion passes.

## Sensitive-data scan

Full session diff scanned for API keys, `DATABASE_URL`, OAuth tokens, raw JWTs, private-email
patterns — none found. Test fixtures use the same synthetic password (`E2eTest-Pass!1`) and
synthetic amounts/notes already used throughout this codebase's e2e suites — never real personal
financial data.

## Public API leak scan

Grep-based module-boundary scan: `TripExpense`/`TripSettlement` are referenced only inside
`apps/api/src/modules/trips/**` — no public destinations/countries/regions/cities/stories/journeys/
search/community/map/SEO module references either type.

## Working-tree isolation

`frontend-pass-10/` untouched throughout. No unrelated file modified. Only read-only git commands
used this session (`git status`, `git diff`, `git log`, `git show`) — no add/commit/push/reset/
restore/checkout/stash/clean/rebase/cherry-pick/amend.

## Scope exclusions (confirmed, none built)

No Wallet/Payment/PaymentIntent/Charge/Capture/Payout/StoredValue/BankAccount/Card/Escrow model. No
FXRate/ExchangeRate/CurrencyConversion model or exchange-rate service call. No payment-provider
integration (PayOS/Stripe/PayPal/MoMo/ZaloPay/Apple Pay/Google Pay/bank transfer APIs). No booking/
OTA checkout. No receipt/OCR pipeline. No tax/VAT/accounting engine. No expense geolocation or
location history. No G10/G11/G12 code.

## Known risks (carried forward, none blocking)

1. A narrow, still-present lock-order tension between G09's financial-mutation transactions and
   `TripMembersService.transferOwnership` (which locks `Trip` before `TripMember`, the opposite of
   G09's now-`TripMember`-first order) remains theoretically possible under a concurrent ownership
   transfer racing a financial mutation by a non-owner member. Not exercised by any required test
   (the brief's race list covers removal/downgrade/archive, not concurrent self-transfer), mitigated
   by `withDeadlockRetry`'s single automatic retry, not eliminated.
2. No idempotency protection on expense/settlement creation — a network retry can create a
   duplicate row, matching every other `POST` create route in this codebase.
3. Money is uniformly 2-decimal-place `Decimal(12,2)` for every currency including zero-decimal ones
   like JPY, matching G06's own established precedent.
4. G07's own e2e-coverage/documentation gap (noted in G08's pre-implementation report) remains
   unfixed — out of scope for G09 too.

## P0 / P1

None.

## Individual gate manifest

See `docs/backend/G09_ACCEPTANCE_GATE_MANIFEST.md` — 240 gates, all `PASS` or `PASS — NOT
APPLICABLE`, 0 `FAIL`, 0 `UNVERIFIED`.

## After G09

G10, G11, G12 remain NOT STARTED. Backend V2 Freeze remains NOT CLAIMED. G09 is not independently
labeled LOCKED.
