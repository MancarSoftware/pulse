CREATE TABLE "WhatsAppConnection" (
  "organizationId" TEXT PRIMARY KEY REFERENCES "Organization"("id"),
  "phoneNumberId" TEXT NOT NULL UNIQUE,
  "wabaId" TEXT NOT NULL,
  "displayPhone" TEXT NOT NULL,
  "tokenCiphertext" TEXT NOT NULL,
  "configurationFingerprint" TEXT NOT NULL,
  "ready" BOOLEAN NOT NULL DEFAULT false,
  "registered" BOOLEAN NOT NULL DEFAULT false,
  "setupMessage" TEXT NOT NULL,
  "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "WhatsAppSignup" (
  "organizationId" TEXT PRIMARY KEY REFERENCES "Organization"("id"),
  "userId" TEXT NOT NULL,
  "nonceHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumed" BOOLEAN NOT NULL DEFAULT false
);
