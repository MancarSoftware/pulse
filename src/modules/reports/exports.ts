import { z } from "zod";
import { db } from "@/infrastructure/db";
import type { Context } from "@/modules/auth/permissions";
import { audit } from "@/modules/transactions/service";
import { AppError } from "@/shared/errors";
import { encodeCsv, type CsvCell } from "@/shared/csv";
import { addDays, dayStart, localDate } from "@/shared/dates";
import { membershipStatus } from "@/shared/dates";
import { membershipLabels } from "@/shared/presentation";
const schema = z
  .object({
    kind: z.enum(["members", "memberships", "transactions"]),
    branchId: z.string().max(100).optional(),
    from: z.string().max(10).optional(),
    to: z.string().max(10).optional(),
  })
  .strict();
export async function prepareExport(ctx: Context, input: unknown) {
  if (ctx.role !== "OWNER")
    throw new AppError(
      "FORBIDDEN",
      "Solo el propietario puede exportar los registros del gimnasio.",
      403,
    );
  const data = schema.parse(input);
  let range: { gte: Date; lt: Date } | undefined;
  if (data.from || data.to || data.kind === "transactions") {
    try {
      if (!data.from || !data.to) throw new Error();
      const from = dayStart(data.from),
        to = addDays(dayStart(data.to), 1);
      if (to <= from || to.getTime() - from.getTime() > 366 * 86400000)
        throw new Error();
      range = { gte: from, lt: to };
    } catch {
      throw new AppError(
        "DATES",
        "Indica un período válido de hasta 366 días, con ambas fechas.",
        422,
      );
    }
  }
  if (
    data.branchId &&
    !(await db.branch.findFirst({
      where: { organizationId: ctx.organizationId, id: data.branchId },
      select: { id: true },
    }))
  )
    throw new AppError("BRANCH", "Sucursal no disponible.", 404);
  const scope = {
    organizationId: ctx.organizationId,
    ...(data.branchId ? { branchId: data.branchId } : {}),
  };
  let rows: CsvCell[][];
  let count: number;
  if (data.kind === "members") {
    const members = await db.member.findMany({
      where: { ...scope, ...(range ? { createdAt: range } : {}) },
      include: { branch: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5001,
    });
    count = members.length;
    rows = [
      [
        "id",
        "nombres",
        "apellidos",
        "telefono",
        "email",
        "sucursal",
        "habilitado",
        "alta_ecuador",
        "notas",
      ],
      ...members.map((item) => [
        item.id,
        item.firstName,
        item.lastName,
        item.phone,
        item.email ?? "",
        item.branch.name,
        item.active ? "Sí" : "No",
        localDate(item.createdAt),
        item.notes,
      ]),
    ];
  } else if (data.kind === "memberships") {
    const memberships = await db.membership.findMany({
      where: { ...scope, ...(range ? { startAt: range } : {}) },
      include: {
        member: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
      },
      orderBy: [{ startAt: "desc" }, { id: "desc" }],
      take: 5001,
    });
    count = memberships.length;
    rows = [
      [
        "id",
        "socio",
        "sucursal",
        "plan",
        "inicio",
        "ultimo_dia",
        "estado",
        "servicios",
        "importe_contrato_usd",
        "origen",
      ],
      ...memberships.map((item) => [
        item.id,
        `${item.member.firstName} ${item.member.lastName}`,
        item.branch.name,
        item.planName,
        localDate(item.startAt),
        localDate(new Date(item.endAt.getTime() - 1)),
        membershipLabels[membershipStatus(item)],
        item.serviceNames.join(" | "),
        { decimal: item.amount.toFixed(2) },
        item.origin === "IMPORT"
          ? "Migrado: importe declarado, sin ingreso"
          : "Registrado en Gymora",
      ]),
    ];
  } else {
    const ledger = await db.ledgerEntry.findMany({
      where: { ...scope, occurredAt: range },
      include: {
        paymentMethod: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 5001,
    });
    count = ledger.length;
    rows = [
      [
        "referencia",
        "fecha_hora_ecuador",
        "sucursal",
        "concepto",
        "metodo",
        "importe_usd",
        "motivo",
      ],
      ...ledger.map((item) => [
        item.reference,
        item.occurredAt.toLocaleString("es-EC", {
          timeZone: "America/Guayaquil",
        }),
        item.branch.name,
        item.kind,
        item.paymentMethod.name,
        { decimal: item.amount.toFixed(2) },
        item.reason,
      ]),
    ];
  }
  if (count > 5000)
    throw new AppError(
      "EXPORT_LIMIT",
      "Hay más de 5000 registros. Reduce el período o selecciona una sucursal.",
      413,
    );
  const csv = encodeCsv(rows);
  await audit(db, ctx, "data.export.prepared", crypto.randomUUID(), {
    kind: data.kind,
    count,
    branchId: data.branchId ?? "all",
    from: data.from ?? "",
    to: data.to ?? "",
  });
  return { csv, filename: `gymora-${data.kind}-${localDate()}.csv`, count };
}
