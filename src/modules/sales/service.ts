import { z } from "zod";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, financialOperation } from "@/modules/transactions/service";
import { amount, id, paymentFields } from "@/shared/schemas";
import { Decimal, money } from "@/shared/money";
import { AppError, requireFound } from "@/shared/errors";
export const saleSchema = z
  .object({
    ...paymentFields,
    lines: z
      .array(
        z
          .object({
            productId: id,
            quantity: z.number().int().min(1).max(10000),
            expectedPrice: amount,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export async function sellProducts(ctx: Context, input: unknown) {
  authorize(ctx, "payments:write");
  const data = saleSchema.parse(input);
  if (new Set(data.lines.map((l) => l.productId)).size !== data.lines.length)
    throw new AppError(
      "DUPLICATE_PRODUCT",
      "Agrupa las cantidades del mismo producto",
    );
  return financialOperation(ctx, data, "sale", async (tx, requestHash) => {
    const products = await tx.product.findMany({
      where: {
        organizationId: ctx.organizationId,
        id: { in: data.lines.map((l) => l.productId) },
        active: true,
      },
    });
    const lines = data.lines.map((line) => {
      const product = requireFound(
        products.find((p) => p.id === line.productId),
        "Producto no disponible",
      );
      if (!product.price.equals(money(line.expectedPrice)))
        throw new AppError(
          "PRICE_CHANGED",
          "Un precio cambió. Actualiza el carrito antes de cobrar.",
          409,
        );
      return {
        organizationId: ctx.organizationId,
        productId: product.id,
        name: product.name,
        quantity: line.quantity,
        unitPrice: product.price,
        total: product.price.mul(line.quantity),
      };
    });
    const total = lines.reduce((sum, l) => sum.plus(l.total), new Decimal(0));
    if (total.greaterThan("999999999999.99"))
      throw new AppError(
        "AMOUNT_LIMIT",
        "La venta supera el importe permitido",
      );
    const sale = await tx.sale.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        total,
        createdById: ctx.staffId,
      },
    });
    await tx.saleLine.createMany({
      data: lines.map((line) => ({ ...line, saleId: sale.id })),
    });
    for (const line of lines) {
      const changed = await tx.inventory.updateMany({
        where: {
          organizationId: ctx.organizationId,
          branchId: data.branchId,
          productId: line.productId,
          quantity: { gte: line.quantity },
        },
        data: { quantity: { decrement: line.quantity } },
      });
      if (changed.count !== 1)
        throw new AppError(
          "INSUFFICIENT_STOCK",
          `Stock insuficiente: ${line.name}`,
          409,
        );
      await tx.inventoryMovement.create({
        data: {
          organizationId: ctx.organizationId,
          branchId: data.branchId,
          productId: line.productId,
          kind: "SALE",
          quantity: -line.quantity,
          reason: "Venta de producto",
          saleId: sale.id,
          createdById: ctx.staffId,
        },
      });
    }
    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        kind: "PRODUCT_SALE",
        amount: total,
        saleId: sale.id,
        paymentMethodId: data.paymentMethodId,
        idempotencyKey: data.idempotencyKey,
        requestHash,
        createdById: ctx.staffId,
      },
    });
    await audit(tx, ctx, "sale.paid", sale.id, { receipt: entry.reference });
    return entry;
  });
}
