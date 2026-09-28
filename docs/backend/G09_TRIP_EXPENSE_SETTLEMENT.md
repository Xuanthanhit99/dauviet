# G09 — Trip Expense & Settlement: Contract Reference

Status: **COMPLETE**. See `docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md` for design rationale and
audit findings, and `docs/backend/G09_FINAL_REPORT.md` for the full verification record.

Core domain laws (unchanged from the brief, restated here as the contract's north star):

```
PLANNED COST != ACTUAL EXPENSE
COST ESTIMATE != EXPENSE
EXPENSE != PAYMENT
EXPENSE SPLIT != MONEY TRANSFER
SETTLEMENT != PAYMENT PROCESSING
SETTLEMENT SUGGESTION != DEBT COLLECTION
TRIP MEMBER != FINANCIAL ACCOUNT
CURRENCY CONVERSION != EXCHANGE-RATE GUESSING
```

## 1. Data model

### `TripExpense` — an actual, user-entered expense

| Field | Type | Notes |
|---|---|---|
| `id` | `String` (cuid) | |
| `tripId` | `String` | |
| `title` | `String` | |
| `category` | `CostCategory` | reused verbatim from G06 |
| `amount` | `Decimal(12,2)` | always `> 0` |
| `currency` | `String` | 3-letter ISO 4217 code, same regex convention as `Trip.primaryCurrency` — independent of it |
| `payerUserId` | `String` | current trip participant, validated at mutation time |
| `splitMode` | `EQUAL` \| `EXACT` \| `PERCENTAGE` | |
| `occurredOn` | `Date` | local calendar date, never equated with `createdAt`, never validated against the trip's own date range |
| `note` | `String?` | |
| `createdByUserId` | `String` | |
| `deletedAt` | `DateTime?` | soft delete — see §5 |
| `version` | `Int` | optimistic concurrency — see §6 |

No FK to `TripMember` anywhere — `payerUserId`/`createdByUserId` reference `User` directly, which
this codebase never hard-deletes. This is what makes former-member financial-history preservation
structural rather than a runtime safeguard (§4).

### `TripExpenseShare` — one participant's resolved allocation

| Field | Type | Notes |
|---|---|---|
| `amount` | `Decimal(12,2)` | the final resolved share, regardless of split mode |
| `percentage` | `Decimal(5,2)?` | populated only for `PERCENTAGE`-mode shares |

`@@unique([expenseId, userId])` — at most one share per user per expense.

### `TripSettlement` — a user-declared external settlement (append-only)

| Field | Type | Notes |
|---|---|---|
| `fromUserId` / `toUserId` | `String` | must differ; both current trip participants |
| `amount` | `Decimal(12,2)` | always `> 0`, never clamped to a suggested balance |
| `currency` | `String` | |
| `settledAt` | `Date` | |

No `version`/soft-delete — no edit/delete route exists (GET+POST only, §67 of the brief).

## 2. Money representation (locked, see pre-implementation report §3/7)

Every currency is represented at a **uniform 2 decimal places** (`Decimal(12,2)`), matching every
other money column already in this schema (`Trip.targetBudgetAmount`, `CostAssumption.*Amount`,
`TripCostEstimate.totalAmount`). No per-currency ISO 4217 minor-unit metadata table exists anywhere
in this codebase, and G09 does not invent one — a zero-decimal currency like JPY is still
represented/computed at 2dp, exactly like every other currency. Amounts are accepted from clients as
**decimal strings** (`@IsNumberString()`), parsed via `new Prisma.Decimal(str)` — never a JS
`number` at any point in the money path.

## 3. Split resolution (`split-money.util.ts`)

- **EQUAL**: `total / N`, floored to 2dp per participant, remainder distributed one minor unit at a
  time to participants sorted by `userId` ascending — deterministic regardless of client array
  order.
- **EXACT**: client-declared amounts, validated to sum to *exactly* `total`; mismatch rejected
  atomically, never auto-corrected.
- **PERCENTAGE**: percentages must sum to *exactly* 100.00; each raw share (`total * pct / 100`) is
  floored to 2dp, then the same userId-ascending remainder distribution closes the gap.

In every mode, `sum(resolved shares) === amount` is a proven invariant.

## 4. Former-member preservation

A `TripMember` row's removal/leave never cascades into `TripExpense`/`TripExpenseShare`/
`TripSettlement` — there is no relation path from `TripMember` to any of them. A former member's
historical rows remain fully visible to current authorized participants; the former member's own
API access is cut off by G07's ordinary `TripAuthorizationService` gate, unrelated to this. A
**current** member cannot add a **removed/left** user to a **new** expense — enforced by validating
every referenced `userId` is a current participant at mutation time (fail closed).

## 5. Soft delete

`DELETE .../expenses/:id` sets `deletedAt`, never physically removes the row. A deleted expense is
excluded from the default list and from every balance/summary/suggestion projection, but remains
readable via `GET .../expenses/:id` and fully present in `AuditLog`.

## 6. Optimistic concurrency

`update`/`delete` use a **true conditional `updateMany`** (`WHERE id=$1 AND version=$2 AND
deletedAt IS NULL`) as their actual atomicity mechanism — the same strength
`TripMembersService.transferOwnership` already established for G07's one-owner invariant, applied
here for expense edit/edit and edit/delete races. A failed conditional update is disambiguated into
`404 TRIP_EXPENSE_NOT_FOUND` (missing/already-deleted) vs. `409 TRIP_VERSION_CONFLICT` (genuine stale
edit) by one extra read inside the same transaction.

## 7. Transaction-internal authorization re-validation

Every mutation (`create`/`update`/`delete` expense, settlement `create`) re-validates the actor's
authority **inside** the transaction, via `lockTripAndAssertMutable`
(`trip-financial-guard.util.ts`), closing the member-removal-vs-create, role-downgrade-vs-mutation,
and archive-vs-mutation races. Lock order: the actor's own `TripMember` row is locked FIRST (if they
are not the owner), then the `Trip` row second — matching `TripMembersService.remove`/`.updateRole`'s
own internal order exactly. **This order was chosen after a real PostgreSQL deadlock (`40P01`) was
observed live** between a concurrent expense-create and a concurrent `remove` call during this
phase's own e2e tests, using the initially-planned opposite order — see `G09_FINAL_REPORT.md`'s
"Lock-ordering incident" for the full account. A single automatic retry on any remaining deadlock/
write-conflict (`withDeadlockRetry`) is a safety net for the narrower, still-present tension with
`TripMembersService.transferOwnership` (which locks `Trip` first).

