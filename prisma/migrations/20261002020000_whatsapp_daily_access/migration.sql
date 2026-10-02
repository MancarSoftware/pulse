ALTER TABLE "Member" ADD COLUMN "whatsappConsentAt" TIMESTAMP(3);
ALTER TABLE "CheckIn" ADD COLUMN "accessDay" DATE;
-- Historical check-ins keep their existing timestamps. NULL preserves any past repeat visits.
CREATE UNIQUE INDEX "CheckIn_organizationId_memberId_accessDay_key" ON "CheckIn"("organizationId", "memberId", "accessDay");
CREATE TYPE "WhatsAppStatus" AS ENUM ('PENDING', 'PROCESSING', 'ACCEPTED', 'FAILED', 'REVIEW', 'CANCELLED');
CREATE TABLE "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" "WhatsAppStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingAt" TIMESTAMP(3), "sendingAt" TIMESTAMP(3), "acceptedAt" TIMESTAMP(3),
  "providerMessageId" TEXT, "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WhatsAppMessage_member_fkey" FOREIGN KEY ("organizationId", "memberId") REFERENCES "Member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppMessage_membership_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "WhatsAppMessage_kind_check" CHECK ("kind" IN ('WELCOME', 'RENEWAL'))
);
CREATE UNIQUE INDEX "WhatsAppMessage_organizationId_membershipId_key" ON "WhatsAppMessage"("organizationId", "membershipId");
CREATE INDEX "WhatsAppMessage_organizationId_status_nextAttemptAt_idx" ON "WhatsAppMessage"("organizationId", "status", "nextAttemptAt");
