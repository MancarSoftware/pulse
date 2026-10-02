BEGIN;
-- Retain legacy durations and paid contract boundaries. Only unambiguous
-- 30/90/180-day catalogs are converted automatically; other plans need review.
ALTER TABLE "Plan" ALTER COLUMN "durationDays" DROP NOT NULL;
ALTER TABLE "Plan" ADD COLUMN "durationMonths" INTEGER;
ALTER TABLE "Membership" ADD COLUMN "durationMonths" INTEGER;
UPDATE "Plan" SET "durationMonths" = CASE "durationDays"
  WHEN 30 THEN 1 WHEN 90 THEN 3 WHEN 180 THEN 6 END;
UPDATE "Plan" SET "active" = false WHERE "durationMonths" IS NULL;
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_months_valid"
  CHECK ("durationMonths" IS NULL OR "durationMonths" IN (1, 3, 6));
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_months_required_when_active"
  CHECK (NOT "active" OR "durationMonths" IS NOT NULL);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_months_valid"
  CHECK ("durationMonths" IS NULL OR "durationMonths" IN (1, 3, 6));
COMMIT;
