import { afterAll, expect, it } from "vitest";
import { db } from "@/infrastructure/db";
import { setupOrganization } from "@/modules/organizations/service";
import { saveCatalog } from "@/modules/organizations/catalog";
import { sellDayPass } from "@/modules/checkins/service";
import { sellProducts } from "@/modules/sales/service";
import { moveInventory } from "@/modules/inventory/service";
import { readBody, checkOrigin } from "@/infrastructure/http";
import { dayStart, localDate } from "@/shared/dates";
import type { Context } from "@/modules/auth/permissions";
afterAll(async () => {
  await db.$disconnect();
});
async function setup() {
  const userId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "Security test",
      email: `${userId}@example.test`,
    },
  });
  await setupOrganization(userId, {
    name: "Security tenant",
    branchName: "Home",
  });
  const staff = await db.staff.findUniqueOrThrow({ where: { userId } });
  const ctx: Context = {
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    userId,
    role: "OWNER",
  };
  const method = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId },
  });
  return {
    ctx,
    method,
    payment: () => ({
      branchId: ctx.branchId,
      paymentMethodId: method.id,
      idempotencyKey: crypto.randomUUID(),
    }),
  };
}
it("accepts concurrent identical payment retries exactly once", async () => {
  const f = await setup();
  const service = await saveCatalog(f.ctx, { kind: "service", name: "Dance" });
  const payload = { ...f.payment(), serviceId: service.id, amount: "3.00" };
  const results = await Promise.all([
    sellDayPass(f.ctx, payload),
    sellDayPass(f.ctx, payload),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(
    await db.dayPass.count({ where: { organizationId: f.ctx.organizationId } }),
  ).toBe(1);
});
it("rolls back a multi-product sale including its earlier inventory deduction", async () => {
  const f = await setup();
  const first = await saveCatalog(f.ctx, {
    kind: "product",
    name: "In stock",
    sku: "A",
    price: "1",
    cost: "0",
    lowStock: 0,
  });
  const second = await saveCatalog(f.ctx, {
    kind: "product",
    name: "No stock",
    sku: "B",
    price: "1",
    cost: "0",
    lowStock: 0,
  });
  await moveInventory(f.ctx, {
    branchId: f.ctx.branchId,
    productId: first.id,
    kind: "PURCHASE",
    quantity: 2,
    reason: "Initial stock",
  });
  await expect(
    sellProducts(f.ctx, {
      ...f.payment(),
      lines: [
        { productId: first.id, quantity: 1, expectedPrice: "1" },
        { productId: second.id, quantity: 1, expectedPrice: "1" },
      ],
    }),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  expect(
    await db.sale.count({ where: { organizationId: f.ctx.organizationId } }),
  ).toBe(0);
  expect(
    await db.ledgerEntry.count({
      where: { organizationId: f.ctx.organizationId },
    }),
  ).toBe(0);
  expect(
    (await db.inventory.findFirstOrThrow({ where: { productId: first.id } }))
      .quantity,
  ).toBe(2);
  expect(
    await db.inventoryMovement.count({
      where: { organizationId: f.ctx.organizationId, kind: "SALE" },
    }),
  ).toBe(0);
});
it("enforces reception branch restriction even within the same tenant", async () => {
  const f = await setup();
  const branch = await saveCatalog(f.ctx, { kind: "branch", name: "Other" });
  const service = await saveCatalog(f.ctx, { kind: "service", name: "Yoga" });
  await expect(
    sellDayPass(
      { ...f.ctx, role: "RECEPTIONIST" },
      {
        ...f.payment(),
        branchId: branch.id,
        serviceId: service.id,
        amount: "2",
      },
    ),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("rejects forged origin and oversized JSON before parsing", async () => {
  expect(() =>
    checkOrigin(
      new Request("http://localhost:3000", {
        headers: { origin: "https://attacker.example" },
      }),
    ),
  ).toThrow();
  await expect(
    readBody(
      new Request("http://localhost:3000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(40000) }),
      }),
    ),
  ).rejects.toMatchObject({ code: "TOO_LARGE" });
});
it("persists UTC instants without server-local timezone drift", async () => {
  const f = await setup();
  const service = await saveCatalog(f.ctx, {
    kind: "service",
    name: "Time test",
  });
  const before = Date.now();
  await sellDayPass(f.ctx, {
    ...f.payment(),
    serviceId: service.id,
    amount: "1",
  });
  const entry = await db.ledgerEntry.findFirstOrThrow({
    where: { organizationId: f.ctx.organizationId },
  });
  expect(entry.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
  expect(entry.occurredAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  const local = await db.$queryRaw<
    { day: string }[]
  >`SELECT to_char("occurredAt" AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD') AS day FROM "LedgerEntry" WHERE id = ${entry.id}`;
  expect(local[0].day).toBe(localDate());
  const roundtrip = await db.$queryRaw<
    { instant: Date }[]
  >`SELECT ${dayStart(localDate())}::timestamptz AS instant`;
  expect(roundtrip[0].instant.toISOString()).toBe(
    dayStart(localDate()).toISOString(),
  );
});
