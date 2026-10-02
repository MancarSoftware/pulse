import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { db } from "@/infrastructure/db";
import { setupOrganization } from "@/modules/organizations/service";
import { saveCatalog } from "@/modules/organizations/catalog";
import { saveMember, getMember } from "@/modules/members/service";
import {
  renewMembership,
  changeMembershipState,
} from "@/modules/memberships/service";
import { checkIn, sellDayPass } from "@/modules/checkins/service";
import { sellProducts } from "@/modules/sales/service";
import { moveInventory } from "@/modules/inventory/service";
import { recordExpense } from "@/modules/expenses/service";
import { reverseTransaction } from "@/modules/transactions/reversal";
import { financialReport } from "@/modules/reports/queries";
import type { Context } from "@/modules/auth/permissions";
import { localDate, dayStart, addDays } from "@/shared/dates";
import { correctCalendarMemberships } from "@/modules/memberships/calendar-correction";
async function fixture() {
  const userId = crypto.randomUUID();
  await db.user.create({
    data: { id: userId, name: "Test owner", email: `${userId}@example.test` },
  });
  await setupOrganization(userId, {
    name: `Test ${userId}`,
    branchName: "Central",
  });
  const staff = await db.staff.findUniqueOrThrow({ where: { userId } });
  const ctx: Context = {
    userId,
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    role: "OWNER",
  };
  const method = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId },
  });
  const service = await saveCatalog(ctx, { kind: "service", name: "Machines" });
  const plan = await saveCatalog(ctx, {
    kind: "plan",
    name: "Mensual",
    price: "25.00",
    durationMonths: 1,
    serviceIds: [service.id],
  });
  const member = await saveMember(ctx, {
    firstName: "Andrea",
    lastName: "López",
    phone: "0990000000",
    branchId: ctx.branchId,
  });
  return { ctx, method, service, plan, member };
}
let a: Awaited<ReturnType<typeof fixture>>,
  b: Awaited<ReturnType<typeof fixture>>;
