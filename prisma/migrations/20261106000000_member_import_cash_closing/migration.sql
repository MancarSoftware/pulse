-- AlterTable
ALTER TABLE "Membership" ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'PAYMENT';

-- CreateTable
CREATE TABLE "MemberImportBatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashClosing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "opening" DECIMAL(14,2) NOT NULL,
    "counted" DECIMAL(14,2) NOT NULL,
    "expected" DECIMAL(14,2) NOT NULL,
    "difference" DECIMAL(14,2) NOT NULL,
    "cashMethodIds" TEXT[],
    "methodSnapshot" JSONB NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberImportBatch_organizationId_id_key" ON "MemberImportBatch"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MemberImportBatch_organizationId_requestKey_key" ON "MemberImportBatch"("organizationId", "requestKey");

-- CreateIndex
CREATE INDEX "CashClosing_organizationId_branchId_businessDate_idx" ON "CashClosing"("organizationId", "branchId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_organizationId_id_key" ON "CashClosing"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_organizationId_requestKey_key" ON "CashClosing"("organizationId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashClosing_organizationId_branchId_businessDate_version_key" ON "CashClosing"("organizationId", "branchId", "businessDate", "version");

-- CreateIndex
CREATE INDEX "Membership_organizationId_importBatchId_idx" ON "Membership"("organizationId", "importBatchId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_importBatchId_fkey" FOREIGN KEY ("organizationId", "importBatchId") REFERENCES "MemberImportBatch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportBatch" ADD CONSTRAINT "MemberImportBatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportBatch" ADD CONSTRAINT "MemberImportBatch_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberImportBatch" ADD CONSTRAINT "MemberImportBatch_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "Staff"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_organizationId_branchId_fkey" FOREIGN KEY ("organizationId", "branchId") REFERENCES "Branch"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashClosing" ADD CONSTRAINT "CashClosing_organizationId_createdById_fkey" FOREIGN KEY ("organizationId", "createdById") REFERENCES "Staff"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Membership" ADD CONSTRAINT "membership_origin_check" CHECK (("origin" = 'PAYMENT' AND "importBatchId" IS NULL) OR ("origin" = 'IMPORT' AND "importBatchId" IS NOT NULL));
ALTER TABLE "MemberImportBatch" ADD CONSTRAINT "import_count_check" CHECK ("recordCount" BETWEEN 1 AND 100);
ALTER TABLE "CashClosing" ADD CONSTRAINT "closing_amounts_check" CHECK ("opening" >= 0 AND "counted" >= 0 AND "version" >= 1 AND "entryCount" >= 0 AND "difference" = "counted" - "expected");
CREATE TRIGGER cash_closing_immutable BEFORE UPDATE OR DELETE ON "CashClosing" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER member_import_immutable BEFORE UPDATE OR DELETE ON "MemberImportBatch" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
