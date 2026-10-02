-- Change only the platform subscriptions, never gym members' memberships.
ALTER TABLE "SaaSPlan" DROP CONSTRAINT "SaaSPlan_durationMonths_check";
ALTER TABLE "SaaSPlan" ADD CONSTRAINT "SaaSPlan_durationMonths_check" CHECK ("durationMonths" IN (1,3,6,12));
UPDATE "SaaSPlan" SET "active" = false WHERE "durationMonths" NOT IN (1,3,6);
ALTER TABLE "SaaSPlan" ADD CONSTRAINT "SaaSPlan_published_duration" CHECK (NOT "active" OR "durationMonths" IN (1,3,6));
-- Historical quotes are immutable; an old 12-month quote may still be reviewed.
ALTER TABLE "SaaSPayment" DROP CONSTRAINT "SaaSPayment_durationMonths_check";
ALTER TABLE "SaaSPayment" ADD CONSTRAINT "SaaSPayment_durationMonths_check" CHECK ("durationMonths" IN (1,3,6,12));
UPDATE "SaaSBillingSettings" SET "trialDays" = 0, "graceDays" = 1, "updatedAt" = CURRENT_TIMESTAMP;
UPDATE "SaaSSubscription" SET "graceDays" = 1, "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "SaaSBillingSettings" ALTER COLUMN "graceDays" SET DEFAULT 1;
ALTER TABLE "SaaSSubscription" ALTER COLUMN "graceDays" SET DEFAULT 1;
ALTER TABLE "SaaSBillingSettings" DROP CONSTRAINT "SaaSBillingSettings_graceDays_check";
ALTER TABLE "SaaSBillingSettings" ADD CONSTRAINT "SaaSBillingSettings_graceDays_check" CHECK ("graceDays" = 1);
ALTER TABLE "SaaSSubscription" DROP CONSTRAINT "SaaSSubscription_graceDays_check";
ALTER TABLE "SaaSSubscription" ADD CONSTRAINT "SaaSSubscription_graceDays_check" CHECK ("graceDays" = 1);
INSERT INTO "SaaSPlan" ("id", "name", "price", "durationMonths", "active") VALUES
 ('mancar-monthly', 'MANCAR Mensual', 25, 1, true),
 ('mancar-quarterly', 'MANCAR Trimestral', 70, 3, true),
 ('mancar-semiannual', 'MANCAR Semestral', 135, 6, true)
ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "price" = EXCLUDED."price", "durationMonths" = EXCLUDED."durationMonths", "active" = EXCLUDED."active";
-- Existing paid access dates and historical payments remain unchanged.
