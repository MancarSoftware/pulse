import { afterAll, expect, it } from "vitest";
import { db } from "@/infrastructure/db";
import { setupOrganization } from "@/modules/organizations/service";
import { saveCatalog } from "@/modules/organizations/catalog";
import { saveMember } from "@/modules/members/service";
import {
  previewMemberImport,
  confirmMemberImport,
} from "@/modules/members/import";
import { prepareExport } from "@/modules/reports/exports";
import {
  closingSnapshot,
  saveCashClosing,
} from "@/modules/cash-closing/service";
import { sellDayPass, checkIn } from "@/modules/checkins/service";
import { recordExpense } from "@/modules/expenses/service";
import { reverseTransaction } from "@/modules/transactions/reversal";
import { encodeCsv, memberImportHeaders } from "@/shared/csv";
import { dayStart, localDate, addDays } from "@/shared/dates";
import type { Context } from "@/modules/auth/permissions";
import { operationalReport } from "@/modules/reports/operations";
import { correctCalendarMemberships } from "@/modules/memberships/calendar-correction";
afterAll(async () => {
  await db.$disconnect();
});
async function fixture() {
  const userId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "Migration owner",
      email: `${userId}@example.test`,
    },
  });
  await setupOrganization(userId, {
    name: "Migration gym",
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
  const service = await saveCatalog(ctx, { kind: "service", name: "Máquinas" });
  const plan = await saveCatalog(ctx, {
    kind: "plan",
    name: "Mensual original",
    price: "25.00",
    durationMonths: 1,
    serviceIds: [service.id],
  });
  const cash = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId, name: "Efectivo" },
  });
  const card = await db.paymentMethod.findFirstOrThrow({
    where: { organizationId: ctx.organizationId, name: "Tarjeta" },
  });
  return { ctx, service, plan, cash, card };
}
const today = () => localDate();
const earlier = () => localDate(addDays(dayStart(localDate()), -7));
const lastDay = () => localDate(addDays(dayStart(localDate()), 20));
function csvRows(rows: string[][]) {
  return encodeCsv([[...memberImportHeaders], ...rows]);
}
it("imports original and frozen contracts atomically, with no invented income, notifications or duplicate retries", async () => {
  const f = await fixture();
  await saveMember(f.ctx, {
    firstName: "Existing",
    lastName: "Person",
    phone: "0990000001",
    branchId: f.ctx.branchId,
  });
  const csv = csvRows([
    [
      "Ana",
      "Migrada",
      "0990000002",
      "ana@example.test",
      "Original",
      "Mensual original",
      earlier(),
      lastDay(),
      "19.99",
      "",
    ],
    ["Existing", "Person", "0990000001", "", "", "", "", "", "", ""],
    ["Invalid", "Phone", "09abc", "", "", "", "", "", "", ""],
    [
      "Free",
      "Member",
      "0990000003",
      "",
      "",
      "Mensual original",
      earlier(),
      lastDay(),
      "0",
      "",
    ],
    [
      "Frozen",
      "Member",
      "0990000004",
      "",
      "",
      "Mensual original",
      earlier(),
      lastDay(),
      "25",
      earlier(),
    ],
  ]);
  const preview = await previewMemberImport(f.ctx, {
    csv,
    branchId: f.ctx.branchId,
  });
  expect(preview.rows.map((row) => row.status)).toEqual([
    "READY",
    "DUPLICATE",
    "INVALID",
    "READY",
    "READY",
  ]);
  const input = {
    csv,
    branchId: f.ctx.branchId,
    selectedRows: preview.rows
      .filter((row) => row.status === "READY")
      .map((row) => row.row),
    requestKey: crypto.randomUUID(),
    previewToken: preview.previewToken,
    confirmHistorical: true,
  };
  const results = await Promise.all([
    confirmMemberImport(f.ctx, input),
    confirmMemberImport(f.ctx, input),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(results[0].count).toBe(3);
  expect(
    await db.memberImportBatch.count({
      where: { organizationId: f.ctx.organizationId },
    }),
  ).toBe(1);
  expect(
    await db.ledgerEntry.count({
      where: { organizationId: f.ctx.organizationId },
    }),
  ).toBe(0);
  expect(
    await db.whatsAppMessage.count({
      where: { organizationId: f.ctx.organizationId },
    }),
  ).toBe(0);
  const contracts = await db.membership.findMany({
    where: { organizationId: f.ctx.organizationId },
    include: { member: true },
  });
  expect(contracts).toHaveLength(3);
  expect((await operationalReport(f.ctx, {})).contracts).toEqual({
    new: 0,
    renewals: 0,
  });
  expect((await correctCalendarMemberships(f.ctx)).corrected).toBe(0);
  expect(contracts.every((contract) => contract.origin === "IMPORT")).toBe(
    true,
  );
  const ana = contracts.find(
    (contract) => contract.member.firstName === "Ana",
  )!;
  expect(ana.startAt).toEqual(dayStart(earlier()));
  expect(ana.endAt).toEqual(addDays(dayStart(lastDay()), 1));
  expect(ana.amount.toFixed(2)).toBe("19.99");
  expect(
    contracts
      .find((contract) => contract.member.firstName === "Free")!
      .amount.toFixed(2),
  ).toBe("0.00");
  expect(
    contracts.find((contract) => contract.member.firstName === "Frozen")!.state,
  ).toBe("FROZEN");
  await expect(
    checkIn(f.ctx, {
      memberId: ana.memberId,
      branchId: f.ctx.branchId,
      serviceId: f.service.id,
    }),
  ).resolves.toHaveProperty("id");
  await expect(
    confirmMemberImport(f.ctx, { ...input, selectedRows: [3] }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY" });
});
it("rejects changed plans, CSV tampering, stale duplicates, foreign branches and unauthorized imports", async () => {
  const f = await fixture(),
    other = await fixture();
  const csv = csvRows([
    [
      "New",
      "Person",
      "0990000002",
      "",
      "",
      "Mensual original",
      earlier(),
      lastDay(),
      "25",
      "",
    ],
  ]);
  const preview = await previewMemberImport(f.ctx, {
    csv,
    branchId: f.ctx.branchId,
  });
  const input = {
    csv,
    branchId: f.ctx.branchId,
    selectedRows: [2],
    requestKey: crypto.randomUUID(),
    previewToken: preview.previewToken,
    confirmHistorical: true,
  };
  await expect(
    previewMemberImport(
      { ...f.ctx, role: "ADMIN" },
      { csv, branchId: f.ctx.branchId },
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    previewMemberImport(f.ctx, { csv, branchId: other.ctx.branchId }),
  ).rejects.toBeDefined();
  await expect(
    confirmMemberImport(f.ctx, {
      ...input,
      csv: csv.replace("New", "Changed"),
    }),
  ).rejects.toMatchObject({ code: "IMPORT_CHANGED" });
  const second = await saveCatalog(f.ctx, {
    kind: "service",
    name: "CrossFit",
  });
  await saveCatalog(f.ctx, {
    kind: "plan",
    id: f.plan.id,
    name: "Mensual original",
    price: "25.00",
    durationMonths: 1,
    serviceIds: [f.service.id, second.id],
  });
  await expect(confirmMemberImport(f.ctx, input)).rejects.toMatchObject({
    code: "IMPORT_CHANGED",
  });
  const refreshed = await previewMemberImport(f.ctx, {
    csv,
    branchId: f.ctx.branchId,
  });
  await saveMember(f.ctx, {
    firstName: "New",
    lastName: "Person",
    phone: "0990000002",
    branchId: f.ctx.branchId,
  });
  await expect(
    confirmMemberImport(f.ctx, {
      ...input,
      previewToken: refreshed.previewToken,
    }),
  ).rejects.toMatchObject({ code: "IMPORT_CHANGED" });
  expect(
    await db.memberImportBatch.count({
      where: { organizationId: f.ctx.organizationId },
    }),
  ).toBe(0);
});
it("closes physical cash with exact totals, retains revisions, requires reasons and detects later movements", async () => {
  const f = await fixture();
  const payment = (paymentMethodId: string) => ({
    branchId: f.ctx.branchId,
    paymentMethodId,
    idempotencyKey: crypto.randomUUID(),
    serviceId: f.service.id,
  });
  await sellDayPass(f.ctx, {
    ...payment(f.cash.id),
    amount: "12.50",
  });
  const paid = await db.ledgerEntry.findFirstOrThrow({
    where: {
      organizationId: f.ctx.organizationId,
      kind: "DAY_PASS",
      paymentMethodId: f.cash.id,
    },
  });
  await sellDayPass(f.ctx, { ...payment(f.card.id), amount: "9.99" });
  const category = await saveCatalog(f.ctx, {
    kind: "expense-category",
    name: "Limpieza",
  });
  await recordExpense(f.ctx, {
    branchId: f.ctx.branchId,
    paymentMethodId: f.cash.id,
    idempotencyKey: crypto.randomUUID(),
    categoryId: category.id,
    description: "Cash cleaning",
    amount: "2.25",
    date: today(),
  });
  const snapshot = await closingSnapshot(f.ctx, {
    branchId: f.ctx.branchId,
    date: today(),
  });
  const payload = {
    branchId: f.ctx.branchId,
    date: today(),
    opening: "10",
    counted: "20",
    cashMethodIds: [f.cash.id],
    signature: snapshot.signature,
    previousId: null,
    reason: "",
    requestKey: crypto.randomUUID(),
  };
  await expect(saveCashClosing(f.ctx, payload)).rejects.toMatchObject({
    code: "REASON_REQUIRED",
  });
  const before = await db.ledgerEntry.count({
    where: { organizationId: f.ctx.organizationId },
  });
  const close = { ...payload, reason: "Faltante revisado por administración" };
  const results = await Promise.all([
    saveCashClosing(f.ctx, close),
    saveCashClosing(f.ctx, close),
  ]);
  expect(results[0].id).toBe(results[1].id);
  const stored = await db.cashClosing.findUniqueOrThrow({
    where: { id: results[0].id },
  });
  expect(stored.expected.toFixed(2)).toBe("20.25");
  expect(stored.difference.toFixed(2)).toBe("-0.25");
  expect(
    await db.ledgerEntry.count({
      where: { organizationId: f.ctx.organizationId },
    }),
  ).toBe(before);
  await expect(
    db.cashClosing.update({
      where: { id: stored.id },
      data: { reason: "Overwrite" },
    }),
  ).rejects.toBeDefined();
  const next = await closingSnapshot(f.ctx, {
    branchId: f.ctx.branchId,
    date: today(),
  });
  await expect(
    saveCashClosing(f.ctx, {
      ...payload,
      signature: next.signature,
      previousId: stored.id,
      reason: "",
      counted: "20.25",
      requestKey: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "REASON_REQUIRED" });
  const revision = await saveCashClosing(f.ctx, {
    ...payload,
    signature: next.signature,
    previousId: stored.id,
    reason: "Conteo corregido y verificado",
    counted: "20.25",
    requestKey: crypto.randomUUID(),
  });
  expect(revision.version).toBe(2);
  const stale = await closingSnapshot(f.ctx, {
    branchId: f.ctx.branchId,
    date: today(),
  });
  await reverseTransaction(f.ctx, {
    entryId: paid.id,
    branchId: f.ctx.branchId,
    paymentMethodId: f.cash.id,
    reason: "Pase cancelado por el cliente",
    returnStock: false,
    idempotencyKey: crypto.randomUUID(),
  });
  expect(
    (await closingSnapshot(f.ctx, { branchId: f.ctx.branchId, date: today() }))
      .changedSinceClosing,
  ).toBe(true);
  await expect(
    saveCashClosing(f.ctx, {
      ...payload,
      signature: stale.signature,
      previousId: revision.id,
      reason: "Revisión tras devolución",
      requestKey: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "CLOSING_CHANGED" });
  await expect(
    saveCashClosing({ ...f.ctx, role: "RECEPTIONIST" }, close),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    closingSnapshot(f.ctx, {
      branchId: f.ctx.branchId,
      date: localDate(addDays(new Date(), 1)),
    }),
  ).rejects.toMatchObject({ code: "FUTURE_DATE" });
});
it("exports only the owner's tenant and selected dates, excludes credentials and escapes formulas", async () => {
  const f = await fixture(),
    other = await fixture();
  const member = await saveMember(f.ctx, {
    firstName: "=SUM(1+1)",
    lastName: "Export",
    phone: "0990000001",
    branchId: f.ctx.branchId,
  });
  const privateRow = await db.member.findUniqueOrThrow({
    where: { id: member.id },
  });
  await saveMember(other.ctx, {
    firstName: "Foreign",
    lastName: "Tenant",
    phone: "0990000002",
    branchId: other.ctx.branchId,
  });
  const output = await prepareExport(f.ctx, {
    kind: "members",
    branchId: f.ctx.branchId,
  });
  expect(output.count).toBe(1);
  expect(output.csv).toContain("'=SUM(1+1)");
  expect(output.csv).not.toContain("Foreign");
  expect(output.csv).not.toContain(privateRow.credential);
  await expect(
    prepareExport({ ...f.ctx, role: "ADMIN" }, { kind: "members" }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    prepareExport(f.ctx, { kind: "members", branchId: other.ctx.branchId }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    prepareExport(f.ctx, { kind: "transactions" }),
  ).rejects.toMatchObject({ code: "DATES" });
  const noRows = await prepareExport(f.ctx, {
    kind: "members",
    from: "2000-01-01",
    to: "2000-01-02",
  });
  expect(noRows.count).toBe(0);
  expect(
    await db.auditEvent.count({
      where: {
        organizationId: f.ctx.organizationId,
        action: "data.export.prepared",
      },
    }),
  ).toBe(2);
});

it("flags a backdated expense after an older day's closing without rewriting the snapshot", async () => {
  const f = await fixture();
  const date = localDate(addDays(dayStart(localDate()), -1));
  const snapshot = await closingSnapshot(f.ctx, {
    branchId: f.ctx.branchId,
    date,
  });
  const closing = await saveCashClosing(f.ctx, {
    branchId: f.ctx.branchId,
    date,
    opening: "0",
    counted: "0",
    cashMethodIds: [f.cash.id],
    signature: snapshot.signature,
    previousId: null,
    reason: "",
    requestKey: crypto.randomUUID(),
  });
  const category = await saveCatalog(f.ctx, {
    kind: "expense-category",
    name: "Late receipt",
  });
  await recordExpense(f.ctx, {
    branchId: f.ctx.branchId,
    paymentMethodId: f.cash.id,
    idempotencyKey: crypto.randomUUID(),
    categoryId: category.id,
    description: "Backdated expense",
    amount: "1.25",
    date,
  });
  expect(
    (await closingSnapshot(f.ctx, { branchId: f.ctx.branchId, date }))
      .changedSinceClosing,
  ).toBe(true);
  expect(
    (
      await db.cashClosing.findUniqueOrThrow({ where: { id: closing.id } })
    ).expected.toFixed(2),
  ).toBe("0.00");
});
it("requires a narrower export above the row limit instead of silently truncating data", async () => {
  const f = await fixture();
  await db.member.createMany({
    data: Array.from({ length: 5001 }, (_, index) => ({
      organizationId: f.ctx.organizationId,
      branchId: f.ctx.branchId,
      firstName: `Bulk ${index}`,
      lastName: "Limit",
      phone: String(index).padStart(10, "0"),
    })),
  });
  await expect(prepareExport(f.ctx, { kind: "members" })).rejects.toMatchObject(
    { code: "EXPORT_LIMIT", status: 413 },
  );
  expect(
    await db.auditEvent.count({
      where: {
        organizationId: f.ctx.organizationId,
        action: "data.export.prepared",
      },
    }),
  ).toBe(0);
});

it("resolves the exact plan name when case variants exist", async () => {
  const f = await fixture();
  const otherService = await saveCatalog(f.ctx, {
    kind: "service",
    name: "Otro servicio",
  });
  const variant = await saveCatalog(f.ctx, {
    kind: "plan",
    name: "mensual original",
    price: "30.00",
    durationMonths: 1,
    serviceIds: [otherService.id],
  });
  const csv = csvRows([
    [
      "Exacta",
      "Migrada",
      "0990000099",
      "",
      "",
      "mensual original",
      earlier(),
      lastDay(),
      "25",
      "",
    ],
  ]);
  const preview = await previewMemberImport(f.ctx, {
    csv,
    branchId: f.ctx.branchId,
  });
  expect(preview.rows[0].services).toEqual(["Otro servicio"]);
  await confirmMemberImport(f.ctx, {
    csv,
    branchId: f.ctx.branchId,
    selectedRows: [2],
    requestKey: crypto.randomUUID(),
    previewToken: preview.previewToken,
    confirmHistorical: true,
  });
  expect(
    (
      await db.membership.findFirstOrThrow({
        where: { organizationId: f.ctx.organizationId },
      })
    ).planId,
  ).toBe(variant.id);
});
