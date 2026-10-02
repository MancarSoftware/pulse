import { db } from "@/infrastructure/db";
export default async function globalSetup() {
  if (
    !process.env.DATABASE_URL ||
    !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
  )
    throw new Error("E2E setup requires an isolated test database");
  // Each suite starts with fresh auth counters; the app's real rate limits remain active.
  await db.rateLimit.deleteMany();
  await db.saaSPlan.updateMany({
    where: { name: { startsWith: "Foundation " } },
    data: { active: false },
  });
  await db.$disconnect();
}
