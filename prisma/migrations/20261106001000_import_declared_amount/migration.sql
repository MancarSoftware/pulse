ALTER TABLE "Membership" DROP CONSTRAINT "Membership_valid";
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_valid" CHECK ("endAt" > "startAt" AND amount >= 0 AND ("origin" = 'IMPORT' OR amount > 0) AND cardinality("serviceIds") > 0);
