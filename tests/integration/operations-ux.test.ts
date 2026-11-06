import { afterAll, expect, it } from "vitest";
import { db } from "@/infrastructure/db";
import { setupOrganization } from "@/modules/organizations/service";
import { saveMember } from "@/modules/members/service";
import { saveCatalog } from "@/modules/organizations/catalog";
import { renewMembership } from "@/modules/memberships/service";
import { checkIn } from "@/modules/checkins/service";
import {
  ownerActivity,
  safeActivityDetail,
} from "@/modules/organizations/activity";
import { DuplicateMemberError } from "@/shared/errors";
import type { Context } from "@/modules/auth/permissions";
import { addDays } from "@/shared/dates";
afterAll(async () => {
  await db.$disconnect();
});
async function fixture(): Promise<Context> {
  const id = crypto.randomUUID();
  await db.user.create({
    data: { id, name: "Operations owner", email: `${id}@example.test` },
  });
  await setupOrganization(id, {
    name: "Operations test gym",
    branchName: "Central",
  });
  const staff = await db.staff.findUniqueOrThrow({ where: { userId: id } });
  return {
    userId: id,
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    role: "OWNER",
  };
}
it("catches concurrent duplicates, permits reviewed family contacts, and protects cross-branch details", async () => {
  const ctx = await fixture();
  const input = {
    firstName: "Andrea",
    lastName: "Example",
    phone: "0990000010",
    branchId: ctx.branchId,
    email: "andrea@example.test",
  };
  const concurrent = await Promise.allSettled([
    saveMember(ctx, input),
    saveMember(ctx, input),
  ]);
  expect(concurrent.filter((item) => item.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(concurrent.find((item) => item.status === "rejected")).toMatchObject({
    reason: { code: "DUPLICATE_MEMBER" },
  });
  const original = await db.member.findFirstOrThrow({
    where: { organizationId: ctx.organizationId },
  });
  await expect(
    saveMember(ctx, {
      ...input,
      firstName: "Other",
      phone: "0990000011",
      email: "ANDREA@example.test",
    }),
  ).rejects.toMatchObject({ code: "DUPLICATE_MEMBER" });
  const family = await saveMember(ctx, {
    ...input,
    firstName: "Mateo",
    email: "mateo@example.test",
    duplicateConfirmed: true,
  });
  expect(family.id).not.toBe(original.id);
  const audit = await db.auditEvent.findFirstOrThrow({
    where: {
      organizationId: ctx.organizationId,
      entityId: family.id,
      action: "member.created",
    },
  });
  expect(audit.detail).toMatchObject({ duplicateConfirmed: true });
  await expect(
    saveMember(
      ctx,
      { ...input, notes: "Updated without changing identity" },
      original.id,
    ),
  ).resolves.toEqual({ id: original.id });
  const branch = await db.branch.create({
    data: { organizationId: ctx.organizationId, name: "Other branch" },
  });
  let duplicate: unknown;
  try {
    await saveMember(
      { ...ctx, branchId: branch.id, role: "RECEPTIONIST" },
      { ...input, firstName: "New", branchId: branch.id },
    );
  } catch (error) {
    duplicate = error;
  }
  expect(duplicate).toBeInstanceOf(DuplicateMemberError);
  expect((duplicate as DuplicateMemberError).matches).toEqual([]);
  const other = await fixture();
  await expect(
    saveMember(other, { ...input, branchId: other.branchId }),
  ).resolves.toHaveProperty("id");
});
it("returns accurate reception reasons while retaining the access rules", async () => {
  const ctx = await fixture();
  const service = await saveCatalog(ctx, { kind: "service", name: "Machines" });
  const extra = await saveCatalog(ctx, { kind: "service", name: "Dance" });
  const plan = await saveCatalog(ctx, {
    kind: "plan",
    name: "Monthly",
    price: "25.00",
    durationMonths: 1,
    serviceIds: [service.id],
  });
  const member = await saveMember(ctx, {
    firstName: "Test",
    lastName: "Reception",
    phone: "0990000012",
    branchId: ctx.branchId,
  });
  const method = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId },
  });
  await renewMembership(ctx, {
    memberId: member.id,
    branchId: ctx.branchId,
    planId: plan.id,
    expectedPrice: "25.00",
    expectedLatestId: null,
    paymentMethodId: method.id,
    idempotencyKey: crypto.randomUUID(),
  });
  const membership = await db.membership.findFirstOrThrow({
    where: { memberId: member.id },
  });
  const input = {
    branchId: ctx.branchId,
    memberId: member.id,
    serviceId: service.id,
  };
  await expect(
    checkIn(ctx, { ...input, serviceId: extra.id }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED", reason: "SERVICE" });
  await db.membership.update({
    where: { id: membership.id },
    data: { state: "FROZEN", frozenAt: new Date() },
  });
  await expect(checkIn(ctx, input)).rejects.toMatchObject({ reason: "FROZEN" });
  await db.membership.update({
    where: { id: membership.id },
    data: {
      state: "VALID",
      startAt: addDays(new Date(), 2),
      endAt: addDays(new Date(), 32),
    },
  });
  await expect(checkIn(ctx, input)).rejects.toMatchObject({
    reason: "SCHEDULED",
  });
  await db.membership.update({
    where: { id: membership.id },
    data: { startAt: addDays(new Date(), -32), endAt: addDays(new Date(), -1) },
  });
  await expect(checkIn(ctx, input)).rejects.toMatchObject({
    reason: "EXPIRED",
  });
  await db.membership.update({
    where: { id: membership.id },
    data: { startAt: addDays(new Date(), -1), endAt: addDays(new Date(), 20) },
  });
  await expect(checkIn(ctx, input)).resolves.toMatchObject({
    memberName: "Test Reception",
    planName: "Monthly",
  });
  await expect(checkIn(ctx, input)).rejects.toMatchObject({
    code: "DUPLICATE_SCAN",
  });
});
it("restricts audit history to the owner and their tenant, paginates, and omits arbitrary sensitive details", async () => {
  const ctx = await fixture();
  const other = await fixture();
  for (let index = 0; index < 14; index++)
    await db.auditEvent.create({
      data: {
        organizationId: ctx.organizationId,
        actorId: ctx.staffId,
        action: "member.updated",
        entityId: `test-${index}`,
        detail: { reason: "Safe reason", token: "PRIVATE-TOKEN" },
      },
    });
  const first = await ownerActivity(ctx, { group: "member" });
  expect(first.rows).toHaveLength(12);
  expect(first.total).toBe(14);
  const second = await ownerActivity(ctx, { group: "member", page: "2" });
  expect(second.rows).toHaveLength(2);
  expect(
    first.rows.every((row) => row.organizationId === ctx.organizationId),
  ).toBe(true);
  expect((await ownerActivity(other, { group: "member" })).total).toBe(0);
  await expect(
    ownerActivity({ ...ctx, role: "ADMIN" }, {}),
  ).rejects.toMatchObject({ status: 403 });
  expect(
    safeActivityDetail({
      token: "PRIVATE-TOKEN",
      password: "PRIVATE",
      reason: "Safe reason",
    }),
  ).toBe("Motivo: Safe reason");
});
