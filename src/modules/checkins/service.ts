import { z } from "zod";
import { serializable } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import {
  branchScope,
  audit,
  financialOperation,
} from "@/modules/transactions/service";
import { id, amount, paymentFields } from "@/shared/schemas";
import { AppError, requireFound } from "@/shared/errors";
import { money } from "@/shared/money";
import { remainingDays } from "@/shared/dates";
export const checkInSchema = z
  .object({
    branchId: id,
    serviceId: id,
    memberId: id.optional(),
    credential: z.string().uuid().optional(),
  })
  .strict()
  .refine((d) => Boolean(d.memberId) !== Boolean(d.credential));
export async function checkIn(ctx: Context, input: unknown) {
  authorize(ctx, "checkins:write");
  const data = checkInSchema.parse(input);
  return serializable(async (tx) => {
    await branchScope(tx, ctx, data.branchId);
    const member = requireFound(
      await tx.member.findFirst({
        where: {
          organizationId: ctx.organizationId,
          ...(data.credential
            ? { credential: data.credential }
            : { id: data.memberId }),
          branchId: data.branchId,
          active: true,
        },
      }),
      "Credencial o socio no disponible en esta sucursal",
    );
    requireFound(
      await tx.service.findFirst({
        where: {
          organizationId: ctx.organizationId,
          id: data.serviceId,
          active: true,
        },
      }),
    );
    const now = new Date();
    const membership = await tx.membership.findFirst({
      where: {
        organizationId: ctx.organizationId,
        memberId: member.id,
        branchId: data.branchId,
        state: "VALID",
        startAt: { lte: now },
        endAt: { gt: now },
        serviceIds: { has: data.serviceId },
      },
      orderBy: { endAt: "desc" },
    });
    if (!membership)
      throw new AppError(
        "ACCESS_DENIED",
        "Acceso denegado: no existe una membresía vigente para este servicio y sucursal",
        403,
      );
    const organization = requireFound(
      await tx.organization.findUnique({ where: { id: ctx.organizationId } }),
    );
    const duplicate = await tx.checkIn.findFirst({
      where: {
        organizationId: ctx.organizationId,
        memberId: member.id,
        createdAt: {
          gt: new Date(
            now.getTime() - organization.duplicateScanSeconds * 1000,
          ),
        },
      },
    });
    if (duplicate)
      throw new AppError(
        "DUPLICATE_SCAN",
        "El ingreso ya fue registrado hace unos instantes",
        409,
      );
    const attendance = await tx.checkIn.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        serviceId: data.serviceId,
        memberId: member.id,
        createdById: ctx.staffId,
      },
    });
    return {
      id: attendance.id,
      message: `Acceso permitido · ${member.firstName} ${member.lastName}`,
      remainingDays: remainingDays(membership.endAt),
      services: membership.serviceNames,
    };
  });
}
export const dayPassSchema = z
  .object({ ...paymentFields, serviceId: id, amount })
  .strict();
export async function sellDayPass(ctx: Context, input: unknown) {
  authorize(ctx, "payments:write");
  const data = dayPassSchema.parse(input);
  return financialOperation(ctx, data, "day-pass", async (tx, requestHash) => {
    requireFound(
      await tx.service.findFirst({
        where: {
          organizationId: ctx.organizationId,
          id: data.serviceId,
          active: true,
        },
      }),
    );
    const pass = await tx.dayPass.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        serviceId: data.serviceId,
        amount: money(data.amount),
        createdById: ctx.staffId,
      },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        kind: "DAY_PASS",
        amount: pass.amount,
        dayPassId: pass.id,
        paymentMethodId: data.paymentMethodId,
        idempotencyKey: data.idempotencyKey,
        requestHash,
        createdById: ctx.staffId,
      },
    });
    await audit(tx, ctx, "day-pass.paid", pass.id);
    return entry;
  });
}
