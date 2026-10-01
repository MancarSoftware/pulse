ALTER TABLE "Plan" ADD CONSTRAINT "Plan_price_positive" CHECK (price > 0), ADD CONSTRAINT "Plan_duration_valid" CHECK ("durationDays" BETWEEN 1 AND 3660);
ALTER TABLE "Product" ADD CONSTRAINT "Product_prices_valid" CHECK (price > 0 AND cost >= 0 AND "lowStock" >= 0);
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_nonnegative" CHECK (quantity >= 0);
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_valid" CHECK (quantity > 0 AND "unitPrice" > 0 AND total = quantity * "unitPrice");
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_positive" CHECK (total > 0);
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_valid" CHECK ("endAt" > "startAt" AND amount > 0 AND cardinality("serviceIds") > 0);
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_positive" CHECK (amount > 0);
ALTER TABLE "DayPass" ADD CONSTRAINT "DayPass_positive" CHECK (amount > 0);
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "Movement_nonzero" CHECK (quantity <> 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "Ledger_sign" CHECK ((kind IN ('MEMBERSHIP_PAYMENT','DAY_PASS','PRODUCT_SALE','CORRECTION') AND amount > 0) OR (kind IN ('EXPENSE','REFUND') AND amount < 0));
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "Ledger_source" CHECK (
  (kind = 'MEMBERSHIP_PAYMENT' AND "membershipId" IS NOT NULL AND num_nonnulls("membershipId","saleId","expenseId","dayPassId","reversesId") = 1) OR
  (kind = 'PRODUCT_SALE' AND "saleId" IS NOT NULL AND num_nonnulls("membershipId","saleId","expenseId","dayPassId","reversesId") = 1) OR
  (kind = 'EXPENSE' AND "expenseId" IS NOT NULL AND num_nonnulls("membershipId","saleId","expenseId","dayPassId","reversesId") = 1) OR
  (kind = 'DAY_PASS' AND "dayPassId" IS NOT NULL AND num_nonnulls("membershipId","saleId","expenseId","dayPassId","reversesId") = 1) OR
  (kind IN ('REFUND','CORRECTION') AND "reversesId" IS NOT NULL AND num_nonnulls("membershipId","saleId","expenseId","dayPassId","reversesId") = 1)
);
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Append-only record'; END $$;
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON "InventoryMovement" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
