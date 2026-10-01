import { z } from "zod";
import { serializable } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
export const setupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    branchName: z.string().trim().min(2).max(100),
    address: z.string().trim().max(240).default(""),
  })
  .strict();
export async function setupOrganization(userId: string, input: unknown) {
  const data = setupSchema.parse(input);
  return serializable(async (tx) => {
    if (await tx.staff.findUnique({ where: { userId } }))
      throw new AppError(
        "CONFLICT",
        "La cuenta ya tiene una organización",
        409,
      );
    const organization = await tx.organization.create({
      data: { name: data.name },
    });
    const branch = await tx.branch.create({
      data: {
        organizationId: organization.id,
        name: data.branchName,
        address: data.address,
      },
    });
    const staff = await tx.staff.create({
      data: {
        organizationId: organization.id,
        userId,
        branchId: branch.id,
        role: "OWNER",
      },
    });
    await tx.paymentMethod.createMany({
      data: ["Efectivo", "Transferencia", "Tarjeta", "Otro"].map((name) => ({
        organizationId: organization.id,
        name,
      })),
    });
    await tx.auditEvent.create({
      data: {
        organizationId: organization.id,
        actorId: staff.id,
        action: "organization.created",
        entityId: organization.id,
        detail: {},
      },
    });
    return { id: organization.id };
  });
}
