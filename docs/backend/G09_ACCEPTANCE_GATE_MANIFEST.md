# G09 — Trip Expense & Settlement: Acceptance Gate Manifest

Derived directly from the numbered sections of the G09 brief (not chosen in advance — see
`docs/backend/G09_PRE_IMPLEMENTATION_REPORT.md`). Allowed states: `PASS`, `FAIL`, `UNVERIFIED`,
`PASS — NOT APPLICABLE`. Filled in as verification completes; see `G09_FINAL_REPORT.md` for the
evidence pointers (unit/e2e file names, Path A/B, live results) behind each `PASS`.

| Gate | Requirement (brief section) | Status |
|---|---|---|
| G09-GATE-001 | G09 records actual expenses, allocates them, computes deterministic balances, optionally records external settlements (§1) | PASS |
| G09-GATE-002 | Dấu Việt does not become a payment processor or wallet (§1) | PASS |
| G09-GATE-003 | Planned cost != actual expense (§2) | PASS |
| G09-GATE-004 | Cost estimate != expense (§2) | PASS |
| G09-GATE-005 | Expense != payment (§2) | PASS |
| G09-GATE-006 | Expense split != money transfer (§2) | PASS |
| G09-GATE-007 | Settlement != payment processing (§2) | PASS |
| G09-GATE-008 | Settlement suggestion != debt collection (§2) | PASS |
| G09-GATE-009 | Trip member != financial account (§2) | PASS |
| G09-GATE-010 | Currency conversion != exchange-rate guessing (§2) | PASS |
| G09-GATE-011 | Pre-implementation audit performed and documented before schema changes (§3) | PASS |
| G09-GATE-012 | Additive `TripExpense`/`TripExpenseShare` models used (§4) | PASS |
| G09-GATE-013 | `TripSettlement` implemented only after pre-audit confirms fit (§4, §46) | PASS |
| G09-GATE-014 | No mutable account balance persisted (§4, §39) | PASS |
| G09-GATE-015 | No wallet/account domain created (§4) | PASS |
| G09-GATE-016 | `TripExpense` fields match expected semantics, repo conventions audited first (§5) | PASS |
| G09-GATE-017 | G06 `TripCostEstimate`/snapshots untouched (§6) | PASS |
| G09-GATE-018 | Estimate never mutated into an expense (§6) | PASS |
| G09-GATE-019 | No automatic expense creation from G06 estimates (§6) | PASS |
| G09-GATE-020 | G05 provider offers never automatically become expenses (§7) | PASS |
| G09-GATE-021 | No provider call from G09 (§7) | PASS |
| G09-GATE-022 | `CostCategory` reused, no duplicate taxonomy (§8) | PASS |
| G09-GATE-023 | G06 estimate records never merged with G09 expense records (§8) | PASS |
| G09-GATE-024 | Exact Decimal arithmetic used, consistent with G06 (§9) | PASS |
| G09-GATE-025 | No JS binary float used for money (§9) | PASS |
| G09-GATE-026 | No Prisma Float used for money (§9) | PASS |
| G09-GATE-027 | `amount > 0` enforced for a normal expense (§10) | PASS |
| G09-GATE-028 | Refunds not encoded as negative expenses (§10) | PASS |
| G09-GATE-029 | Every expense has an explicit currency, validated per repo convention (§11) | PASS |
| G09-GATE-030 | Not all expenses assumed to use `Trip.primaryCurrency` (§11) | PASS |
| G09-GATE-031 | No live FX call, invented rate, or silent conversion (§12) | PASS |
| G09-GATE-032 | Balances/totals partitioned by currency, never aggregated across currencies (§12) | PASS |
| G09-GATE-033 | `Trip.primaryCurrency` remains display context only, never authorizes conversion (§13) | PASS |
| G09-GATE-034 | V1 uses one payer per expense (§14) | PASS |
| G09-GATE-035 | `payerUserId` validated against current financial-participant semantics at mutation time (§14) | PASS |
| G09-GATE-036 | No multi-payer expense implemented (§14) | PASS |
| G09-GATE-037 | EQUAL/EXACT/PERCENTAGE split modes supported (§15) | PASS |
| G09-GATE-038 | No additional split mode added (§15) | PASS |
| G09-GATE-039 | `TripExpenseShare` identifies expense/user/resolved amount + mode-specific metadata only where needed (§16) | PASS |
| G09-GATE-040 | At most one share per user per expense, DB-backed (§16) | PASS |
| G09-GATE-041 | Equal split resolves to exact monetary shares (§17) | PASS |
| G09-GATE-042 | Minor-unit remainder distributed deterministically, stable ordering, never randomized (§17) | PASS |
| G09-GATE-043 | Same input always produces the same resolved shares (§17) | PASS |
| G09-GATE-044 | Exact split requires `sum(shares) == amount` exactly (§18) | PASS |
| G09-GATE-045 | Exact-split mismatch rejected atomically (§18) | PASS |
| G09-GATE-046 | Percentage split requires percentages total exactly 100% (§19) | PASS |
| G09-GATE-047 | Percentages resolved to monetary shares deterministically (§19) | PASS |
| G09-GATE-048 | After rounding, `sum(shares) == amount` for percentage split too (§19) | PASS |
| G09-GATE-049 | No JS float used for percentage arithmetic (§19) | PASS |
| G09-GATE-050 | Payer may also have a share (§20) | PASS |
| G09-GATE-051 | Payer may have zero share; not required to have one (§21) | PASS |
| G09-GATE-052 | No generic entityType/entityId polymorphism for payer/share identity (§22) | PASS |
| G09-GATE-053 | Explicit relational identity used; FK to `User`, membership validated at transaction time (§22) | PASS |
| G09-GATE-054 | Financial history survives member leave (§23) | PASS |
| G09-GATE-055 | Financial history survives member removal (§23) | PASS |
| G09-GATE-056 | Financial history survives role change (§23) | PASS |
| G09-GATE-057 | Financial history survives ownership transfer (§23) | PASS |
| G09-GATE-058 | No cascade-delete of historical expenses/shares when TripMember disappears (§23) | PASS |
| G09-GATE-059 | Removed/left user cannot create/edit/delete new trip financial state (§24) | PASS |
| G09-GATE-060 | Current members cannot add a removed/left user to a NEW expense (§24, fail closed) | PASS |
| G09-GATE-061 | Removed/left user does not regain trip API access via historical expense references (§25) | PASS |
| G09-GATE-062 | G07 trip access remains authoritative (§25) | PASS |
| G09-GATE-063 | Historical financial identity visible only to current authorized participants (§25) | PASS |
| G09-GATE-064 | Member removal not blocked by an unresolved balance (§26) | PASS |
| G09-GATE-065 | Ledger rows preserved on removal; balance never silently settled or deleted (§26) | PASS |
| G09-GATE-066 | Ownership transfer does not alter expenses/payer/shares/settlements/balances (§27) | PASS |
| G09-GATE-067 | `TripAuthorizationService` reused, no contradictory permission system (§28) | PASS |
| G09-GATE-068 | Baseline OWNER/EDITOR/VIEWER/UNRELATED/PENDING capability table honored (§28) | PASS |
| G09-GATE-069 | Any new capability justified, centralized matrix preserved (§28) | PASS — NOT APPLICABLE (no new capability was added; existing VIEW_TRIP/EDIT_TRIP reused and justified) |
| G09-GATE-070 | Authorization uses current DB state (§29) | PASS |
| G09-GATE-071 | Same JWT immediately observes EDITOR->VIEWER downgrade (§29) | PASS |
| G09-GATE-072 | Same JWT immediately observes member removal (§29) | PASS |
| G09-GATE-073 | Same JWT immediately observes trip archive (§29) | PASS |
| G09-GATE-074 | No durable financial permission encoded in JWT (§29) | PASS |
| G09-GATE-075 | Archived trip financial ledger is read-only (§30) | PASS |
| G09-GATE-076 | Authorized historical reads allowed on archived trip (§30) | PASS |
| G09-GATE-077 | No new expense after archive (§30) | PASS |
| G09-GATE-078 | No expense edit after archive (§30) | PASS |
| G09-GATE-079 | No expense delete after archive (§30) | PASS |
| G09-GATE-080 | No new settlement record after archive (§30) | PASS |
| G09-GATE-081 | Soft delete/lifecycle state preferred for expense removal (§31) | PASS |
| G09-GATE-082 | Ordinary API delete never physically destroys financial history (§31) | PASS |
| G09-GATE-083 | Deleted expenses excluded from current balance projection (§31) | PASS |
| G09-GATE-084 | Audit remains available for deleted expenses (§31) | PASS |
| G09-GATE-085 | Expense + shares form one atomic aggregate on create/edit (§32) | PASS |
| G09-GATE-086 | Never commits `expense.amount != sum(shares)` (§32) | PASS |
| G09-GATE-087 | Audit write participates in the same transaction (§32) | PASS |
| G09-GATE-088 | Accepted G06/G07 concurrency conventions reused (§33) | PASS |
| G09-GATE-089 | Concurrent edits never silently overwrite each other (§33) | PASS |
| G09-GATE-090 | Stale mutation returns 409 per existing error envelope (§33) | PASS |
| G09-GATE-091 | Real PostgreSQL edit/edit race: exactly one accepted, no lost update (§34) | PASS |
| G09-GATE-092 | Real PostgreSQL edit/delete race: deleted expense never resurrected by a stale concurrent edit (§35) | PASS |
| G09-GATE-093 | Real PostgreSQL member-removal-vs-create race: no post-removal financial mutation by the removed user survives (§36) | PASS |
| G09-GATE-094 | Authorization re-checked inside the transaction, not only before it (§36) | PASS |
| G09-GATE-095 | Real PostgreSQL role-downgrade-vs-mutation race: no post-downgrade mutation using stale authorization survives (§37) | PASS |
| G09-GATE-096 | Lock ordering/transaction semantics defined for the downgrade race (§37) | PASS |
| G09-GATE-097 | Real PostgreSQL archive-vs-mutation race: no new mutable financial state commits after archive becomes authoritative (§38) | PASS |
| G09-GATE-098 | No mutable balance column stored as source of truth (§39) | PASS |
| G09-GATE-099 | Balance calculated from ledger records (§39) | PASS |
| G09-GATE-100 | Balance sign convention locked and documented (§40) | PASS |
| G09-GATE-101 | `net = paid - owed + settlementEffect` formula implemented exactly (§40) | PASS |
| G09-GATE-102 | Settlement sign semantics documented exactly (§40) | PASS |
| G09-GATE-103 | `sum(all member net balances) == 0` per currency, exact minor-unit resolution (§41) | PASS |
| G09-GATE-104 | Independent per-currency ledgers maintained (§42) | PASS |
| G09-GATE-105 | Currencies never combined without FX infrastructure (§42, none implemented) | PASS |
| G09-GATE-106 | Deterministic `totalsByCurrency`/`balancesByCurrency` summary provided (§43) | PASS |
| G09-GATE-107 | No implicit FX in summary (§43) | PASS |
| G09-GATE-108 | Settlement suggestions generated deterministically from balances per currency (§44) | PASS |
| G09-GATE-109 | Suggestions are projections only — no money moved, no ledger mutation (§44) | PASS |
| G09-GATE-110 | Deterministic debtor/creditor matching algorithm, same ledger => same suggestions (§45) | PASS |
| G09-GATE-111 | Stable tie-breaking (§45) | PASS |
| G09-GATE-112 | Conceptually applying all suggestions zeroes every balance within exact minor units (§45) | PASS |
| G09-GATE-113 | No unnecessary minimal-transaction-count over-engineering (§45) | PASS — NOT APPLICABLE (simple greedy algorithm chosen, per the brief's own discouragement) |
| G09-GATE-114 | `TripSettlement` implemented only after pre-audit confirms fit (§46, duplicate of §13 — kept distinct per brief's own section numbering) | PASS |
| G09-GATE-115 | Settlement means "declared as settled outside Dấu Việt," never a payment transaction (§46) | PASS |
| G09-GATE-116 | Settlement fields match expected semantics (§47) | PASS |
| G09-GATE-117 | `fromUserId != toUserId` enforced (§48) | PASS |
| G09-GATE-118 | `amount > 0` enforced for settlement (§48) | PASS |
| G09-GATE-119 | Valid currency enforced for settlement (§48) | PASS |
| G09-GATE-120 | Valid trip financial identities enforced, no arbitrary unrelated user (§48) | PASS |
| G09-GATE-121 | Settlement effect on both users' balances documented/tested exactly (§49) | PASS |
| G09-GATE-122 | Settlement never silently clamped to the currently-suggested balance (§50) | PASS |
| G09-GATE-123 | Structural correctness validated, not guessed intent (§50) | PASS |
| G09-GATE-124 | No payment-gateway status/intent/charge/capture/refund/payout/wallet-transfer terminology or fields (§51) | PASS |
| G09-GATE-125 | "Record settlement"/"external settlement" terminology used (§51) | PASS |
| G09-GATE-126 | No payment-provider integration (PayOS/Stripe/PayPal/MoMo/ZaloPay/Apple/Google Pay/bank APIs) (§52) | PASS |
| G09-GATE-127 | `createdAt` never equated with expense occurrence (§53) | PASS |
| G09-GATE-128 | Explicit `occurredOn` field allowed (§53) | PASS |
| G09-GATE-129 | Expense not hard-rejected solely for falling outside trip dates (§53) | PASS |
| G09-GATE-130 | Existing G06 currency/money implementation audited first (§54) | PASS |
| G09-GATE-131 | Not every currency assumed to have two decimal places without justification (§54) | PASS — documented as a deliberate, honest reuse of G06's existing uniform-2dp convention, not a new assumption invented for G09 |
| G09-GATE-132 | Deterministic supported minor-unit strategy documented (§54) | PASS |
| G09-GATE-133 | Rounding explicit, deterministic, centralized (§55) | PASS (`split-money.util.ts`) |
| G09-GATE-134 | Rounding cases covered: 100/3, thirds, percentage remainder, large amount, zero/two-decimal currency (§55) | PASS |
| G09-GATE-135 | No `Math.round` on floating business values (§56) | PASS |
| G09-GATE-136 | No `toFixed`-based business arithmetic (§56) | PASS |
| G09-GATE-137 | No binary Float accumulation as authoritative calculation (§56) | PASS |
| G09-GATE-138 | DB Decimal precision documented with a maximum; overflow rejected cleanly, no silent truncation (§57) | PASS |
| G09-GATE-139 | Title/note length-validated, no raw HTML, no unsafe rendering assumption (§58) | PASS |
| G09-GATE-140 | No receipt upload/OCR/invoice extraction/automatic recognition (§59) | PASS |
| G09-GATE-141 | No VAT/tax accounting/invoice compliance/bookkeeping engine (§60) | PASS |
| G09-GATE-142 | Collaboration activity metadata privacy-conscious, no full expense payload duplicated (§61) | PASS |
| G09-GATE-143 | Exact monetary amount excluded from generic activity metadata (§61) | PASS |
| G09-GATE-144 | Expense create/edit/delete audited (§62) | PASS |
| G09-GATE-145 | Settlement mutation audited (§62) | PASS |
| G09-GATE-146 | Transaction-aware `AuditService` used (§62) | PASS |
| G09-GATE-147 | Free-text note not unnecessarily copied into audit metadata (§62) | PASS |
| G09-GATE-148 | Expense list paginated, deterministically ordered, stable tie-breaker (§63) | PASS |
| G09-GATE-149 | Expense detail returns explicit DTO, not a raw Prisma record (§64) | PASS |
| G09-GATE-150 | Detail response includes resolved shares required for UI (§64) | PASS |
| G09-GATE-151 | Summary API returns currency-separated totals/balances, no FX (§65) | PASS |
| G09-GATE-152 | Suggestion API is a pure authorized projection, no mutation (§66) | PASS |
| G09-GATE-153 | Settlement read/write API follows repo conventions, if implemented (§67) | PASS |
| G09-GATE-154 | Expense API follows repo conventions (§68) | PASS |
| G09-GATE-155 | Existing error envelope reused; new domain codes added only where necessary (§69) | PASS |
| G09-GATE-156 | Private trip existence never leaked to unrelated users, consistent with G07 (§69) | PASS |
| G09-GATE-157 | Existing idempotency support audited (§70) | PASS |
| G09-GATE-158 | Create-retry behavior documented (§70) | PASS |
| G09-GATE-159 | No global idempotency platform invented without need (§70) | PASS — NOT APPLICABLE (none built, matching codebase-wide precedent) |
| G09-GATE-160 | DB constraints/indexes used where practical (share uniqueness, FK integrity, soft-delete/query indexes) (§71) | PASS |
| G09-GATE-161 | Split-sum validation kept as transactional service logic where cross-row DB constraints are impractical (§71) | PASS |
| G09-GATE-162 | Indexes justified from real query patterns, no speculative extras (§72) | PASS |
| G09-GATE-163 | `EntityKind` extended only with a proven consumer (§73) | PASS |
| G09-GATE-164 | G08 privacy semantics unaltered (§74) | PASS |
| G09-GATE-165 | Member removal/leave still terminates location sharing while retaining financial history (§74) | PASS |
| G09-GATE-166 | Remove/leave membership-transaction ordering preserves membership correctness + G08 cleanup + G09 history (§75) | PASS |
| G09-GATE-167 | No expense/share row ever deleted by membership changes (§75) | PASS |
| G09-GATE-168 | No precise user location captured on an expense record (§76) | PASS |
| G09-GATE-169 | No automatic "expense location" from G08 (§76) | PASS |
| G09-GATE-170 | Expense data is private; only authorized current participants access it per role (§77) | PASS |
| G09-GATE-171 | No anonymous/public financial endpoint (§77) | PASS |
| G09-GATE-172 | No expense/balance/settlement leak into Country/Region/City/Destination/Place/Story/Journey/Search/Community/public Map/SEO (§78) | PASS |
| G09-GATE-173 | No accidental full expense payload in application logs (§79) | PASS |
| G09-GATE-174 | Free-text notes/sensitive financial payloads not logged; ids/error codes preferred (§79) | PASS |
| G09-GATE-175 | Normal authenticated mutation protection used for rate limiting, no G08-style high-frequency cadence invented (§80) | PASS |
| G09-GATE-176 | Balances/suggestions do not depend on a background worker (§81) | PASS |
| G09-GATE-177 | Redis not authoritative for expenses/balances (§82) | PASS |
| G09-GATE-178 | Real PostgreSQL proof: unique shares (§83) | PASS |
| G09-GATE-179 | Real PostgreSQL proof: atomic create (§83) | PASS |
| G09-GATE-180 | Real PostgreSQL proof: atomic edit (§83) | PASS |
| G09-GATE-181 | Real PostgreSQL proof: soft delete (§83) | PASS |
| G09-GATE-182 | Real PostgreSQL proof: optimistic concurrency (§83) | PASS |
| G09-GATE-183 | Real PostgreSQL proof: edit/edit race (§83) | PASS |
| G09-GATE-184 | Real PostgreSQL proof: edit/delete race (§83) | PASS |
| G09-GATE-185 | Real PostgreSQL proof: member-removal/create race (§83) | PASS |
| G09-GATE-186 | Real PostgreSQL proof: role-downgrade/mutation race (§83) | PASS |
| G09-GATE-187 | Real PostgreSQL proof: archive/mutation race (§83) | PASS |
| G09-GATE-188 | Real PostgreSQL proof: forced rollback (§83, §84) | PASS |
| G09-GATE-189 | Real PostgreSQL proof: balance conservation (§83, §85) | PASS |
| G09-GATE-190 | Forced rollback reverts expense/share/audit-activity change atomically, no partial aggregate survives (§84) | PASS |
| G09-GATE-191 | Conservation test matrix covers the full listed scenario set (§85) | PASS |
| G09-GATE-192 | Multi-currency test proves VND/JPY/USD stay separate, no conversion (§86) | PASS |
| G09-GATE-193 | Settlement suggestion test: deterministic, no cross-currency suggestion, zeroes on conceptual application, stable ties (§87) | PASS |
| G09-GATE-194 | Real HTTP role matrix (OWNER/EDITOR/VIEWER/UNRELATED/UNAUTHENTICATED/PENDING) across list/detail/create/edit/delete/summary/suggestions/settlement (§88) | PASS |
| G09-GATE-195 | Same-JWT downgrade: read allowed, next mutation denied (§89) | PASS |
| G09-GATE-196 | Same-JWT removal: financial API denied, historical ledger intact for current participants (§90) | PASS |
| G09-GATE-197 | Archive: reads follow accepted policy, mutations denied, balances stable, history preserved (§91) | PASS |
| G09-GATE-198 | Path A: fresh isolated DB, full migration chain, seed x2, idempotent, build, boot, HTTP smoke (§92) | PASS |
| G09-GATE-199 | Path B: exact accepted pre-G09 baseline before/after proof, no locked data changed (§93) | PASS |
| G09-GATE-200 | G06.5 safe migration tooling used; live dev DB never used as shadow DB (§94) | PASS |
| G09-GATE-201 | No accepted G00-G08 migration modified (§94, §95) | PASS |
| G09-GATE-202 | Migration additive-only, no destructive DROP/rename (§95) | PASS |
| G09-GATE-203 | No fake personal expense data seeded into the Golden Dataset (§96) | PASS |
| G09-GATE-204 | Focused unit tests: Decimal arithmetic, currency, split validation, equal/exact/percentage, balance, conservation, suggestions, authorization, former members, archive, soft delete, concurrency, DTOs (§97) | PASS |
| G09-GATE-205 | Full unit suite green before COMPLETE (§98) | PASS |
| G09-GATE-206 | Full E2E suite (accepted sequential contract) green before COMPLETE (§98) | PASS |
| G09-GATE-207 | No assertion weakened merely to pass (§98) | PASS |
| G09-GATE-208 | Focused G08 regression: sharing/update/stop/remove/leave/archive/privacy (§99) | PASS |
| G09-GATE-209 | G09 membership integration does not regress location privacy (§99) | PASS |
| G09-GATE-210 | Focused G07 regression: invite/accept/decline/revoke/role/remove/leave/transfer/archive/activity (§100) | PASS |
| G09-GATE-211 | G06 regression: planner/itinerary/cost estimates/snapshot immutability/Decimal/archive (§101) | PASS |
| G09-GATE-212 | G09 does not change planned-cost semantics (§101) | PASS |
| G09-GATE-213 | G05 regression: provider offers remain provider offers, no automatic ledger mutation (§102) | PASS |
| G09-GATE-214 | G06.5 not disturbed; GeoNames/Google credentials not required by G09 (§103) | PASS |
| G09-GATE-215 | OpenAPI regenerated from the real running app (§104) | PASS |
| G09-GATE-216 | OpenAPI documents expense semantics/split modes/currency separation/no-FX/settlement meaning/authorization/archive/concurrency (§104) | PASS |
| G09-GATE-217 | Exact post-G09 OpenAPI path count reported and diffed against G08's 301 (§105) | PASS |
| G09-GATE-218 | Unexpected old-path changes explained if any (§105) | PASS — NOT APPLICABLE (none occurred) |
| G09-GATE-219 | Sensitive-data scan: no JWT/DATABASE_URL/provider secret/OAuth token/private email/real personal expense data (§106) | PASS |
| G09-GATE-220 | Working tree audited before implementation; concurrent-owned files respected (§107) | PASS |
| G09-GATE-221 | No unrelated frontend/brand/other-project file touched (§107) | PASS |
| G09-GATE-222 | No git mutation (add/commit/push/reset/restore/checkout/stash/clean/rebase/cherry-pick/amend) (§108) | PASS |
| G09-GATE-223 | No G10 affiliate attribution/conversion implemented (§109) | PASS |
| G09-GATE-224 | No G11 search/map redesign implemented (§110) | PASS |
| G09-GATE-225 | No G12 contract/live final freeze claimed (§111) | PASS |
| G09-GATE-226 | No Wallet/Payment/PaymentIntent/Charge/Capture/Payout/StoredValue/BankAccount/Card/Escrow created (§112) | PASS |
| G09-GATE-227 | No FXRate/ExchangeRate/CurrencyConversion model or exchange-rate service call (§113) | PASS |
| G09-GATE-228 | No booking/OTA checkout implemented (§114) | PASS |
| G09-GATE-229 | No receipt/OCR pipeline (§115) | PASS |
| G09-GATE-230 | No accounting/tax/VAT engine (§116) | PASS |
| G09-GATE-231 | No expense geolocation or location history added (§117) | PASS |
| G09-GATE-232 | Individual gate manifest derived before implementation, not an arbitrary count (§118) | PASS |
| G09-GATE-233 | Required documentation created/updated (§119) | PASS |
| G09-GATE-234 | Final report includes every required element (§120) | PASS |
| G09-GATE-235 | Final validation performed before COMPLETE (§121) | PASS |
| G09-GATE-236 | No P0/P1 outstanding (§121, §122) | PASS |
| G09-GATE-237 | Verdict is exactly one of the four allowed states, justified by evidence (§122) | PASS |
| G09-GATE-238 | G10/G11/G12 remain NOT STARTED after G09; Backend V2 Freeze not claimed (§123) | PASS |
| G09-GATE-239 | G09 not independently labeled LOCKED (§123) | PASS |
| G09-GATE-240 | No STOP condition silently bypassed (§124) | PASS — NOT APPLICABLE (no STOP condition was reached) |
