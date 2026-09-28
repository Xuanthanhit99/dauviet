-- =========================================================================
-- G12 - Database-level integrity constraints (pre-freeze audit, spec 45).
-- ADDITIVE ONLY: CHECK constraints; no table/column/index/enum change, no
-- data change. Prisma's schema language cannot express CHECK constraints, so
-- they live only here (Prisma ignores them when diffing - no schema drift).
-- =========================================================================
-- Each constraint mirrors a rule the service layer already enforces for every
-- API write (so no valid request can newly fail), except the two share rules
-- marked FIX, which close a G09 validation gap found by the G12 audit: an
-- EXACT or PERCENTAGE split could carry a negative share (e.g. 150 / -50 of a
-- 100 expense) because only the SUM was checked - a hidden transfer that
-- G09-GATE-028 ("refunds not encoded as negative expenses") rules out. The
-- service now rejects it (TRIP_EXPENSE_SPLIT_INVALID); these constraints make
-- the invariant hold for any writer, not only the API.
--
-- Added NOT VALID then VALIDATEd, so an existing violating row makes this
-- migration fail loudly instead of being silently accepted or rewritten.
-- Affiliate conversion amounts are deliberately NOT constrained: they are
-- provider-reported evidence (ADMIN-only ingest) and a provider adjustment may
-- legitimately be negative; see docs/backend/G12_FINAL_REPORT.md.

-- G09 TripExpense: amount > 0 (TripExpensesService.parseAmount), ISO-4217-shaped currency (DTO).
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_amount_positive_check" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "TripExpense" ADD CONSTRAINT "TripExpense_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$') NOT VALID;

-- G09 TripExpenseShare: FIX - share >= 0 (a zero share is legitimate: a payer who consumed nothing), percentage within 0..100.
ALTER TABLE "TripExpenseShare" ADD CONSTRAINT "TripExpenseShare_amount_nonnegative_check" CHECK ("amount" >= 0) NOT VALID;
ALTER TABLE "TripExpenseShare" ADD CONSTRAINT "TripExpenseShare_percentage_range_check" CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100)) NOT VALID;

-- G09 TripSettlement: amount > 0, payer != recipient, currency format (TripSettlementsService / DTO).
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_amount_positive_check" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_distinct_parties_check" CHECK ("fromUserId" <> "toUserId") NOT VALID;
ALTER TABLE "TripSettlement" ADD CONSTRAINT "TripSettlement_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$') NOT VALID;

-- G08 TripMemberLocation: WGS84 ranges and non-negative accuracy (UpdateTripLocationDto @Min/@Max).
ALTER TABLE "TripMemberLocation" ADD CONSTRAINT "TripMemberLocation_coordinates_range_check"
  CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180 AND "accuracyMeters" >= 0) NOT VALID;

ALTER TABLE "TripExpense" VALIDATE CONSTRAINT "TripExpense_amount_positive_check";
ALTER TABLE "TripExpense" VALIDATE CONSTRAINT "TripExpense_currency_format_check";
ALTER TABLE "TripExpenseShare" VALIDATE CONSTRAINT "TripExpenseShare_amount_nonnegative_check";
ALTER TABLE "TripExpenseShare" VALIDATE CONSTRAINT "TripExpenseShare_percentage_range_check";
ALTER TABLE "TripSettlement" VALIDATE CONSTRAINT "TripSettlement_amount_positive_check";
ALTER TABLE "TripSettlement" VALIDATE CONSTRAINT "TripSettlement_distinct_parties_check";
ALTER TABLE "TripSettlement" VALIDATE CONSTRAINT "TripSettlement_currency_format_check";
ALTER TABLE "TripMemberLocation" VALIDATE CONSTRAINT "TripMemberLocation_coordinates_range_check";
