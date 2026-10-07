import { afterAll, expect, it } from "vitest";
import { db } from "@/infrastructure/db";
import { setupOrganization } from "@/modules/organizations/service";
import {
  submitSubscriptionPayment,
  reviewSubscriptionPayment,
  saveSaaSPlan,
  ownerBilling,
  saveBillingSettings,
} from "@/modules/billing/service";
import {
  requireSubscription,
  subscriptionAccess,
} from "@/modules/billing/access";
import { dayStart, addDays, localDate } from "@/shared/dates";
import type { Context } from "@/modules/auth/permissions";
afterAll(async () => {
  await db.$disconnect();
});
async function fixture() {
  const userId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "Billing owner",
      email: `${userId}@example.test`,
    },
  });
  await setupOrganization(userId, {
    name: `Billing ${userId}`,
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
  return ctx;
}
async function arrange() {
  const ctx = await fixture(),
    other = await fixture();
  await db.platformAdmin.create({ data: { userId: other.userId } });
  await db.saaSSubscription.updateMany({
    where: {
      organizationId: { in: [ctx.organizationId, other.organizationId] },
    },
    data: { trialEndsAt: new Date(Date.now() - 1) },
  });
  await db.saaSBillingSettings.update({
    where: { id: "main" },
    data: {
      trialDays: 2,
      graceDays: 1,
      paymentInstructions: "Test only. No actual payments.",
    },
  });
  const plan = await saveSaaSPlan(other.userId, {
    name: "Monthly test",
    price: "29.00",
    durationMonths: "1",
    active: true,
  });
  return { ctx, admin: other.userId, other, plan };
}
function submission(planId: string) {
  return {
    planId,
    expectedPrice: "29.00",
    method: "TRANSFER",
    reference: `OWNER-${crypto.randomUUID()}`,
    idempotencyKey: crypto.randomUUID(),
  };
}
function approval(paymentId: string) {
  return {
    paymentId,
    decision: "APPROVE",
    verifiedReference: `BANK-${crypto.randomUUID()}`,
    fundsReceived: true,
    note: "Received full payment in bank statement",
  };
}
it("creates an isolated 48-hour trial and keeps its member data through expiry and paid activation", async () => {
  const { admin, plan } = await arrange();
  const before = Date.now();
  const ctx = await fixture();
  const subscription = await db.saaSSubscription.findUniqueOrThrow({
    where: { organizationId: ctx.organizationId },
  });
  const remaining = subscription.trialEndsAt.getTime() - before;
  expect(remaining).toBeGreaterThanOrEqual(48 * 60 * 60 * 1000);
  expect(remaining).toBeLessThan(48 * 60 * 60 * 1000 + 10000);
  expect((await subscriptionAccess(ctx.organizationId)).state).toBe("TRIAL");
  const member = await db.member.create({
    data: {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      firstName: "Private",
      lastName: "Trial",
      phone: "0991000001",
    },
  });
  await expect(
    setupOrganization(ctx.userId, { name: "Reset", branchName: "Reset" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    (
      await db.saaSSubscription.findUniqueOrThrow({
        where: { organizationId: ctx.organizationId },
      })
    ).trialEndsAt,
  ).toEqual(subscription.trialEndsAt);
  await db.saaSSubscription.update({
    where: { organizationId: ctx.organizationId },
    data: { trialEndsAt: new Date(Date.now() - 1) },
  });
  await expect(requireSubscription(ctx.organizationId)).rejects.toMatchObject({
    code: "SUBSCRIPTION_SUSPENDED",
  });
  expect(
    await db.member.findUnique({ where: { id: member.id } }),
  ).not.toBeNull();
  const payment = await submitSubscriptionPayment(ctx, submission(plan.id));
  await reviewSubscriptionPayment(admin, approval(payment.id));
  expect((await subscriptionAccess(ctx.organizationId)).state).toBe("ACTIVE");
  expect(
    (await db.member.findUniqueOrThrow({ where: { id: member.id } }))
      .organizationId,
  ).toBe(ctx.organizationId);
});
it("keeps unpaid gyms suspended and separates platform permissions from gym ownership", async () => {
  const { ctx, plan } = await arrange();
  expect((await subscriptionAccess(ctx.organizationId)).state).toBe(
    "SUSPENDED",
  );
  await expect(requireSubscription(ctx.organizationId)).rejects.toMatchObject({
    code: "SUBSCRIPTION_SUSPENDED",
  });
  await expect(
    saveSaaSPlan(ctx.userId, {
      name: "Unauthorized",
      price: "1.00",
      durationMonths: 1,
      active: true,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    submitSubscriptionPayment({ ...ctx, role: "ADMIN" }, submission(plan.id)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    ownerBilling({ ...ctx, role: "RECEPTIONIST" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("only verified approval activates access, survives concurrent replay and preserves price snapshots", async () => {
  const { ctx, admin, plan } = await arrange();
  const data = submission(plan.id);
  const payment = await submitSubscriptionPayment(ctx, data);
  expect((await submitSubscriptionPayment(ctx, data)).id).toBe(payment.id);
  await expect(
    submitSubscriptionPayment(ctx, { ...data, reference: "Changed" }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect((await subscriptionAccess(ctx.organizationId)).allowed).toBe(false);
  await expect(
    submitSubscriptionPayment(ctx, submission(plan.id)),
  ).rejects.toMatchObject({ code: "PENDING_PAYMENT" });
  await expect(
    reviewSubscriptionPayment(ctx.userId, approval(payment.id)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(
    reviewSubscriptionPayment(admin, {
      ...approval(payment.id),
      fundsReceived: false,
    }),
  ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
  await saveSaaSPlan(admin, {
    id: plan.id,
    name: "Changed future quote",
    price: "99.00",
    durationMonths: 6,
    active: false,
  });
  const verify = approval(payment.id);
  await Promise.all([
    reviewSubscriptionPayment(admin, verify),
    reviewSubscriptionPayment(admin, verify),
  ]);
  const row = await db.saaSPayment.findUniqueOrThrow({
    where: { id: payment.id },
  });
  expect(row.amount.toFixed(2)).toBe("29.00");
  expect(row.durationMonths).toBe(1);
  expect(row.status).toBe("APPROVED");
  const [endYear, endMonth, endDay] = localDate(row.periodEnd!)
    .split("-")
    .map(Number);
  expect(endDay).toBe(
    Math.min(30, new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate()),
  );
  expect((await subscriptionAccess(ctx.organizationId)).state).toBe("ACTIVE");
  const originalEnd = (
    await db.saaSSubscription.findUniqueOrThrow({
      where: { organizationId: ctx.organizationId },
    })
  ).paidUntil;
  expect(
    (
      await db.saaSSubscription.findUniqueOrThrow({
        where: { organizationId: ctx.organizationId },
      })
    ).graceDays,
  ).toBe(1);
  await reviewSubscriptionPayment(admin, verify);
  expect(
    (
      await db.saaSSubscription.findUniqueOrThrow({
        where: { organizationId: ctx.organizationId },
      })
    ).paidUntil,
  ).toEqual(originalEnd);
  expect(
    await db.ledgerEntry.count({
      where: { organizationId: ctx.organizationId },
    }),
  ).toBe(0);
});
it("extends early renewals, rejects reused bank receipts and leaves rejection without access", async () => {
  const { ctx, admin, other, plan } = await arrange();
  const first = await submitSubscriptionPayment(ctx, submission(plan.id));
  const verify = approval(first.id);
  await reviewSubscriptionPayment(admin, verify);
  const oldEnd = (
    await db.saaSSubscription.findUniqueOrThrow({
      where: { organizationId: ctx.organizationId },
    })
  ).paidUntil!;
  const next = await submitSubscriptionPayment(ctx, submission(plan.id));
  await reviewSubscriptionPayment(admin, approval(next.id));
  expect(
    (await db.saaSPayment.findUniqueOrThrow({ where: { id: next.id } }))
      .periodStart,
  ).toEqual(oldEnd);
  const duplicate = await submitSubscriptionPayment(other, submission(plan.id));
  await expect(
    reviewSubscriptionPayment(admin, { ...verify, paymentId: duplicate.id }),
  ).rejects.toMatchObject({ code: "DUPLICATE_RECEIPT" });
  await reviewSubscriptionPayment(admin, {
    paymentId: duplicate.id,
    decision: "REJECT",
    note: "No funds received",
  });
  expect((await subscriptionAccess(other.organizationId)).allowed).toBe(false);
  expect(
    (await ownerBilling(ctx)).payments.every(
      (p) => p.organizationId === ctx.organizationId,
    ),
  ).toBe(true);
});
it("expires through grace without deleting business records and restores a late payer", async () => {
  const { ctx, admin, plan } = await arrange();
  const member = await db.member.create({
    data: {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      firstName: "Saved",
      lastName: "Member",
      phone: "0990000000",
    },
  });
  await db.saaSSubscription.update({
    where: { organizationId: ctx.organizationId },
    data: { paidUntil: addDays(new Date(), -4) },
  });
  await expect(requireSubscription(ctx.organizationId)).rejects.toMatchObject({
    code: "SUBSCRIPTION_SUSPENDED",
  });
  expect(
    await db.member.findUnique({ where: { id: member.id } }),
  ).not.toBeNull();
  const payment = await submitSubscriptionPayment(ctx, submission(plan.id));
  await reviewSubscriptionPayment(admin, approval(payment.id));
  const row = await db.saaSPayment.findUniqueOrThrow({
    where: { id: payment.id },
  });
  expect(row.periodStart).toEqual(dayStart(localDate()));
  expect((await subscriptionAccess(ctx.organizationId)).allowed).toBe(true);
});
it("checks stale pricing, prohibits free published plans and revokes platform reviewers", async () => {
  const { ctx, admin, plan } = await arrange();
  await expect(
    saveSaaSPlan(admin, {
      name: "Free",
      price: "0.00",
      durationMonths: 1,
      active: true,
    }),
  ).rejects.toMatchObject({ code: "VALIDATION" });
  await expect(
    submitSubscriptionPayment(ctx, {
      ...submission(plan.id),
      expectedPrice: "1.00",
    }),
  ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
  const payment = await submitSubscriptionPayment(ctx, submission(plan.id));
  await db.platformAdmin.update({
    where: { userId: admin },
    data: { active: false },
  });
  await expect(
    reviewSubscriptionPayment(admin, approval(payment.id)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});
it("accepts only one of two simultaneous pending submissions", async () => {
  const { ctx, plan } = await arrange();
  const results = await Promise.allSettled([
    submitSubscriptionPayment(ctx, submission(plan.id)),
    submitSubscriptionPayment(ctx, submission(plan.id)),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    await db.saaSPayment.count({
      where: { organizationId: ctx.organizationId, status: "PENDING" },
    }),
  ).toBe(1);
});
it("offers 1, 3 and 6 months and rejects other durations or a longer grace", async () => {
  const { ctx, admin } = await arrange();
  for (const [months, price] of [
    [3, "70.00"],
    [6, "135.00"],
  ] as const) {
    const plan = await saveSaaSPlan(admin, {
      name: `Term ${months}`,
      price,
      durationMonths: months,
      active: true,
    });
    const payment = await submitSubscriptionPayment(ctx, {
      ...submission(plan.id),
      expectedPrice: price,
    });
    await reviewSubscriptionPayment(admin, approval(payment.id));
    const row = await db.saaSPayment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(row.durationMonths).toBe(months);
    expect(row.amount.toFixed(2)).toBe(price);
    const [startYear, startMonth] = localDate(row.periodStart!)
      .split("-")
      .map(Number);
    const [endYear, endMonth] = localDate(row.periodEnd!)
      .split("-")
      .map(Number);
    const elapsedMonths = (endYear - startYear) * 12 + endMonth - startMonth;
    expect(elapsedMonths).toBeGreaterThanOrEqual(months);
    expect(elapsedMonths).toBeLessThanOrEqual(months + 1);
  }
  for (const months of [2, 12])
    await expect(
      saveSaaSPlan(admin, {
        name: "Unsupported",
        price: "25.00",
        durationMonths: months,
        active: true,
      }),
    ).rejects.toThrow();
  await expect(
    saveBillingSettings(admin, { graceDays: 3, paymentInstructions: "Test" }),
  ).rejects.toThrow();
});
