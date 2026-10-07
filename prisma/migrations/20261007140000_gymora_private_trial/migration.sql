ALTER TABLE "SaaSBillingSettings" ALTER COLUMN "trialDays" SET DEFAULT 2;
UPDATE "SaaSBillingSettings" SET "trialDays" = 2, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = 'main';
ALTER TABLE "SaaSBillingSettings" DROP CONSTRAINT "SaaSBillingSettings_trialDays_check";
ALTER TABLE "SaaSBillingSettings" ADD CONSTRAINT "SaaSBillingSettings_trialDays_check" CHECK ("trialDays" = 2);
UPDATE "SaaSPlan" SET "name" = 'Gymora Mensual' WHERE "id" = 'mancar-monthly' AND "name" = 'MANCAR Mensual';
UPDATE "SaaSPlan" SET "name" = 'Gymora Trimestral' WHERE "id" = 'mancar-quarterly' AND "name" = 'MANCAR Trimestral';
UPDATE "SaaSPlan" SET "name" = 'Gymora Semestral' WHERE "id" = 'mancar-semiannual' AND "name" = 'MANCAR Semestral';
-- Existing gyms keep their access dates. Historical payment quotes and all
-- business data are untouched. Only new organizations receive the private trial.
