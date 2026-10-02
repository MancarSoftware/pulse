-- Match the required organization relationships to Prisma's restrict/cascade semantics.
ALTER TABLE "WhatsAppConnection" DROP CONSTRAINT "WhatsAppConnection_organizationId_fkey";
ALTER TABLE "WhatsAppConnection" ADD CONSTRAINT "WhatsAppConnection_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WhatsAppSignup" DROP CONSTRAINT "WhatsAppSignup_organizationId_fkey";
ALTER TABLE "WhatsAppSignup" ADD CONSTRAINT "WhatsAppSignup_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
