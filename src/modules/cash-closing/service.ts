import { createHash } from "node:crypto";
import { z } from "zod";
import { db, serializable, type Tx } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { branchScope, audit } from "@/modules/transactions/service";
import { AppError } from "@/shared/errors";
import { dayStart, addDays, localDate } from "@/shared/dates";
import { Decimal } from "@/shared/money";
import { Prisma } from "@/generated/prisma/client";
const amount = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, "Importe inválido");
const base = z.object({
  branchId: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function window(date: string) {
  let from: Date;
  try {
    from = dayStart(date);
  } catch {
    throw new AppError("DATE", "Fecha inválida", 422);
  }
  if (date > localDate())
    throw new AppError(
      "FUTURE_DATE",
      "No puedes cerrar una fecha futura.",
      422,
    );
  return {
    from,
    to: addDays(from, 1),
    businessDate: new Date(`${date}T00:00:00Z`),
  };
}
export async function closingSnapshot(
  ctx: Context,
  input: unknown,
  client: Tx | typeof db = db,
) {
  authorize(ctx, "reports:read");
  const data = base.strict().parse(input);
  const period = window(data.date);
  await branchScope(client, ctx, data.branchId);
  const where = {
    organizationId: ctx.organizationId,
    branchId: data.branchId,
    occurredAt: { gte: period.from, lt: period.to },
  };
  const [positive, negative, methods, latest] = await Promise.all([
    client.ledgerEntry.groupBy({
      by: ["paymentMethodId"],
      where: { ...where, amount: { gte: 0 } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    client.ledgerEntry.groupBy({
      by: ["paymentMethodId"],
      where: { ...where, amount: { lt: 0 } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    client.paymentMethod.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { id: "asc" },
      select: { id: true, name: true, active: true },
    }),
    client.cashClosing.findFirst({
      where: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        businessDate: period.businessDate,
      },
      orderBy: { version: "desc" },
    }),
  ]);
  const totals = methods.map((method) => {
    const p = positive.find((item) => item.paymentMethodId === method.id);
    const n = negative.find((item) => item.paymentMethodId === method.id);
    const incoming = p?._sum.amount ?? new Decimal(0);
    const outgoing = n?._sum.amount ?? new Decimal(0);
    return {
      ...method,
      incoming: incoming.toFixed(2),
      outgoing: outgoing.negated().toFixed(2),
      net: incoming.plus(outgoing).toFixed(2),
      count: (p?._count.id ?? 0) + (n?._count.id ?? 0),
    };
  });
  const count = totals.reduce((total, item) => total + item.count, 0);
  const signature = digest(totals);
  return {
    date: data.date,
    branchId: data.branchId,
    methods: totals,
    entryCount: count,
    signature,
    latest: latest
      ? {
          id: latest.id,
          version: latest.version,
          opening: latest.opening.toFixed(2),
          counted: latest.counted.toFixed(2),
          expected: latest.expected.toFixed(2),
          difference: latest.difference.toFixed(2),
          reason: latest.reason,
          entryCount: latest.entryCount,
          createdAt: latest.createdAt.toISOString(),
          cashMethodIds: latest.cashMethodIds,
        }
      : null,
    changedSinceClosing: !!latest && count !== latest.entryCount,
  };
}
export type ClosingSnapshot = Awaited<ReturnType<typeof closingSnapshot>>;
const closeSchema = base
  .extend({
    opening: amount,
    counted: amount,
    cashMethodIds: z.array(z.string().min(1).max(100)).min(1).max(100),
    signature: z.string().regex(/^[a-f0-9]{64}$/),
    previousId: z.string().max(100).nullable(),
    reason: z.string().trim().max(1000).default(""),
    requestKey: z.uuid(),
  })
  .strict();
export async function saveCashClosing(ctx: Context, input: unknown) {
  authorize(ctx, "reports:read");
  const data = closeSchema.parse(input);
  const ids = [...new Set(data.cashMethodIds)].sort();
  const requestHash = digest({
    ...data,
    cashMethodIds: ids,
    requestKey: undefined,
  });
  return serializable(async (tx) => {
    await branchScope(tx, ctx, data.branchId);
    const prior = await tx.cashClosing.findUnique({
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
      return { id: prior.id, version: prior.version };
    }
    const snapshot = await closingSnapshot(
      ctx,
      { branchId: data.branchId, date: data.date },
      tx,
    );
    if (
      snapshot.signature !== data.signature ||
      (snapshot.latest?.id ?? null) !== data.previousId
    )
      throw new AppError(
        "CLOSING_CHANGED",
        "Los movimientos o el cierre cambiaron. Revisa y actualiza el cálculo antes de confirmar.",
        409,
      );
    if (ids.some((id) => !snapshot.methods.some((method) => method.id === id)))
      throw new AppError(
        "METHOD",
        "Selecciona formas de pago de tu gimnasio.",
        422,
      );
    const net = snapshot.methods
      .filter((method) => ids.includes(method.id))
      .reduce((sum, method) => sum.plus(method.net), new Decimal(0));
    const expected = new Decimal(data.opening).plus(net);
    const difference = new Decimal(data.counted).minus(expected);
    if ((!difference.isZero() || snapshot.latest) && data.reason.length < 5)
      throw new AppError(
        "REASON_REQUIRED",
        "Explica la diferencia o el motivo de la nueva versión (mínimo 5 caracteres).",
        422,
      );
    if (
      expected.abs().greaterThan("999999999999.99") ||
      difference.abs().greaterThan("999999999999.99")
    )
      throw new AppError(
        "AMOUNT",
        "El importe supera el límite admitido.",
        422,
      );
    const closing = await tx.cashClosing.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        createdById: ctx.staffId,
        businessDate: window(data.date).businessDate,
        version: (snapshot.latest?.version ?? 0) + 1,
        opening: data.opening,
        counted: data.counted,
        expected,
        difference,
        cashMethodIds: ids,
        methodSnapshot: snapshot.methods,
        entryCount: snapshot.entryCount,
        reason: data.reason,
        requestKey: data.requestKey,
        requestHash,
      },
    });
    await audit(tx, ctx, "cash.closing.recorded", closing.id, {
      branchId: data.branchId,
      date: data.date,
      version: closing.version,
      difference: difference.toFixed(2),
      reason: data.reason,
    });
    return { id: closing.id, version: closing.version };
  }).catch(async (error) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const prior = await db.cashClosing.findUnique({
        where: {
          organizationId_requestKey: {
            organizationId: ctx.organizationId,
            requestKey: data.requestKey,
          },
        },
      });
      if (prior && prior.requestHash === requestHash)
        return { id: prior.id, version: prior.version };
      throw new AppError(
        "CLOSING_CHANGED",
        "El cierre ya cambió o la solicitud fue usada con otros datos. Actualiza el cálculo.",
        409,
      );
    }
    throw error;
  });
}