## 8. Balance (a projection, never stored)

For user `U`, currency `C`:

```
paid(U,C)             = sum(expense.amount)  where expense.payerUserId = U
owed(U,C)              = sum(share.amount)    where share.userId = U
settlementEffect(U,C)  = sum(settlement.amount where fromUserId = U)
                        - sum(settlement.amount where toUserId = U)
net(U,C)               = paid(U,C) - owed(U,C) + settlementEffect(U,C)
```

`net > 0` → should receive. `net < 0` → owes. Conservation (`sum(net) == 0` per currency) holds **by
construction** (every expense's shares sum exactly to its amount; every settlement's amount
contributes `+` to exactly one user and `-` to exactly one other) — proven with a real-PostgreSQL
conservation test matrix, not merely asserted.

## 9. Settlement suggestions

Deterministic greedy debtor/creditor matching per currency: sort debtors and creditors each by
`userId` ascending, repeatedly match the first remaining debtor against the first remaining
creditor. A pure read projection — never mutates the ledger. Deliberately not the mathematically-
minimal-transaction-count algorithm (the brief explicitly discourages over-engineering this).

## 10. API

All nine routes live on the existing `TripsController`.

| Method | Path | Capability |
|---|---|---|
| `GET` | `/v1/trips/:id/expenses` | `VIEW_TRIP` |
| `POST` | `/v1/trips/:id/expenses` | `EDIT_TRIP` |
| `GET` | `/v1/trips/:id/expenses/:expenseId` | `VIEW_TRIP` |
| `PATCH` | `/v1/trips/:id/expenses/:expenseId` | `EDIT_TRIP` |
| `DELETE` | `/v1/trips/:id/expenses/:expenseId` | `EDIT_TRIP` |
| `GET` | `/v1/trips/:id/expenses/summary` | `VIEW_TRIP` |
| `GET` | `/v1/trips/:id/settlement-suggestions` | `VIEW_TRIP` |
| `GET` | `/v1/trips/:id/settlements` | `VIEW_TRIP` |
| `POST` | `/v1/trips/:id/settlements` | `EDIT_TRIP` |

**No new `TripCapability` was added** — `VIEW_TRIP` gates every read (VIEWER included), `EDIT_TRIP`
gates every mutation including settlement recording (treated as one more financial mutation, not a
governance action). `PATCH .../expenses/:id` is a **full replace** of the expense's mutable fields
+ share set, matching the "replace the entire set" idiom G06's itinerary sub-resources already use —
never a partial patch.

## 11. Error codes

| Code | HTTP | When |
|---|---|---|
| `TRIP_EXPENSE_NOT_FOUND` | 404 | unknown/already-deleted expense on edit/delete |
| `TRIP_EXPENSE_INVALID` | 400 | non-positive/malformed amount |
| `TRIP_EXPENSE_SPLIT_INVALID` | 400 | duplicate share userId, structural mode mismatch, sum/percentage mismatch |
| `TRIP_EXPENSE_PARTICIPANT_INVALID` | 400 | payer or a share userId is not a current trip participant |
| `TRIP_SETTLEMENT_INVALID` | 400 | `fromUserId === toUserId`, non-positive amount, non-participant |
| `TRIP_VERSION_CONFLICT` | 409 | reused from G06 — stale edit/delete |
| `TRIP_ARCHIVED` | 409 | reused from G06/G07/G08 — mutation on an archived trip |
| `TRIP_PERMISSION_DENIED` | 403 | reused from G07 |

## 12. Idempotency

No client-supplied idempotency-key mechanism exists anywhere in this codebase, and G09 does not
invent one (matches every other `POST` create route in this repo). A lost-response mobile retry of
`POST .../expenses` creates two separate rows — documented, not silently accepted.

## 13. Explicitly out of scope (unchanged from the brief)

No payment processor/wallet/`PaymentIntent`/`Charge`/`Capture`/`Payout` integration. No FX rate
model or exchange-rate service call — currencies are never combined, never converted. No receipt
upload/OCR. No tax/VAT/bookkeeping engine. No expense geolocation or location history. No mutable
stored balance column anywhere — every balance is a live-computed projection.
