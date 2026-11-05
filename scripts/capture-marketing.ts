// Run against an isolated test database: npx tsx --env-file=.env.test scripts/capture-marketing.ts
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import sharp from "sharp";
import { db } from "../src/infrastructure/db";
import { setupOrganization } from "../src/modules/organizations/service";
import { saveCatalog } from "../src/modules/organizations/catalog";
import { saveMember } from "../src/modules/members/service";
import { renewMembership } from "../src/modules/memberships/service";
import { checkIn } from "../src/modules/checkins/service";
import { addDays } from "../src/shared/dates";
import type { Context } from "../src/modules/auth/permissions";

if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith("_test")
) {
  throw new Error(
    "Capture requires an isolated _test database; never use customer data.",
  );
}
const origin = "http://localhost:3002";
// Fail instead of attaching to an existing server with an unknown database.
if (
  await fetch(origin).then(
    () => true,
    () => false,
  )
)
  throw new Error("Port 3002 must be free.");
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3002",
  ],
  {
    env: { ...process.env, BETTER_AUTH_URL: origin },
    windowsHide: true,
    stdio: "ignore",
  },
);
const browser = await chromium.launch();
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (
      await fetch(`${origin}/login`).then(
        (response) => response.ok,
        () => false,
      )
    ) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Capture server did not start.");
  const userId = crypto.randomUUID();
  const password = `Capture-${crypto.randomUUID()}!`;
  const email = `capture-${userId}@example.test`;
  await db.user.create({
    data: {
      id: userId,
      name: "Administración · Demostración",
      email,
      accounts: {
        create: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          password: await hashPassword(password),
        },
      },
    },
  });
  await setupOrganization(userId, {
    name: "Gimnasio de demostración",
    branchName: "Sucursal de ejemplo",
  });
  const staff = await db.staff.findUniqueOrThrow({ where: { userId } });
  const ctx: Context = {
    userId,
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    role: "OWNER",
  };
  await db.saaSSubscription.update({
    where: { organizationId: ctx.organizationId },
    data: { paidUntil: addDays(new Date(), 30) },
  });
  const method = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId, name: "Efectivo" },
  });
  const service = await saveCatalog(ctx, { kind: "service", name: "Máquinas" });
  const plan = await saveCatalog(ctx, {
    kind: "plan",
    name: "Mensual · Máquinas",
    price: "25.00",
    durationMonths: 1,
    serviceIds: [service.id],
  });
  for (const [index, [firstName, lastName]] of [
    ["Andrea", "Ejemplo"],
    ["Mateo", "Demostración"],
    ["Lucía", "Muestra"],
    ["Diego", "Prueba"],
  ].entries()) {
    const member = await saveMember(ctx, {
      firstName,
      lastName,
      branchId: ctx.branchId,
      phone: `000000000${index}`,
    });
    await renewMembership(ctx, {
      branchId: ctx.branchId,
      memberId: member.id,
      planId: plan.id,
      expectedPrice: "25.00",
      expectedLatestId: null,
      paymentMethodId: method.id,
      idempotencyKey: crypto.randomUUID(),
    });
    if (index < 2)
      await checkIn(ctx, {
        memberId: member.id,
        branchId: ctx.branchId,
        serviceId: service.id,
      });
  }
  const page = await browser.newPage({
    viewport: { width: 1448, height: 1000 },
    reducedMotion: "reduce",
  });
  await page.goto(`${origin}/login`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar a mi gimnasio" }).click();
  await page.waitForURL("**/dashboard");
  await mkdir("public/previews", { recursive: true });
  for (const route of ["check-in", "members", "dashboard"]) {
    await page.goto(`${origin}/${route}`);
    await page.waitForLoadState("networkidle");
    const box = await page.locator(".workspace").boundingBox();
    if (!box || box.width !== 1200)
      throw new Error("Unexpected capture dimensions.");
    const screenshot = await page.screenshot({
      clip: { x: box.x, y: 0, width: 1200, height: 850 },
      animations: "disabled",
    });
    await sharp(screenshot)
      .webp({ quality: 88 })
      .toFile(`public/previews/${route}.webp`);
  }
  console.log(
    "Captured three real screens using exclusively synthetic test data.",
  );
} finally {
  await browser.close();
  server.kill();
  await db.$disconnect();
}
