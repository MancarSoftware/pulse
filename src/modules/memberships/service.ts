import { z } from "zod";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, financialOperation } from "@/modules/transactions/service";
import { amount, id, paymentFields } from "@/shared/schemas";
import { money } from "@/shared/money";
import { renewalWindow } from "@/shared/dates";
import { AppError, requireFound } from "@/shared/errors";
import { serializable } from "@/infrastructure/db";
import { branchScope } from "@/modules/transactions/service";
import { dayStart, localDate, addDays } from "@/shared/dates";
import { ecuadorWhatsAppPhone } from "@/modules/notifications/whatsapp-content";
export const renewalSchema = z
  .object({
    ...paymentFields,
    memberId: id,
    planId: id,
    expectedPrice: amount,
    expectedLatestId: z.string().max(100).nullable(),
  })
  .strict();
export async function renewMembership(ctx: Context, input: unknown) {
  authorize(ctx, "payments:write");
  const data = renewalSchema.parse(input);
  return financialOperation(ctx, data, "renewal", async (tx, requestHash) => {
    const member = requireFound(
      await tx.member.findFirst({
        where: {
          id: data.memberId,
          organizationId: ctx.organizationId,
          active: true,
          branchId: data.branchId,
        },
      }),
      "Socio no disponible en esta sucursal",
    );
    const plan = requireFound(
      await tx.plan.findFirst({
        where: {
          organizationId: ctx.organizationId,
          id: data.planId,
          active: true,
        },
        include: { services: { include: { service: true } } },
      }),
      "Plan no disponible",
    );
    if (!plan.price.equals(money(data.expectedPrice)))
      throw new AppError(
        "PRICE_CHANGED",
        "El precio cambió. Revisa el plan y confirma de nuevo.",
        409,
      );
    if (plan.durationMonths === null)
      throw new AppError(
        "INVALID_PLAN",
        "Configura una duración de 1, 3 o 6 meses para este plan",
      );
    if (!plan.services.length || plan.services.some((s) => !s.service.active))
      throw new AppError(
        "INVALID_PLAN",
        "El plan contiene servicios deshabilitados",
      );
    const latest = await tx.membership.findFirst({
      where: {
        organizationId: ctx.organizationId,
        memberId: member.id,
        state: { not: "CANCELLED" },
      },
      orderBy: { endAt: "desc" },
    });
    if ((latest?.id ?? null) !== data.expectedLatestId)
      throw new AppError(
        "MEMBERSHIP_CHANGED",
        "La membresía cambió. Actualiza antes de cobrar.",
        409,
      );
    if (latest?.state === "FROZEN")
      throw new AppError("FROZEN", "Reactiva la membresía antes de renovar");
    const previousContracts = await tx.membership.count({
      where: { organizationId: ctx.organizationId, memberId: member.id },
    });
    const membership = await tx.membership.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        memberId: member.id,
        planId: plan.id,
        planName: plan.name,
        durationMonths: plan.durationMonths,
        amount: plan.price,
        serviceIds: plan.services.map((s) => s.serviceId),
        serviceNames: plan.services.map((s) => s.service.name),
        ...renewalWindow(plan.durationMonths, latest?.endAt ?? null),
        createdById: ctx.staffId,
      },
    });
    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: ctx.organizationId,
        branchId: data.branchId,
        kind: "MEMBERSHIP_PAYMENT",
        amount: plan.price,
        membershipId: membership.id,
        paymentMethodId: data.paymentMethodId,
        idempotencyKey: data.idempotencyKey,
        requestHash,
        createdById: ctx.staffId,
      },
    });
    await audit(tx, ctx, "membership.paid", membership.id, {
      receipt: entry.reference,
    });
    if (member.whatsappConsentAt && ecuadorWhatsAppPhone(member.phone)) {
      await tx.whatsAppMessage.create({
        data: {
          organizationId: ctx.organizationId,
          memberId: member.id,
          membershipId: membership.id,
          kind: previousContracts ? "RENEWAL" : "WELCOME",
        },
      });
    }
    return entry;
  });
}
export async function changeMembershipState(ctx: Context, input: unknown) {
  authorize(ctx, "catalog:write");
  const data = z
    .object({
      memberId: id,
      action: z.enum(["freeze", "resume"]),
      reason: z.string().trim().min(3).max(300),
    })
    .strict()
    .parse(input);
  return serializable(async (tx) => {
    const member = requireFound(
      await tx.member.findFirst({
        where: { organizationId: ctx.organizationId, id: data.memberId },
      }),
    );
    await branchScope(tx, ctx, member.branchId);
    const today = dayStart(localDate());
    const now = new Date();
    const memberships = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        memberId: member.id,
        ...(data.action === "freeze"
          ? { state: "VALID", endAt: { gt: now } }
          : { state: "FROZEN" }),
      },
      orderBy: { startAt: "asc" },
    });
    if (!memberships.length)
      throw new AppError(
        "INVALID_STATE",
        "No hay membresías que permitan esta operación",
      );
    for (const membership of memberships) {
      if (data.action === "freeze")
        await tx.membership.update({
          where: {
            organizationId_id: {
              organizationId: ctx.organizationId,
              id: membership.id,
            },
          },
          data: { state: "FROZEN", frozenAt: today },
        });
      else {
        if (!membership.frozenAt)
          throw new AppError(
            "INVALID_STATE",
            "La congelación no tiene fecha de inicio",
          );
        const days = Math.max(
          0,
          Math.round(
            (today.getTime() - membership.frozenAt.getTime()) / 86400000,
          ),
        );
        await tx.membership.update({
          where: {
            organizationId_id: {
              organizationId: ctx.organizationId,
              id: membership.id,
            },
          },
          data: {
            state: "VALID",
            frozenAt: null,
            endAt: addDays(membership.endAt, days),
            ...(membership.startAt >= membership.frozenAt
              ? { startAt: addDays(membership.startAt, days) }
              : {}),
          },
        });
      }
    }
    await audit(tx, ctx, `membership.${data.action}`, member.id, {
      reason: data.reason,
      contracts: memberships.length,
    });
    return { id: member.id };
  });
}
