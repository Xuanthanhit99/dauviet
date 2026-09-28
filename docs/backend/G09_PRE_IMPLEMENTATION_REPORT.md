# G09 — Trip Expense & Settlement: Pre-Implementation Report

## 1. Branch / HEAD / working-tree state

- Branch: `main`, HEAD: `9931a16 docs: close Country Detail V1 with verified Consumer QA` — unchanged
  from G08 (G08's own work is still uncommitted in this same working tree, per that phase's explicit
  "do not commit" instruction; G09 builds directly on top of it, exactly as G08 built on top of G07's
  own uncommitted state).
- `git status --short`: the full G08 diff (modified: `trip-error-codes.ts`, `configuration.ts`,
  `trip-members.controller/service(.spec).ts`, `trips.module.ts`, `trips.service(.spec).ts`,
  `AUTHORIZATION_MATRIX.md`, `BACKEND_HANDOFF.md`, `GLOBAL_V2_ROADMAP.md`, `openapi.json`,
  `prisma/schema.prisma`; new: the G08 service/DTO/util files, `trip-location.e2e-spec.ts`, four
  `G08_*.md` docs, the G08 migration folder) plus one untracked, unrelated directory
  `frontend-pass-10/`.
- Nothing will be reopened in G00–G08 without a demonstrated blocker (none found — see below).

## 2. Concurrent-owned files

`frontend-pass-10/` is left untouched, as in every prior phase. No other concurrent-owned files
overlap G09's paths (`apps/api/src/modules/trips/**`, `prisma/schema.prisma`,
`prisma/migrations/**`, `docs/backend/**`).

## 3. Existing money/currency utilities (audited)

- **Decimal, never Float**: every monetary column in this schema is `Decimal @db.Decimal(12, 2)`
  (`Trip.targetBudgetAmount`, `CostAssumption.low/typical/highAmount`, `TripCostEstimate.totalAmount`,
  `TripCostEstimateItem.amount`) — a **uniform 2-decimal-place** scale for every currency. **No
  per-currency ISO 4217 minor-unit metadata table exists anywhere in this codebase** (confirmed by
  schema-wide search) — G06 never special-cased zero-decimal currencies (e.g. JPY) or 3-decimal ones
  (e.g. BHD); a JPY amount is stored/computed at the same `Decimal(12,2)` scale as every other
  currency. G09 follows this exact established precedent rather than inventing new per-currency
  precision (spec section 54's own explicit instruction: document the strategy rather than invent
  one). This is stated plainly as a known, accepted limitation in `G09_TRIP_EXPENSE_SETTLEMENT.md`.
- **Client-facing amount encoding**: `CostAssumptionsService`/`CreateCostAssumptionDto` accept
  amounts from the client as **strings** (`@IsNumberString()`), converted server-side via
  `new Prisma.Decimal(str)` — never a JS `number` at the DTO boundary, and comparisons use
  `Decimal`'s own methods (`.lessThanOrEqualTo`, etc.), never `<`/`>` on parsed floats. G09 follows
  this exactly for `TripExpense.amount`, `TripExpenseShare.amount`/`percentage`, and
  `TripSettlement.amount`.
- **Currency code validation**: `Trip.primaryCurrency`/`CostAssumption.currency` both use a bare
  `String` column + a DTO-level `@Matches(/^[A-Z]{3}$/)` + uppercase `@Transform` — **no live ISO
  4217 membership check exists anywhere**, and `TRIP_ERROR_CODES.TRIP_INVALID_CURRENCY` is defined
  but never actually thrown by any code path (dead/reserved). G09 reuses the identical DTO-level
  regex convention for `TripExpense.currency`/`TripSettlement.currency` — a malformed code 400s via
  the ordinary `VALIDATION_ERROR` envelope, matching `Trip.primaryCurrency`'s own behavior exactly;
  no new currency-specific error code is introduced.
