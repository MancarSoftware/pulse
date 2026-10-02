import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { serializable } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit } from "@/modules/transactions/service";
import { id } from "@/shared/schemas";
import { AppError } from "@/shared/errors";
export const deletionSchema = z
  .object({
    kind: z.enum([
      "service",
      "plan",
      "payment-method",
      "expense-category",
      "branch",
      "product",
    ]),
    id,
  })
  .strict();
export async function deleteCatalog(ctx: Context, input: unknown) {
  const data = deletionSchema.parse(input);
  authorize(
    ctx,
    data.kind === "branch"
      ? "settings:write"
      : data.kind === "product"
        ? "inventory:write"
        : "catalog:write",
  );
  if (data.kind === "branch" && data.id === ctx.branchId)
    throw new AppError(
      "ACTIVE_BRANCH",
      "No puedes eliminar tu propia sucursal. Puedes editar sus datos.",
      409,
    );
  try {
    return await serializable(async (tx) => {
      const where = { organizationId: ctx.organizationId, id: data.id };
      let count = 0;
      switch (data.kind) {
        case "service":
          if (
            await tx.membership.count({
              where: {
                organizationId: ctx.organizationId,
                serviceIds: { has: data.id },
              },
            })
          )
            throw new AppError(
              "IN_USE",
              "El servicio está incluido en membresías. Deshabilítalo desde Editar para conservar el historial.",
              409,
            );
          count = (await tx.service.deleteMany({ where })).count;
          break;
        case "plan":
          await tx.planService.deleteMany({
            where: { organizationId: ctx.organizationId, planId: data.id },
          });
          count = (await tx.plan.deleteMany({ where })).count;
          break;
        case "payment-method":
          count = (await tx.paymentMethod.deleteMany({ where })).count;
          break;
        case "expense-category":
          count = (await tx.expenseCategory.deleteMany({ where })).count;
          break;
        case "branch":
          count = (await tx.branch.deleteMany({ where })).count;
          break;
        case "product":
          count = (await tx.product.deleteMany({ where })).count;
          break;
      }
      if (!count)
        throw new AppError("NOT_FOUND", "Registro no disponible", 404);
      await audit(tx, ctx, `catalog.${data.kind}.deleted`, data.id);
      return { id: data.id, message: "Registro eliminado" };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    )
      throw new AppError(
        "IN_USE",
        "Este registro ya está en uso. Deshabilítalo desde Editar para conservar el historial.",
        409,
      );
    throw error;
  }
}
