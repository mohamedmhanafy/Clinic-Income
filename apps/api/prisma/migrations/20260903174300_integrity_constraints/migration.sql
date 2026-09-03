-- ---------------------------------------------------------------------------
-- Integrity constraints that the Prisma schema language cannot express.
--
-- These are not defensive extras: they are what make the financial guarantees
-- enforceable by the database rather than merely intended by the application.
-- They are kept in their own migration so that a failure here (most likely a
-- missing btree_gist extension) names itself clearly.
-- ---------------------------------------------------------------------------

-- Required for the exclusion constraint below, which mixes equality operators
-- on integer columns with an overlap operator on a range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- --------------------------------------------------------------------------
-- 1. Non-negative money and counts.
-- --------------------------------------------------------------------------
ALTER TABLE "clinic_prices"
  ADD CONSTRAINT "clinic_prices_fee_non_negative" CHECK ("fee" >= 0);

ALTER TABLE "daily_activity_lines"
  ADD CONSTRAINT "daily_activity_lines_quantity_non_negative" CHECK ("quantity" >= 0);

ALTER TABLE "daily_activity_lines"
  ADD CONSTRAINT "daily_activity_lines_unit_fee_non_negative" CHECK ("unit_fee" >= 0);

ALTER TABLE "daily_activities"
  ADD CONSTRAINT "daily_activities_total_income_non_negative" CHECK ("total_income" >= 0);

-- --------------------------------------------------------------------------
-- 2. Stored income always equals count x fee.
--
--    Makes the specification's formula an invariant the database refuses to
--    violate, instead of an assumption about application code.
-- --------------------------------------------------------------------------
ALTER TABLE "daily_activity_lines"
  ADD CONSTRAINT "daily_activity_lines_total_matches_formula"
  CHECK ("line_total" = "quantity" * "unit_fee");

-- --------------------------------------------------------------------------
-- 3. A price period must not end before it starts.
-- --------------------------------------------------------------------------
ALTER TABLE "clinic_prices"
  ADD CONSTRAINT "clinic_prices_valid_period"
  CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- --------------------------------------------------------------------------
-- 4. Price periods for one (clinic, service) may never overlap.
--
--    This is the backbone of historical pricing. Without it two rows could each
--    claim to be the fee on a given date and the "applicable fee" lookup would
--    be non-deterministic. A NULL effective_to produces an unbounded upper
--    range, so open-ended prices are covered too.
-- --------------------------------------------------------------------------
ALTER TABLE "clinic_prices"
  ADD CONSTRAINT "clinic_prices_no_overlapping_periods"
  EXCLUDE USING gist (
    "clinic_id" WITH =,
    "service_id" WITH =,
    daterange("effective_from", "effective_to", '[]') WITH &&
  );

-- --------------------------------------------------------------------------
-- 5. A day's total always equals the sum of its lines.
--
--    A cross-row rule, so it needs a trigger rather than a CHECK. Maintaining it
--    in the database means the total is correct no matter which code path wrote
--    the lines.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION refresh_daily_activity_total(target_activity_id INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE "daily_activities" d
     SET "total_income" = COALESCE(
           (SELECT SUM(l."line_total")
              FROM "daily_activity_lines" l
             WHERE l."activity_id" = target_activity_id),
           0)
   WHERE d."id" = target_activity_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION daily_activity_lines_maintain_total()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_daily_activity_total(OLD."activity_id");
  ELSE
    PERFORM refresh_daily_activity_total(NEW."activity_id");
    -- A line moved between days: the day it left must be refreshed as well.
    IF TG_OP = 'UPDATE' AND NEW."activity_id" IS DISTINCT FROM OLD."activity_id" THEN
      PERFORM refresh_daily_activity_total(OLD."activity_id");
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "daily_activity_lines_maintain_total_trg"
AFTER INSERT OR UPDATE OR DELETE ON "daily_activity_lines"
FOR EACH ROW EXECUTE FUNCTION daily_activity_lines_maintain_total();