- **`Trip.primaryCurrency` is display/planning context only** (spec section 13, confirmed by
  `TripCostEstimate`'s own multi-currency-partition design in G06) — G09 does not require
  `TripExpense.currency`/`TripSettlement.currency` to match it.
- **Rounding/remainder-distribution utility**: none exists yet (`aggregate-estimate.ts` only sums
  pre-resolved `Decimal` amounts, never splits or rounds). G09 introduces one, `split-money.util.ts`
  (see section 6/7 below) — the first of its kind in this codebase.

## 4. G06 cost category / cost estimate semantics (audited, untouched)

`CostCategory` (`STAY`/`FOOD`/`ACTIVITY`/`TRANSPORT`/`OTHER`) is reused verbatim for
`TripExpense.category` (spec section 8) — no duplicate taxonomy invented. `TripCostEstimate`/
`TripCostEstimateGeneration`/`TripCostEstimateItem`/`CostAssumption` are **not modified in any way**
— confirmed by inspection that no G09 code path writes to or reads from these tables at all (spec
sections 6/7: an estimate is never mutated into an expense, and no automatic estimate→expense or
G05-offer→expense conversion is built).

## 5. G06 optimistic concurrency (audited — two different existing strengths)

Two genuinely different concurrency patterns already coexist in this codebase:

1. **Pre-check only** (`TripsService.update`, `TripItineraryService.replaceDestinations`/etc.,
   `TripMembersService.updateRole`/`.remove`): `assertVersion`/`authz.authorize` runs *before* the
   `$transaction`, which then unconditionally writes (`tx.trip.update({data:{version:{increment:1}}}
   )` with no `WHERE version = expectedVersion` guard). This tolerates a narrow TOCTOU race for
   ordinary field/itinerary edits — an accepted, if imperfect, existing convention, not something
   G09 may "fix" (out of scope, locked files).
2. **True conditional `updateMany`** (`TripMembersService.transferOwnership` only): `WHERE id=$1 AND
   ownerId=$2 AND version=$3` as the transaction's real atomicity mechanism, specifically because
   G07 required a live-proven one-owner invariant under concurrency.

G09's own spec (sections 33/34/83) explicitly requires the **same live-proven strength** as pattern
2 for expense edit/edit races — so `TripExpensesService.update`/`.delete` use the true conditional
`updateMany` pattern (`WHERE id=$1 AND version=$2 AND deletedAt IS NULL`), not the weaker pre-check-
only pattern. This is a stricter reuse of an existing, already-accepted G07 idiom, not a new
invention.

**Lock-ordering finding (a genuine pre-existing tension in locked G07 code, not fixed here)**:
`TripMembersService.remove`/`.updateRole` lock the `TripMember` row first, then the `Trip` row
second (inside their `$transaction`, in that literal statement order); `TripMembersService.
transferOwnership` locks the `Trip` row first (via its conditional `updateMany`), then `TripMember`
row(s) second. These two already-locked G07 methods use **opposite lock orders** for the two rows
they both touch — a latent, pre-existing deadlock possibility between a concurrent `updateRole`/
`remove` and `transferOwnership` call that predates G09 and is out of scope to fix. G09's own new
financial-mutation transactions (section 12 below) pick ONE consistent order — Trip row first, then
TripMember row second, matching `transferOwnership`'s order — and add a single-retry-on-deadlock
safety net (`Prisma.PrismaClientKnownRequestError` code `P2034`) around exactly these transactions,
since a narrow-window conflict with `remove`/`updateRole`'s opposite order remains theoretically
possible. This is documented as a known risk in the final report, not silently ignored.

## 6. Split representation (design decision)

`TripExpense.splitMode` (`EQUAL`/`EXACT`/`PERCENTAGE`) lives on the expense itself — one split mode
per expense, all of its `TripExpenseShare` rows resolved under that one mode. Each share always
carries the **final resolved monetary `amount`** regardless of mode (so every downstream balance/
summary computation reads one uniform field); `PERCENTAGE` mode additionally stores the user's
original `percentage` input alongside the resolved `amount`, for display/audit fidelity. `EXACT`/
`EQUAL` store no extra metadata — the amount is self-explanatory.

## 7. Rounding / minor-unit strategy (design decision)

Fixed at 2 decimal places for every currency (section 3 above). New `split-money.util.ts`:

- **EQUAL**: `raw = total / N` (full `Decimal` precision), floored to 2dp per participant
  (`ROUND_DOWN`), then the remaining minor-unit remainder (always `0 <= remainder < N`) is
  distributed one minor unit (0.01) at a time to participants **sorted by `userId` ascending** — a
  stable, deterministic order independent of the client's request-array order, so the exact same
  `(total, participant set)` always resolves to the exact same shares no matter how the client
  ordered its request.
- **PERCENTAGE**: percentages must sum to *exactly* 100.00 (`Decimal` equality, not a float
  tolerance-band); each participant's raw share (`total * percentage / 100`) is floored to 2dp, then
  the same userId-ascending remainder distribution as EQUAL closes the gap to `total` exactly.
- **EXACT**: no computation — the client-declared amounts are validated to sum to *exactly*
  `total` and used as-is; any mismatch is rejected atomically (`TRIP_EXPENSE_SPLIT_INVALID`), never
  auto-corrected.

In every mode, `sum(resolved share amounts) === expense.amount` is a proven invariant (unit-tested
directly against the utility, and end-to-end against the real database).

## 8. Balance sign convention (locked before implementation, per spec section 40)

For user `U`, currency `C`, over all non-deleted expenses/shares/settlements in the trip:

```
paid(U,C)            = sum(expense.amount)  where expense.payerUserId = U, expense.currency = C
owed(U,C)             = sum(share.amount)    where share.userId = U, share's expense.currency = C
settlementEffect(U,C) = sum(settlement.amount where settlement.fromUserId = U)
                       - sum(settlement.amount where settlement.toUserId = U)
net(U,C)              = paid(U,C) - owed(U,C) + settlementEffect(U,C)
```

`net > 0` → this user is owed money (should receive). `net < 0` → this user owes money. A recorded
settlement moves the payer's (`fromUserId`) net *toward* zero (`+amount`) and the recipient's
(`toUserId`) net *toward* zero from the other side (`-amount`) — exactly the "A owed B 100, A
settles 100 to B" example in spec section 49.

**Conservation holds by construction**, not by a corrective adjustment: `sum(paid) == sum(owed) ==
total expense amount` (since every expense's shares are validated to sum exactly to its own amount)
and `sum(settlementEffect) == 0` (each settlement's amount contributes `+amount` to exactly one user
and `-amount` to exactly one other). So `sum(net) == 0` for every currency, always — this is proven
directly with a real-PostgreSQL conservation test matrix (spec section 85), not merely asserted.

## 9. Settlement-suggestion algorithm (design decision, per spec section 45)

Deterministic greedy debtor/creditor matching, one currency at a time: sort debtors (net < 0) and
creditors (net > 0) each by `userId` ascending; repeatedly match the first remaining debtor against
the first remaining creditor for `min(|debtor remaining|, creditor remaining)`, record one
suggestion, reduce both, advance past whichever hit zero, repeat until either list is exhausted.
Deliberately **not** the mathematically-minimal-transaction-count algorithm (spec section 45
explicitly discourages over-engineering this) — simple, stable, and provably zeroes every balance
when conceptually applied, because total debt equals total credit exactly (section 8's conservation
proof).

## 10. Former-member preservation strategy (spec sections 23–26)

`TripExpense`/`TripExpenseShare`/`TripSettlement` reference `User` directly (never `TripMember`), so
a `TripMember` row's deletion (remove/leave) **never cascades into financial history** — there is no
FK from any G09 table to `TripMember` at all, only to `User` (which is never hard-deleted by any
existing route in this codebase). This is a structural guarantee, not a runtime check: it is
impossible for a G09 migration/schema shape to lose financial history on membership removal, because
no relation path exists for that to happen through.

A former member cannot appear as `payerUserId`/a share `userId` on any **new** expense (spec section
24, "fail closed") — enforced by validating every referenced `userId` is a **current** trip
participant (`TripAuthorizationService.currentRole(tripId, userId) !== null`) at create/update time,
re-validated inside the transaction (section 12). A former member's *existing* historical rows are
never touched, never hidden from current authorized participants, and never trigger the former
member's own trip API access to reopen (G07's authorization remains the sole gate on that user's own
access — spec section 25).

## 11. Remove/leave integration implications (confirmed: none needed)

Unlike G08 (which had to extend `TripMembersService.remove`/`.leave`/`TripsService.archive` to
actively delete rows), **G09 requires no code change to those methods at all** — the whole point of
section 10 above is that financial history survives removal/leave/archive *by construction* (no FK
from `TripExpense`/`TripExpenseShare`/`TripSettlement` to `TripMember`). Confirmed by inspection:
G09 adds zero lines to `trip-members.service.ts`/`trips.service.ts` beyond what G08 already added.

## 12. Role/archive concurrency strategy (implementation plan, ties together sections 5/10)

Every G09 mutation (`TripExpensesService.create`/`.update`/`.delete`,
`TripSettlementsService.create`) runs its own `$transaction` whose first 1–2 statements are:

1. `SELECT * FROM "Trip" WHERE id = $1 FOR UPDATE` — re-checks `archivedAt IS NULL` (else abort
   `TRIP_ARCHIVED`, closing the archive-vs-mutation race, spec section 38) and captures the
   currently-locked `ownerId`.
2. If the acting user is **not** that freshly-locked `ownerId` (i.e. believed to be a member):
   `SELECT * FROM "TripMember" WHERE "tripId" = $1 AND "userId" = $2 FOR UPDATE` — aborts
   `TRIP_PERMISSION_DENIED` if the row is now missing (removed, spec section 36) or its role no
   longer carries `EDIT_TRIP`-equivalent capability (downgraded, spec section 37).

Only after both checks pass does the transaction perform its actual write (insert/conditional-
update/soft-delete). This is the exact same "lock the row a concurrent governance transaction also
touches, first" discipline G08 already established for its own race family — applied here to the
Trip/TripMember rows instead of `TripLocationSharing`.

## 13. Migration plan

One additive migration, `<timestamp>_g09_trip_expense_settlement`, adding:
- `TripExpenseSplitMode` enum (`EQUAL`, `EXACT`, `PERCENTAGE`)
- `TripExpense` table (+ soft-delete `deletedAt`, optimistic-concurrency `version`)
- `TripExpenseShare` table (+ `@@unique([expenseId, userId])`)
- `TripSettlement` table (append-only, no version/soft-delete — no edit/delete API is specified,
  spec section 67's conceptual API is GET+POST only)
- Two additive `EntityKind` values (`TRIP_EXPENSE`, `TRIP_SETTLEMENT`)
- Four additive `TripCollaborationEventType` values (`EXPENSE_ADDED`, `EXPENSE_UPDATED`,
  `EXPENSE_DELETED`, `SETTLEMENT_RECORDED`)
- Additive relation arrays on `Trip`/`User`

Generated via the safe file-to-file diff tool (`pnpm db:migrate:diff:safe --from HEAD --script`), no
shadow database, reviewed, then hand-placed — identical process to G08.

## 14. Expected APIs

```
GET    /v1/trips/:id/expenses
POST   /v1/trips/:id/expenses
GET    /v1/trips/:id/expenses/:expenseId
PATCH  /v1/trips/:id/expenses/:expenseId
DELETE /v1/trips/:id/expenses/:expenseId
GET    /v1/trips/:id/expenses/summary
GET    /v1/trips/:id/settlement-suggestions
GET    /v1/trips/:id/settlements
POST   /v1/trips/:id/settlements
```

All nine live on the existing `TripsController` (create/list/detail/edit/delete follow its own
sub-resource convention — e.g. `PATCH :id` on the aggregate root itself), matching where G06's own
itinerary/estimate sub-resources already live, rather than a new controller.

**Authorization** (spec section 28, decision locked): no new `TripCapability` is added.
`VIEW_TRIP` gates every read (list/detail/summary/suggestions/settlements-list — VIEWER included).
`EDIT_TRIP` gates every mutation (expense create/update/delete, settlement create) — justified
because the brief's own baseline table describes EDITOR as having "the same financial mutation
permissions as EDIT_TRIP" and lists nothing financial as OWNER-exclusive beyond what OWNER already
gets by holding every capability; settlement recording is treated as one more financial mutation,
not a governance action, so it is not restricted to OWNER-only.

## 15. Idempotency (audited: none exists to reuse, none invented)

No generic client-supplied idempotency-key mechanism exists anywhere in this codebase (confirmed by
search) — G06's own estimate-generation idempotency is a *derived* key (`inputHash` +
`engineVersion`, a pure function of trip state), not a client-supplied header, and does not apply to
a free-form expense create (two different real-world expenses can legitimately have identical
title/amount/date). Per spec section 70's explicit "do not create a global idempotency platform
without need," **G09 does not add one** — a lost-response mobile retry of `POST .../expenses` will
create two separate expense rows, exactly as a retried `POST /v1/trips` (create trip) or `POST
.../invitations` already would today. This is documented plainly, not silently accepted.

## 16. Risks

1. The Trip-row-first lock order (section 5/12) does not match `remove`/`updateRole`'s TripMember-
   row-first order — a narrow-window deadlock between a concurrent financial mutation and a
   remove/role-change call is theoretically possible; mitigated with a single-retry-on-`P2034`
   wrapper, not eliminated. Pre-existing in spirit (the same tension already exists between
   `transferOwnership` and `remove`/`updateRole`).
2. No idempotency protection on expense/settlement creation (section 15) — a network retry can
   create a duplicate row. Documented, matches existing codebase-wide precedent for every other
   `POST` create endpoint.
3. Money is uniformly 2-decimal-place `Decimal(12,2)` for every currency, including zero-decimal
   ones like JPY — matches G06's own established (if imperfect) precedent; not fixed here.

## 17. Canonical gate count

See `docs/backend/G09_ACCEPTANCE_GATE_MANIFEST.md` — derived directly from this brief's own numbered
sections, not chosen in advance.
