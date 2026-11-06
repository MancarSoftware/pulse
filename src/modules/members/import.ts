import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, serializable, type Tx } from "@/infrastructure/db";
import { memberSchema } from "./service";
import { parseMemberCsv } from "@/shared/csv";
import { AppError } from "@/shared/errors";
import { dayStart, addDays, localDate } from "@/shared/dates";
import { readEnvironment } from "@/infrastructure/env";
import { audit, branchScope } from "@/modules/transactions/service";
import type { Context } from "@/modules/auth/permissions";
import { Prisma } from "@/generated/prisma/client";
const schema = z.object({
  csv: z.string().max(262144),
  branchId: z.string().min(1).max(100),
});
function owner(ctx: Context) {
  if (ctx.role !== "OWNER")
    throw new AppError(
      "FORBIDDEN",
      "Solo el propietario puede importar socios y contratos.",
      403,
    );
}
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function signature(
  ctx: Context,
  csv: string,
  branchId: string,
  expires: string,
  quote: string,
) {
  return createHmac("sha256", readEnvironment().BETTER_AUTH_SECRET)
    .update(
      JSON.stringify([
        ctx.organizationId,
        ctx.userId,
        branchId,
        digest(csv),
        expires,
        quote,
      ]),
    )
    .digest("hex");
}
type ImportRow = {
  row: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  plan: string;
  start: string;
  lastDay: string;
  amount: string;
  frozen: string;
  services: string[];
  status: "READY" | "INVALID" | "DUPLICATE";
  issues: string[];
};
export type MemberImportPreview = { rows: ImportRow[]; previewToken: string };
async function inspect(
  ctx: Context,
  csv: string,
  branchId: string,
  client: Tx | typeof db,
) {
  let parsed: ReturnType<typeof parseMemberCsv>;
  try {
    parsed = parseMemberCsv(csv);
  } catch (error) {
    throw new AppError(
      "CSV_INVALID",
      error instanceof Error ? error.message : "CSV inválido",
      422,
    );
  }
  const plans = await client.plan.findMany({
    where: {
      organizationId: ctx.organizationId,
      active: true,
      durationMonths: { in: [1, 3, 6] },
    },
    include: { services: { include: { service: true } } },
  });
  const rows: ImportRow[] = [];
  const phones = new Set<string>();
  const emails = new Set<string>();
  const names = new Set<string>();
  for (const source of parsed) {
    const v = source.values;
    const row: ImportRow = {
      row: source.row,
      firstName: v.nombres || "",
      lastName: v.apellidos || "",
      phone: v.telefono || "",
      email: (v.email || "").toLowerCase(),
      notes: v.notas || "",
      plan: v.plan || "",
      start: v.inicio || "",
      lastDay: v.ultimo_dia || "",
      amount: (v.importe || "").replace(",", "."),
      frozen: v.congelada_desde || "",
      services: [],
      status: "READY",
      issues: [],
    };
    const contact = memberSchema.safeParse({
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      branchId,
    });
    if (!contact.success)
      row.issues.push(...contact.error.issues.map((issue) => issue.message));
    if (row.plan || row.start || row.lastDay || row.amount || row.frozen) {
      const plan = plans.find((item) => item.name === row.plan);
      row.services = plan?.services.map((item) => item.service.name) ?? [];
      if (
        !plan ||
        !plan.services.length ||
        plan.services.some((item) => !item.service.active)
      )
        row.issues.push(
          "El plan debe existir con servicios habilitados. Usa su nombre exacto.",
        );
      try {
        const start = dayStart(row.start);
        const end = addDays(dayStart(row.lastDay), 1);
        if (start >= end)
          row.issues.push(
            "El último día debe ser igual o posterior al inicio.",
          );
        if (
          row.frozen &&
          (dayStart(row.frozen) >= end || row.frozen > localDate())
        )
          row.issues.push(
            "La congelación debe ser anterior al vencimiento y no puede estar en el futuro.",
          );
      } catch {
        row.issues.push(
          "Usa fechas válidas AAAA-MM-DD para inicio, último día y congelación.",
        );
      }
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(row.amount))
        row.issues.push(
          "Indica el importe original declarado, desde 0 y con hasta dos decimales. No se registrará como ingreso.",
        );
    }
    if (row.issues.length) row.status = "INVALID";
    else {
      const name = `${row.firstName.toLowerCase()}\0${row.lastName.toLowerCase()}`;
      const existing = await client.member.findFirst({
        where: {
          organizationId: ctx.organizationId,
          OR: [
            { phone: row.phone },
            ...(row.email
              ? [{ email: { equals: row.email, mode: "insensitive" as const } }]
              : []),
            {
              firstName: { equals: row.firstName, mode: "insensitive" },
              lastName: { equals: row.lastName, mode: "insensitive" },
            },
          ],
        },
        select: { id: true },
      });
      if (
        existing ||
        phones.has(row.phone) ||
        (row.email && emails.has(row.email)) ||
        names.has(name)
      ) {
        row.status = "DUPLICATE";
        row.issues.push(
          existing
            ? "Coincide con un socio existente. Revísalo en el directorio."
            : "Coincide con una fila anterior del archivo.",
        );
      }
      phones.add(row.phone);
      if (row.email) emails.add(row.email);
      names.add(name);
    }
    rows.push(row);
  }
  return { rows, plans };
}
function planQuote(result: Awaited<ReturnType<typeof inspect>>) {
  const names = new Set(
    result.rows.filter((row) => row.plan).map((row) => row.plan),
  );
  return digest(
    result.plans
      .filter((plan) => names.has(plan.name))
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        months: plan.durationMonths,
        services: plan.services
          .map((item) => ({
            id: item.serviceId,
            name: item.service.name,
            active: item.service.active,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}
export async function previewMemberImport(ctx: Context, input: unknown) {
  owner(ctx);
  const data = schema.strict().parse(input);
  await branchScope(db, ctx, data.branchId);
  const result = await inspect(ctx, data.csv, data.branchId, db);
  const expires = String(Date.now() + 900000);
  return {
    rows: result.rows,
    previewToken: `${expires}.${signature(ctx, data.csv, data.branchId, expires, planQuote(result))}`,
  };
}
const confirmation = schema
  .extend({
    selectedRows: z.array(z.number().int().min(2).max(101)).min(1).max(100),
    requestKey: z.uuid(),
    previewToken: z.string().max(100),
    confirmHistorical: z.literal(true),
  })
  .strict();
export async function confirmMemberImport(ctx: Context, input: unknown) {
  owner(ctx);
  const data = confirmation.parse(input);
  const selected = [...new Set(data.selectedRows)].sort((a, b) => a - b);
  const requestHash = digest([data.branchId, data.csv, selected]);
  return serializable(async (tx) => {
    await branchScope(tx, ctx, data.branchId);
    const prior = await tx.memberImportBatch.findUnique({
      where: {
        organizationId_requestKey: {
          organizationId: ctx.organizationId,
          requestKey: data.requestKey,
        },
      },
    });
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new AppError(
          "IDEMPOTENCY",
          "La solicitud ya fue usada con otros datos.",
          409,
        );
      return { id: prior.id, count: prior.recordCount };
    }
    const [expires, token] = data.previewToken.split(".");
    if (
      !/^\d+$/.test(expires || "") ||
      Number(expires) < Date.now() ||
      !/^[a-f0-9]{64}$/.test(token || "")
    )
      throw new AppError(
        "IMPORT_EXPIRED",
        "La vista previa venció o cambió. Vuelve a revisar el archivo.",
        409,
      );
    const result = await inspect(ctx, data.csv, data.branchId, tx);
    const expected = signature(
      ctx,
      data.csv,
      data.branchId,
      expires,
      planQuote(result),
    );
    if (
      !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(token, "hex"))
    )
      throw new AppError(
        "IMPORT_CHANGED",
        "El archivo o los planes cambiaron. Genera una nueva vista previa antes de importar.",
        409,
      );
    const rows = result.rows.filter((row) => selected.includes(row.row));
    if (
      rows.length !== selected.length ||
      rows.some((row) => row.status !== "READY")
    )
      throw new AppError(
        "IMPORT_CHANGED",
        "Hay errores o nuevas coincidencias. No se importó ningún registro. Actualiza la vista previa.",
        409,
      );
    const batch = await tx.memberImportBatch.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        createdById: ctx.staffId,
        requestKey: data.requestKey,
        requestHash,
        recordCount: rows.length,
      },
    });
    for (const row of rows) {
      const member = await tx.member.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: data.branchId,
          firstName: row.firstName,
          lastName: row.lastName,
          phone: row.phone,
          email: row.email || null,
          notes: row.notes,
        },
      });
      if (row.plan) {
        const plan = result.plans.find((item) => item.name === row.plan)!;
        await tx.membership.create({
          data: {
            organizationId: ctx.organizationId,
            branchId: data.branchId,
            memberId: member.id,
            planId: plan.id,
            planName: plan.name,
            durationMonths: plan.durationMonths,
            serviceIds: plan.services.map((item) => item.serviceId),
            serviceNames: plan.services.map((item) => item.service.name),
            startAt: dayStart(row.start),
            endAt: addDays(dayStart(row.lastDay), 1),
            amount: row.amount,
            origin: "IMPORT",
            importBatchId: batch.id,
            createdById: ctx.staffId,
            ...(row.frozen
              ? { state: "FROZEN", frozenAt: dayStart(row.frozen) }
              : {}),
          },
        });
      }
      await audit(tx, ctx, "member.imported", member.id, {
        batchId: batch.id,
        historicalMembership: !!row.plan,
        originalStart: row.start,
        originalLastDay: row.lastDay,
        declaredAmount: row.amount,
        originalFrozenAt: row.frozen,
      });
    }
    await audit(tx, ctx, "member.import.completed", batch.id, {
      count: rows.length,
    });
    return { id: batch.id, count: rows.length };
  }).catch(async (error) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const prior = await db.memberImportBatch.findUnique({
        where: {
          organizationId_requestKey: {
            organizationId: ctx.organizationId,
            requestKey: data.requestKey,
          },
        },
      });
      if (prior && prior.requestHash === requestHash)
        return { id: prior.id, count: prior.recordCount };
    }
    throw error;
  });
}
