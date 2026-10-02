import { db } from "../src/infrastructure/db";
import { correctCalendarMemberships } from "../src/modules/memberships/calendar-correction";
// Run explicitly after deploying calendar_month_plans, using an existing owner.
const email = process.env.CALENDAR_CORRECTION_OWNER_EMAIL;
if (!email)
  throw new Error(
    "Set CALENDAR_CORRECTION_OWNER_EMAIL to the authorizing owner's email",
  );
try {
  const owner = await db.staff.findFirstOrThrow({
    where: { role: "OWNER", active: true, user: { email } },
  });
  const result = await correctCalendarMemberships({
    userId: owner.userId,
    staffId: owner.id,
    organizationId: owner.organizationId,
    branchId: owner.branchId,
    role: "OWNER",
  });
  console.log(JSON.stringify(result));
} finally {
  await db.$disconnect();
}
