import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { serializable } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, branchScope } from "@/modules/transactions/service";
import {
  name,
  id,
  amount,
  nonnegativeAmount,
  integerInput,
} from "@/shared/schemas";
import { money } from "@/shared/money";
import { AppError, requireFound } from "@/shared/errors";
const active = z.boolean().default(true);
export const catalogSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("organization"),
      name,
      duplicateScanSeconds: integerInput.pipe(z.number().min(5).max(300)),
    })
    .strict(),
  z
    .object({ kind: z.literal("service"), name, active, id: id.optional() })
    .strict(),
  z
    .object({
      kind: z.literal("payment-method"),
      name,
      active,
      id: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("expense-category"),
      name,
      active,
      id: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("branch"),
      name,
      address: z.string().max(240).default(""),
      active,
      id: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("plan"),
      name,
      description: z.string().max(1000).default(""),
      price: amount,
      durationMonths: integerInput.refine(
        (value) => [1, 3, 6].includes(value),
        "Selecciona 1, 3 o 6 meses",
      ),
      serviceIds: z.array(id).min(1).max(30),
      active,
      id: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("product"),
      name,
      sku: z.string().trim().min(1).max(60),
      barcode: z.string().max(100).optional(),
      description: z.string().max(1000).default(""),
      category: z.string().max(80).default(""),
      price: amount,
      cost: nonnegativeAmount,
      lowStock: integerInput.pipe(z.number().min(0).max(100000)),
      active,
      id: id.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("staff"),
      name,
      email: z.email(),
      password: z.string().min(12).max(128),
      branchId: id,
      role: z.enum(["ADMIN", "RECEPTIONIST", "TRAINER"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("staff-access"),
      id,
      role: z.enum(["ADMIN", "RECEPTIONIST", "TRAINER"]),
      branchId: id,
      active,
    })
    .strict(),
]);
export async function saveCatalog(ctx: Context, input: unknown) {
  const data = catalogSchema.parse(input);
  authorize(
    ctx,
    data.kind.startsWith("staff")
      ? "staff:write"
      : data.kind === "branch"
        ? "settings:write"
        : "catalog:write",
  );
  const password =
    data.kind === "staff" ? await hashPassword(data.password) : null;
  return serializable(async (tx) => {
    const organizationId = ctx.organizationId;
    let entityId: string;
    switch (data.kind) {
      case "organization": {
        authorize(ctx, "settings:write");
        await tx.organization.update({
          where: { id: organizationId },
          data: {
            name: data.name,
            duplicateScanSeconds: data.duplicateScanSeconds,
          },
        });
        entityId = organizationId;
        break;
      }
      case "service": {
        const values = { name: data.name, active: data.active };
        const result = data.id
          ? await tx.service.update({
              where: { organizationId_id: { organizationId, id: data.id } },
              data: values,
            })
          : await tx.service.create({ data: { organizationId, ...values } });
        entityId = result.id;
        break;
      }
      case "payment-method": {
        const values = { name: data.name, active: data.active };
        const result = data.id
          ? await tx.paymentMethod.update({
              where: { organizationId_id: { organizationId, id: data.id } },
              data: values,
            })
          : await tx.paymentMethod.create({
              data: { organizationId, ...values },
            });
        entityId = result.id;
        break;
      }
      case "expense-category": {
        const values = { name: data.name, active: data.active };
        const result = data.id
          ? await tx.expenseCategory.update({
              where: { organizationId_id: { organizationId, id: data.id } },
              data: values,
            })
          : await tx.expenseCategory.create({
              data: { organizationId, ...values },
            });
        entityId = result.id;
        break;
      }
      case "branch": {
        if (data.id === ctx.branchId && !data.active)
          throw new AppError(
            "ACTIVE_BRANCH",
            "No puedes deshabilitar tu propia sucursal",
          );
        const values = {
          name: data.name,
          address: data.address,
          active: data.active,
        };
        const result = data.id
          ? await tx.branch.update({
              where: { organizationId_id: { organizationId, id: data.id } },
              data: values,
            })
          : await tx.branch.create({ data: { organizationId, ...values } });
        entityId = result.id;
        break;
      }
      case "plan": {
        const serviceIds = [...new Set(data.serviceIds)];
        const count = await tx.service.count({
          where: { organizationId, id: { in: serviceIds }, active: true },
        });
        if (count !== serviceIds.length)
          throw new AppError(
            "INVALID_SERVICES",
            "Selecciona servicios activos de tu gimnasio",
          );
        const values = {
          name: data.name,
          description: data.description,
          price: money(data.price),
          durationMonths: data.durationMonths,
          durationDays: null,
          active: data.active,
        };
        const plan = data.id
          ? await tx.plan.update({
              where: { organizationId_id: { organizationId, id: data.id } },
              data: values,
            })
          : await tx.plan.create({ data: { organizationId, ...values } });
        await tx.planService.deleteMany({
          where: { organizationId, planId: plan.id },
        });
        await tx.planService.createMany({
          data: serviceIds.map((serviceId) => ({
            organizationId,
            planId: plan.id,
            serviceId,
          })),
        });
        entityId = plan.id;
        break;
      }
      case "product": {
        const values = {
          name: data.name,
          sku: data.sku,
          barcode: data.barcode || null,
          description: data.description,
          category: data.category,
          price: money(data.price),
          cost: money(data.cost),
          lowStock: data.lowStock,
          active: data.active,
        };
        const product = data.id
          ? await tx.product.update({
              where: { organizationId_id: { organizationId, id: data.id } },
              data: values,
            })
          : await tx.product.create({ data: { organizationId, ...values } });
        entityId = product.id;
        break;
      }
      case "staff": {
        await branchScope(tx, ctx, data.branchId);
        const userId = crypto.randomUUID();
        await tx.user.create({
          data: {
            id: userId,
            name: data.name,
            email: data.email.toLowerCase(),
            accounts: {
              create: {
                id: crypto.randomUUID(),
                accountId: userId,
                providerId: "credential",
                password,
              },
            },
          },
        });
        const staff = await tx.staff.create({
          data: {
            organizationId,
            userId,
            branchId: data.branchId,
            role: data.role,
          },
        });
        entityId = staff.id;
        break;
      }
      case "staff-access": {
        await branchScope(tx, ctx, data.branchId);
        const previous = requireFound(
          await tx.staff.findFirst({ where: { organizationId, id: data.id } }),
        );
        if (previous.role === "OWNER" || previous.id === ctx.staffId)
          throw new AppError(
            "OWNER_PROTECTED",
            "No se puede modificar el acceso del propietario",
          );
        await tx.staff.update({
          where: { organizationId_id: { organizationId, id: data.id } },
          data: {
            role: data.role,
            branchId: data.branchId,
            active: data.active,
          },
        });
        await tx.session.deleteMany({ where: { userId: previous.userId } });
        await audit(tx, ctx, "staff.access.changed", previous.id, {
          previousRole: previous.role,
          role: data.role,
          previousBranch: previous.branchId,
          branchId: data.branchId,
          previousActive: previous.active,
          active: data.active,
        });
        entityId = previous.id;
        break;
      }
    }
    const detail: Record<string, string | number | boolean> = {};
    if ("active" in data) detail.active = data.active;
    if ("price" in data) detail.price = data.price;
    if ("durationMonths" in data) detail.durationMonths = data.durationMonths;
    if ("serviceIds" in data) detail.serviceIds = data.serviceIds.join(",");
    if ("role" in data) detail.role = data.role;
    if ("branchId" in data) detail.branchId = data.branchId;
    if ("duplicateScanSeconds" in data)
      detail.duplicateScanSeconds = data.duplicateScanSeconds;
    await audit(tx, ctx, `catalog.${data.kind}.saved`, entityId, detail);
    return { id: entityId };
  });
}
