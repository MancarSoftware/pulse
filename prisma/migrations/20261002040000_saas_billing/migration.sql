CREATE TYPE "SaaSPaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "PlatformAdmin" (
 "userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PlatformAudit" (
 "id" TEXT PRIMARY KEY, "actorUserId" TEXT NOT NULL, "action" TEXT NOT NULL,
 "entityId" TEXT NOT NULL, "detail" JSONB NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "PlatformAudit_createdAt_idx" ON "PlatformAudit"("createdAt");
CREATE TABLE "SaaSBillingSettings" (
 "id" TEXT PRIMARY KEY DEFAULT 'main', "trialDays" INTEGER NOT NULL DEFAULT 0 CHECK ("trialDays" BETWEEN 0 AND 90),
 "graceDays" INTEGER NOT NULL DEFAULT 3 CHECK ("graceDays" BETWEEN 0 AND 30),
 "paymentInstructions" TEXT NOT NULL DEFAULT '', "updatedAt" TIMESTAMP(3) NOT NULL
);
INSERT INTO "SaaSBillingSettings" ("id", "updatedAt") VALUES ('main', CURRENT_TIMESTAMP);
CREATE TABLE "SaaSPlan" (
 "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "price" DECIMAL(12,2) NOT NULL CHECK ("price" >= 0),
 "durationMonths" INTEGER NOT NULL CHECK ("durationMonths" IN (1,12)),
 "active" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SaaSPlan_active_price" CHECK (NOT "active" OR "price" > 0)
);
INSERT INTO "SaaSPlan" ("id", "name", "price", "durationMonths") VALUES ('mancar-monthly', 'MANCAR Mensual', 0, 1);
CREATE TABLE "SaaSSubscription" (
 "organizationId" TEXT PRIMARY KEY REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "trialEndsAt" TIMESTAMP(3) NOT NULL, "paidUntil" TIMESTAMP(3),
 "planId" TEXT REFERENCES "SaaSPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 "graceDays" INTEGER NOT NULL DEFAULT 3 CHECK ("graceDays" BETWEEN 0 AND 30), "updatedAt" TIMESTAMP(3) NOT NULL
);
-- Initial unpaid accounts require approval; business records are never deleted.
INSERT INTO "SaaSSubscription" ("organizationId", "trialEndsAt", "updatedAt")
 SELECT "id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Organization";
CREATE TABLE "SaaSPayment" (
 "id" TEXT PRIMARY KEY,
 "organizationId" TEXT NOT NULL REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "planId" TEXT NOT NULL REFERENCES "SaaSPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "planName" TEXT NOT NULL, "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
 "durationMonths" INTEGER NOT NULL CHECK ("durationMonths" IN (1,12)),
 "method" TEXT NOT NULL CHECK ("method" IN ('TRANSFER', 'CASH')),
 "reference" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT '',
 "idempotencyKey" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
 "status" "SaaSPaymentStatus" NOT NULL DEFAULT 'PENDING',
 "submittedBy" TEXT NOT NULL, "reviewedBy" TEXT, "reviewedAt" TIMESTAMP(3), "reviewNote" TEXT,
 "verifiedReference" TEXT UNIQUE, "periodStart" TIMESTAMP(3), "periodEnd" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SaaSPayment_organizationId_idempotencyKey_key" ON "SaaSPayment"("organizationId", "idempotencyKey");
CREATE INDEX "SaaSPayment_status_createdAt_idx" ON "SaaSPayment"("status", "createdAt");
CREATE INDEX "SaaSPayment_organizationId_createdAt_idx" ON "SaaSPayment"("organizationId", "createdAt");
