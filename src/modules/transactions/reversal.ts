import { z } from "zod";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, financialOperation } from "./service";
import { id, paymentFields } from "@/shared/schemas";
import { AppError, requireFound } from "@/shared/errors";
export async function reverseTransaction(ctx: Context, input: unknown) {
  authorize(ctx, "refunds:write");
  const data = z
    .object({
      ...paymentFields,
      entryId: id,
      reason: z.string().trim().min(5).max(300),
      returnStock: z.boolean(),
    })
    .strict()
    .parse(input);
  return financialOperation(ctx, data, "reversal", async (tx, requestHash) => {
    const original = requireFound(
      await tx.ledgerEntry.findFirst({
        where: {
          organizationId: ctx.organizationId,
          id: data.entryId,
          branchId: data.branchId,
        },
        include: { reversedBy: true, sale: { include: { lines: true } } },
      }),
    );
    if (original.reversesId || original.reversedBy.length)
      throw new AppError(
        "ALREADY_REVERSED",
        "El registro no admite otra reversión",
        409,
      );
    if (original.paymentMethodId !== data.paymentMethodId)
      throw new AppError(
        "INVALID_METHOD",
        "La reversión debe usar el método del registro original",
      );
    if (data.returnStock && !original.sale)
      throw new AppError("INVALID_RETURN", "Este cobro no contiene productos");
    if (original.membershipId)
      await tx.membership.update({
        where: {
          organizationId_id: {
            organizationId: ctx.organizationId,
            id: original.membershipId,
          },
        },
        data: { state: "CANCELLED", frozenAt: null },
      });
    if (data.returnStock && original.sale)
      for (const line of original.sale.lines) {
        await tx.inventory.upsert({
          where: {
            organizationId_branchId_productId: {
              organizationId: ctx.organizationId,
              branchId: data.branchId,
              productId: line.productId,
            },
          },
          create: {
            organizationId: ctx.organizationId,
            branchId: data.branchId,
            productId: line.productId,
            quantity: line.quantity,
          },
          update: { quantity: { increment: line.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            organizationId: ctx.organizationId,
            branchId: data.branchId,
            productId: line.productId,
            saleId: original.sale.id,
            kind: "RETURN",
            quantity: line.quantity,
            reason: data.reason,
            createdById: ctx.staffId,
          },
        });
      }
    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        kind: original.amount.isNegative() ? "CORRECTION" : "REFUND",
        amount: original.amount.negated(),
        paymentMethodId: original.paymentMethodId,
        reversesId: original.id,
        idempotencyKey: data.idempotencyKey,
        requestHash,
        reason: data.reason,
        createdById: ctx.staffId,
      },
    });
    await audit(tx, ctx, "transaction.reversed", original.id, {
      reason: data.reason,
      returnStock: data.returnStock,
      reversal: entry.id,
    });
    return entry;
  });
}
