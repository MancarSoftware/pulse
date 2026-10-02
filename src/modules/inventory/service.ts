import { z } from "zod";
import { serializable } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, branchScope } from "@/modules/transactions/service";
import { id, integerInput } from "@/shared/schemas";
import { AppError, requireFound } from "@/shared/errors";
export const movementSchema = z
  .object({
    branchId: id,
    productId: id,
    kind: z.enum(["PURCHASE", "DAMAGED", "ADJUSTMENT", "RETURN"]),
    quantity: integerInput
      .pipe(z.number().min(-100000).max(100000))
      .refine((v) => v !== 0),
    reason: z.string().trim().min(3).max(300),
  })
  .strict();
export async function moveInventory(ctx: Context, input: unknown) {
  authorize(ctx, "inventory:write");
  const data = movementSchema.parse(input);
  if (
    (["PURCHASE", "RETURN"].includes(data.kind) && data.quantity < 0) ||
    (data.kind === "DAMAGED" && data.quantity > 0)
  )
    throw new AppError(
      "MOVEMENT_SIGN",
      "El signo de la cantidad no corresponde al movimiento",
    );
  return serializable(async (tx) => {
    await branchScope(tx, ctx, data.branchId);
    requireFound(
      await tx.product.findFirst({
        where: { organizationId: ctx.organizationId, id: data.productId },
      }),
    );
    await tx.inventory.upsert({
      where: {
        organizationId_branchId_productId: {
          organizationId: ctx.organizationId,
          branchId: data.branchId,
          productId: data.productId,
        },
      },
      create: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        productId: data.productId,
        quantity: 0,
      },
      update: {},
    });
    const changed = await tx.inventory.updateMany({
      where: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        productId: data.productId,
        quantity: { gte: Math.max(0, -data.quantity) },
      },
      data: { quantity: { increment: data.quantity } },
    });
    if (changed.count !== 1)
      throw new AppError(
        "INSUFFICIENT_STOCK",
        "El movimiento dejaría stock negativo",
        409,
      );
    const movement = await tx.inventoryMovement.create({
      data: {
        organizationId: ctx.organizationId,
        ...data,
        createdById: ctx.staffId,
      },
    });
    await audit(tx, ctx, "inventory.moved", movement.id, {
      quantity: data.quantity,
    });
    return { id: movement.id };
  });
}
