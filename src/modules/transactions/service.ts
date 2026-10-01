import { createHash } from "node:crypto";
import { db, serializable, type Tx } from "@/infrastructure/db";
import { Prisma } from "@/generated/prisma/client";
import { AppError, requireFound } from "@/shared/errors";
import { authorizeBranch, type Context } from "@/modules/auth/permissions";
export async function branchScope(tx: Tx, ctx: Context, branchId: string) {
  authorizeBranch(ctx, branchId);
  return requireFound(
    await tx.branch.findFirst({
      where: { id: branchId, organizationId: ctx.organizationId, active: true },
    }),
  );
}
export async function audit(
  tx: Tx,
  ctx: Context,
  action: string,
  entityId: string,
  detail: Record<string, string | number | boolean> = {},
) {
  return tx.auditEvent.create({
    data: {
      organizationId: ctx.organizationId,
      actorId: ctx.staffId,
      action,
      entityId,
      detail,
    },
  });
}
export async function financialOperation(
  ctx: Context,
  data: { idempotencyKey: string; branchId: string; paymentMethodId: string },
  kind: string,
  operation: (tx: Tx, requestHash: string) => Promise<unknown>,
) {
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ kind, actor: ctx.staffId, data }))
    .digest("hex");
  try {
    return await serializable(async (tx) => {
      await branchScope(tx, ctx, data.branchId);
      const existing = await tx.ledgerEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: ctx.organizationId,
            idempotencyKey: data.idempotencyKey,
          },
        },
      });
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new AppError(
            "IDEMPOTENCY_CONFLICT",
            "La referencia ya se utilizó para otra operación",
            409,
          );
        return existing;
      }
      requireFound(
        await tx.paymentMethod.findFirst({
          where: {
            organizationId: ctx.organizationId,
            id: data.paymentMethodId,
            active: true,
          },
        }),
        "Método de pago no disponible",
      );
      return operation(tx, requestHash);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.ledgerEntry.findUnique({
        where: {
          organizationId_idempotencyKey: {
            organizationId: ctx.organizationId,
            idempotencyKey: data.idempotencyKey,
          },
        },
      });
      if (existing?.requestHash === requestHash) return existing;
    }
    throw error;
  }
}
