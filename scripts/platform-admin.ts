import { db } from "../src/infrastructure/db";
const email = process.argv[process.argv.indexOf("--email") + 1];
if (!process.argv.includes("--email") || !email || !email.includes("@"))
  throw new Error(
    "Usage: npm run platform:admin -- --email existing-account@example.com [--revoke]",
  );
try {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user)
    throw new Error("Create the user account first. No account was changed.");
  const active = !process.argv.includes("--revoke");
  await db.$transaction(async (tx) => {
    await tx.platformAdmin.upsert({
      where: { userId: user.id },
      create: { userId: user.id, active },
      update: { active },
    });
    await tx.platformAudit.create({
      data: {
        actorUserId: user.id,
        action: active
          ? "platform.admin.granted.local"
          : "platform.admin.revoked.local",
        entityId: user.id,
        detail: { source: "operator-cli" },
      },
    });
  });
  console.log(
    active
      ? "Platform administrator enabled."
      : "Platform administrator revoked.",
  );
} finally {
  await db.$disconnect();
}