beforeAll(async () => {
  a = await fixture();
  b = await fixture();
});
afterAll(async () => {
  await db.$disconnect();
});
function payment(f = a) {
  return {
    branchId: f.ctx.branchId,
    paymentMethodId: f.method.id,
    idempotencyKey: crypto.randomUUID(),
  };
}
function renewal(f = a) {
  return {
    ...payment(f),
    memberId: f.member.id,
    planId: f.plan.id,
    expectedPrice: "25.00",
    expectedLatestId: null,
  };
}
describe("tenant isolation and authorization", () => {
  it("rejects another organization's member read and edit", async () => {
    await expect(getMember(a.ctx, b.member.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      saveMember(
        a.ctx,
        {
          firstName: "Changed",
          lastName: "Person",
          phone: "0991111111",
          branchId: a.ctx.branchId,
        },
        b.member.id,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("rejects other tenant branch, payment method, plan and service IDs", async () => {
    for (const override of [
      { branchId: b.ctx.branchId },
      { paymentMethodId: b.method.id },
      { planId: b.plan.id },
    ])
      await expect(
        renewMembership(a.ctx, { ...renewal(), ...override }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveCatalog(a.ctx, {
        kind: "plan",
        name: "Leak",
        price: "10",
        durationMonths: 1,
        serviceIds: [b.service.id],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SERVICES" });
  });
  it("enforces composite foreign keys without application guards", async () => {
    await expect(
      db.member.create({
        data: {
          organizationId: a.ctx.organizationId,
          branchId: b.ctx.branchId,
          firstName: "Invalid",
          lastName: "Tenant",
          phone: "0000000",
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });
  it("blocks privilege escalation", async () => {
    await expect(
      saveCatalog(
        { ...a.ctx, role: "RECEPTIONIST" },
        { kind: "service", name: "Forbidden" },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      financialReport({ ...a.ctx, role: "TRAINER" }, {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
describe("memberships and attendance", () => {
  it("corrects legacy contracts, preserves pauses and shifts prepaid periods with an audit", async () => {
    const legacy = await fixture();
    await db.plan.update({
      where: { id: legacy.plan.id },
      data: { durationDays: 30 },
    });
    await renewMembership(legacy.ctx, renewal(legacy));
    const first = await db.membership.findFirstOrThrow({
      where: { memberId: legacy.member.id },
    });
    await renewMembership(legacy.ctx, {
      ...renewal(legacy),
      expectedLatestId: first.id,
    });
    const second = await db.membership.findFirstOrThrow({
      where: { memberId: legacy.member.id, id: { not: first.id } },
    });
    await db.membership.update({
      where: { id: first.id },
      data: {
        durationMonths: null,
        startAt: dayStart("2026-10-01"),
        endAt: dayStart("2026-11-05"),
        state: "FROZEN",
        frozenAt: dayStart("2026-10-10"),
      },
    });
    await db.membership.update({
      where: { id: second.id },
      data: {
        durationMonths: null,
        startAt: dayStart("2026-11-05"),
        endAt: dayStart("2026-12-05"),
        state: "FROZEN",
        frozenAt: dayStart("2026-10-10"),
      },
    });
    const result = await correctCalendarMemberships(legacy.ctx);
    expect(result).toEqual({ corrected: 2, shifted: 0, review: [] });
    const corrected = await db.membership.findMany({
      where: { memberId: legacy.member.id },
      orderBy: { startAt: "asc" },
    });
    expect(corrected[0].endAt).toEqual(dayStart("2026-11-06"));
    expect(corrected[1].startAt).toEqual(corrected[0].endAt);
    expect(corrected[1].endAt).toEqual(dayStart("2026-12-06"));
    expect(
      corrected.every((m) => m.state === "FROZEN" && m.durationMonths === 1),
    ).toBe(true);
    expect(
      await db.auditEvent.count({
        where: {
          organizationId: legacy.ctx.organizationId,
          action: "membership.calendar.corrected",
        },
      }),
    ).toBe(2);
    expect(
      await db.ledgerEntry.count({
        where: {
          organizationId: legacy.ctx.organizationId,
          kind: "MEMBERSHIP_PAYMENT",
        },
      }),
    ).toBe(2);
    expect(await correctCalendarMemberships(legacy.ctx)).toEqual({
      corrected: 0,
      shifted: 0,
      review: [],
    });
    await expect(
      correctCalendarMemberships({ ...legacy.ctx, role: "RECEPTIONIST" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rejects invalid member contacts before persistence", async () => {
    for (const override of [
      { phone: "099abc1234" },
      { phone: "09912345678" },
      { email: "sin-arroba.example.com" },
    ]) {
      await expect(
        saveMember(a.ctx, {
          firstName: "Invalid",
          lastName: "Contact",
          phone: "0991234567",
          branchId: a.ctx.branchId,
          ...override,
        }),
      ).rejects.toMatchObject({ name: "ZodError" });
    }
    expect(
      await db.member.count({
        where: {
          organizationId: a.ctx.organizationId,
          firstName: "Invalid",
          lastName: "Contact",
        },
      }),
    ).toBe(0);
  });
  it("atomically records payment and membership, retries idempotently", async () => {
    const data = renewal();
    await renewMembership(a.ctx, data);
    await renewMembership(a.ctx, data);
    expect(
      await db.membership.count({
        where: { organizationId: a.ctx.organizationId, memberId: a.member.id },
      }),
    ).toBe(1);
    expect(
      await db.ledgerEntry.count({
        where: {
          organizationId: a.ctx.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
      }),
    ).toBe(1);
    await expect(
      renewMembership(a.ctx, { ...data, expectedPrice: "26.00" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("allows contracted service, denies other service and duplicate scan", async () => {
    const request = {
      branchId: a.ctx.branchId,
      memberId: a.member.id,
      serviceId: a.service.id,
    };
    await checkIn(a.ctx, request);
    await expect(checkIn(a.ctx, request)).rejects.toMatchObject({
      code: "DUPLICATE_SCAN",
    });
    const other = await saveCatalog(a.ctx, { kind: "service", name: "Boxing" });
    await expect(
      checkIn(a.ctx, { ...request, serviceId: other.id }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      checkIn(b.ctx, { ...request, branchId: b.ctx.branchId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("prevents simultaneous double renewals with stale expected membership", async () => {
    const latest = await db.membership.findFirstOrThrow({
      where: { memberId: a.member.id },
      orderBy: { endAt: "desc" },
    });
    const results = await Promise.allSettled([
      renewMembership(a.ctx, { ...renewal(), expectedLatestId: latest.id }),
      renewMembership(a.ctx, { ...renewal(), expectedLatestId: latest.id }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const memberships = await db.membership.findMany({
      where: { memberId: a.member.id },
      orderBy: { endAt: "asc" },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships[1].startAt).toEqual(memberships[0].endAt);
  });
  it("freeze denies access; resume preserves paused calendar days for future contracts", async () => {
    await changeMembershipState(a.ctx, {
      memberId: a.member.id,
      action: "freeze",
      reason: "Viaje del socio",
    });
    await expect(
      checkIn(a.ctx, {
        branchId: a.ctx.branchId,
        memberId: a.member.id,
        serviceId: a.service.id,
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const before = await db.membership.findMany({
      where: { memberId: a.member.id },
      orderBy: { endAt: "asc" },
    });
    await db.membership.updateMany({
      where: { memberId: a.member.id },
      data: { frozenAt: addDays(dayStart(localDate()), -5) },
    });
    await changeMembershipState(a.ctx, {
      memberId: a.member.id,
      action: "resume",
      reason: "Regreso del socio",
    });
    const after = await db.membership.findMany({
      where: { memberId: a.member.id },
      orderBy: { endAt: "asc" },
    });
    expect(after[0].endAt).toEqual(addDays(before[0].endAt, 5));
    expect(after[1].startAt).toEqual(addDays(before[1].startAt, 5));
  });
  it("denies expired memberships", async () => {
    await renewMembership(b.ctx, renewal(b));
    await db.membership.updateMany({
      where: { memberId: b.member.id },
      data: {
        startAt: addDays(dayStart(localDate()), -32),
        endAt: addDays(dayStart(localDate()), -2),
      },
    });
    await expect(
      checkIn(b.ctx, {
        branchId: b.ctx.branchId,
        memberId: b.member.id,
        serviceId: b.service.id,
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });
});
describe("commerce and accounting", () => {
  it("sells last unit only once under concurrency; failure rolls back all records", async () => {
    const product = await saveCatalog(a.ctx, {
      kind: "product",
      name: "Water",
      sku: crypto.randomUUID(),
      price: "1.25",
      cost: "0.50",
      lowStock: 2,
    });
    await moveInventory(a.ctx, {
      branchId: a.ctx.branchId,
      productId: product.id,
      quantity: 1,
      kind: "PURCHASE",
      reason: "Initial delivery",
    });
    const sell = () =>
      sellProducts(a.ctx, {
        ...payment(),
        lines: [{ productId: product.id, quantity: 1, expectedPrice: "1.25" }],
      });
    const results = await Promise.allSettled([sell(), sell()]);
    expect(
      results.filter((r) => r.status === "fulfilled"),
      results
        .filter((r) => r.status === "rejected")
        .map((r) => String(r.reason))
        .join("\n"),
    ).toHaveLength(1);
    const inventory = await db.inventory.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(inventory.quantity).toBe(0);
    expect(await db.saleLine.count({ where: { productId: product.id } })).toBe(
      1,
    );
    expect(
      await db.inventoryMovement.count({
        where: { productId: product.id, kind: "SALE" },
      }),
    ).toBe(1);
    const saleEntry = await db.ledgerEntry.findFirstOrThrow({
      where: {
        organizationId: a.ctx.organizationId,
        kind: "PRODUCT_SALE",
        sale: { lines: { some: { productId: product.id } } },
      },
    });
    await reverseTransaction(a.ctx, {
      ...payment(),
      entryId: saleEntry.id,
      returnStock: true,
      reason: "Producto devuelto",
    });
    expect(
      (
        await db.inventory.findFirstOrThrow({
          where: { productId: product.id },
        })
      ).quantity,
    ).toBe(1);
    await expect(
      reverseTransaction(a.ctx, {
        ...payment(),
        entryId: saleEntry.id,
        returnStock: true,
        reason: "Doble devolución",
      }),
    ).rejects.toMatchObject({ code: "ALREADY_REVERSED" });
  });
  it("records day pass and expense into exact financial totals", async () => {
    const category = await saveCatalog(b.ctx, {
      kind: "expense-category",
      name: "Cleaning",
    });
    await sellDayPass(b.ctx, {
      ...payment(b),
      serviceId: b.service.id,
      amount: "3.50",
    });
    await recordExpense(b.ctx, {
      ...payment(b),
      categoryId: category.id,
      description: "Cleaning supplies",
      amount: "2.10",
      date: localDate(),
    });
    const report = await financialReport(b.ctx, {});
    expect(
      report.sources
        .find((s) => s.kind === "DAY_PASS")
        ?._sum.amount?.toFixed(2),
    ).toBe("3.50");
    expect(
      report.sources.find((s) => s.kind === "EXPENSE")?._sum.amount?.toFixed(2),
    ).toBe("-2.10");
    expect(
      report.sources.find((s) => s.kind === "PRODUCT_SALE"),
    ).toBeUndefined();
  });
  it("rejects edits and deletes to immutable ledger", async () => {
    const entry = await db.ledgerEntry.findFirstOrThrow({
      where: { organizationId: a.ctx.organizationId },
    });
    await expect(
      db.ledgerEntry.update({
        where: { id: entry.id },
        data: { amount: "0.01" },
      }),
    ).rejects.toThrow();
    await expect(
      db.ledgerEntry.delete({ where: { id: entry.id } }),
    ).rejects.toThrow();
  });
});

describe("catalog deletion", () => {
  it("deletes unused records with an audit entry and isolates tenants", async () => {
    const { deleteCatalog } = await import("@/modules/organizations/deletion");
    const category = await saveCatalog(a.ctx, {
      kind: "expense-category",
      name: "Unused category",
    });
    await expect(
      deleteCatalog(b.ctx, { kind: "expense-category", id: category.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      deleteCatalog(
        { ...a.ctx, role: "RECEPTIONIST" },
        { kind: "expense-category", id: category.id },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteCatalog(a.ctx, { kind: "expense-category", id: category.id });
    expect(
      await db.expenseCategory.findUnique({ where: { id: category.id } }),
    ).toBeNull();
    expect(
      await db.auditEvent.count({
        where: {
          organizationId: a.ctx.organizationId,
          action: "catalog.expense-category.deleted",
        },
      }),
    ).toBeGreaterThan(0);
  });
  it("preserves used plans and services and prevents deleting the active branch", async () => {
    const { deleteCatalog } = await import("@/modules/organizations/deletion");
    const fresh = await fixture();
    await renewMembership(fresh.ctx, renewal(fresh));
    await expect(
      deleteCatalog(fresh.ctx, { kind: "plan", id: fresh.plan.id }),
    ).rejects.toMatchObject({ code: "IN_USE" });
    expect(
      await db.planService.count({ where: { planId: fresh.plan.id } }),
    ).toBe(1);
    await expect(
      deleteCatalog(fresh.ctx, { kind: "service", id: fresh.service.id }),
    ).rejects.toMatchObject({ code: "IN_USE" });
    await expect(
      deleteCatalog(a.ctx, { kind: "branch", id: a.ctx.branchId }),
    ).rejects.toMatchObject({ code: "ACTIVE_BRANCH" });
  });
});
