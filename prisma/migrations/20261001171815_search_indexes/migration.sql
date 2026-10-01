CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Member_firstName_trgm" ON "Member" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "Member_lastName_trgm" ON "Member" USING GIN ("lastName" gin_trgm_ops);
CREATE INDEX "Member_phone_trgm" ON "Member" USING GIN (phone gin_trgm_ops);
CREATE INDEX "Product_name_trgm" ON "Product" USING GIN (name gin_trgm_ops);
CREATE INDEX "Membership_org_member_created" ON "Membership" ("organizationId", "memberId", "createdAt");
