import { createHash } from "node:crypto";
import { z } from "zod";
import { db, serializable } from "@/infrastructure/db";
import { Prisma } from "@/generated/prisma/client";
import type { Context } from "@/modules/auth/permissions";
import { requirePlatformAdmin } from "./platform-auth";
import { AppError, requireFound } from "@/shared/errors";
import {
  amount,
  id,
  integerInput,
  name,
  nonnegativeAmount,
} from "@/shared/schemas";
import { saasRenewalWindow } from "./schedule";

export function billingOwner(ctx: Context) {
  if (ctx.role !== "OWNER")
    throw new AppError(
      "FORBIDDEN",
      "Solo el propietario administra la suscripción del gimnasio.",
      403,
    );
}
const submitSchema = z
  .object({
    planId: id,
    expectedPrice: amount,
    method: z.enum(["TRANSFER", "CASH"]),
    reference: z.string().trim().min(3).max(160),
    notes: z.string().trim().max(1000).default(""),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export async function submitSubscriptionPayment(ctx: Context, input: unknown) {
  billingOwner(ctx);
  const data = submitSchema.parse(input);
  const requestHash = createHash("sha256")
    .update(
      JSON.stringify({
        ...data,
        expectedPrice: new Prisma.Decimal(data.expectedPrice).toFixed(2),
      }),
    )
    .digest("hex");
  return serializable(async (tx) => {
    const previous = await tx.saaSPayment.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: ctx.organizationId,
          idempotencyKey: data.idempotencyKey,
        },
      },
    });
    if (previous) {
      if (previous.requestHash !== requestHash)
        throw new AppError(
          "CONFLICT",
          "La referencia de solicitud ya se utilizó con otros datos.",
          409,
        );
      return {
        id: previous.id,
        message:
          "Pago registrado para revisión. Todavía no activa la suscripción.",
      };
    }
    const settings = await tx.saaSBillingSettings.findUniqueOrThrow({
      where: { id: "main" },
    });
    if (!settings.paymentInstructions.trim())
      throw new AppError(
        "BILLING_SETUP",
        "MANCAR todavía debe publicar las instrucciones de pago.",
        409,
      );
    const plan = requireFound(
      await tx.saaSPlan.findFirst({
        where: {
          id: data.planId,
          active: true,
          durationMonths: { in: [1, 3, 6] },
        },
      }),
    );
    if (!plan.price.equals(data.expectedPrice))
      throw new AppError(
        "PRICE_CHANGED",
        "El precio cambió. Actualiza la página antes de informar el pago.",
        409,
      );
    if (
      await tx.saaSPayment.findFirst({
        where: { organizationId: ctx.organizationId, status: "PENDING" },
      })
    )
      throw new AppError(
        "PENDING_PAYMENT",
        "Ya tienes un pago pendiente de revisión.",
        409,
      );
    const payment = await tx.saaSPayment.create({
      data: {
        organizationId: ctx.organizationId,
        planId: plan.id,
        planName: plan.name,
        amount: plan.price,
        durationMonths: plan.durationMonths,
        method: data.method,
        reference: data.reference,
        notes: data.notes,
        idempotencyKey: data.idempotencyKey,
        requestHash,
        submittedBy: ctx.userId,
      },
    });
    await tx.platformAudit.create({
      data: {
        actorUserId: ctx.userId,
        action: "subscription.payment.submitted",
        entityId: payment.id,
        detail: { organizationId: ctx.organizationId },
      },
    });
    return {
      id: payment.id,
      message:
        "Pago registrado para revisión. Todavía no activa la suscripción.",
    };
  });
}
const reviewSchema = z
  .object({
    paymentId: id,
    decision: z.enum(["APPROVE", "REJECT"]),
    note: z.string().trim().min(3).max(1000),
    verifiedReference: z
      .string()
      .trim()
      .max(160)
      .transform((v) => v.toUpperCase())
      .default(""),
    fundsReceived: z.boolean().optional(),
  })
  .strict();
export async function reviewSubscriptionPayment(
  userId: string,
  input: unknown,
) {
  await requirePlatformAdmin(userId);
  const data = reviewSchema.parse(input);
  if (
    data.decision === "APPROVE" &&
    (data.fundsReceived !== true || data.verifiedReference.length < 3)
  )
    throw new AppError(
      "VERIFICATION_REQUIRED",
      "Confirma que recibiste el dinero e indica la referencia bancaria verificada.",
      422,
    );
  return serializable(async (tx) => {
    // Recheck admin permission inside the transaction so revocation cannot race a review.
    if (!(await tx.platformAdmin.findUnique({ where: { userId } }))?.active)
      throw new AppError(
        "FORBIDDEN",
        "Acceso de plataforma deshabilitado.",
        403,
      );
    const payment = requireFound(
      await tx.saaSPayment.findUnique({ where: { id: data.paymentId } }),
    );
    if (payment.status !== "PENDING") {
      if (
        payment.status === "APPROVED" &&
        data.decision === "APPROVE" &&
        payment.verifiedReference === data.verifiedReference
      )
        return {
          id: payment.id,
          message:
            "El pago ya estaba aprobado; no se amplió nuevamente la suscripción.",
        };
      if (payment.status === "REJECTED" && data.decision === "REJECT")
        return { id: payment.id, message: "El pago ya estaba rechazado." };
      throw new AppError("INVALID_STATE", "Este pago ya fue revisado.", 409);
    }
    let period: { periodStart: Date; periodEnd: Date } | undefined;
    if (data.decision === "APPROVE") {
      const subscription = requireFound(
        await tx.saaSSubscription.findUnique({
          where: { organizationId: payment.organizationId },
        }),
      );
      if (
        await tx.saaSPayment.findUnique({
          where: { verifiedReference: data.verifiedReference },
        })
      )
        throw new AppError(
          "DUPLICATE_RECEIPT",
          "Ese movimiento bancario ya respaldó otro pago.",
          409,
        );
      period = saasRenewalWindow(
        payment.durationMonths,
        subscription.paidUntil,
      );
      const settings = await tx.saaSBillingSettings.findUniqueOrThrow({
        where: { id: "main" },
      });
      await tx.saaSSubscription.update({
        where: { organizationId: payment.organizationId },
        data: {
          paidUntil: period.periodEnd,
          planId: payment.planId,
          graceDays: settings.graceDays,
        },
      });
    }
    await tx.saaSPayment.update({
      where: { id: payment.id },
      data: {
        status: data.decision === "APPROVE" ? "APPROVED" : "REJECTED",
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNote: data.note,
        verifiedReference:
          data.decision === "APPROVE" ? data.verifiedReference : null,
        ...period,
      },
    });
    await tx.platformAudit.create({
      data: {
        actorUserId: userId,
        action:
          data.decision === "APPROVE"
            ? "subscription.payment.approved"
            : "subscription.payment.rejected",
        entityId: payment.id,
        detail: {
          organizationId: payment.organizationId,
          amount: payment.amount.toFixed(2),
          note: data.note,
        },
      },
    });
    return {
      id: payment.id,
      message:
        data.decision === "APPROVE"
          ? "Pago aprobado. Acceso habilitado y período actualizado."
          : "Pago rechazado. La suscripción no se amplió.",
    };
  });
}
export async function saveSaaSPlan(userId: string, input: unknown) {
  await requirePlatformAdmin(userId);
  const data = z
    .object({
      id: id.optional(),
      name,
      price: nonnegativeAmount,
      durationMonths: integerInput.pipe(
        z.union([z.literal(1), z.literal(3), z.literal(6)]),
      ),
      active: z.boolean(),
    })
    .strict()
    .parse(input);
  const price = new Prisma.Decimal(data.price);
  if (data.active && price.lte(0))
    throw new AppError(
      "VALIDATION",
      "Un plan habilitado debe tener un precio mayor que cero.",
      422,
    );
  return serializable(async (tx) => {
    if (!(await tx.platformAdmin.findUnique({ where: { userId } }))?.active)
      throw new AppError(
        "FORBIDDEN",
        "Acceso de plataforma deshabilitado.",
        403,
      );
    const plan = data.id
      ? await tx.saaSPlan.update({
          where: { id: data.id },
          data: {
            name: data.name,
            price,
            durationMonths: data.durationMonths,
            active: data.active,
          },
        })
      : await tx.saaSPlan.create({
          data: {
            name: data.name,
            price,
            durationMonths: data.durationMonths,
            active: data.active,
          },
        });
    await tx.platformAudit.create({
      data: {
        actorUserId: userId,
        action: "subscription.plan.saved",
        entityId: plan.id,
        detail: { price: price.toFixed(2), active: data.active },
      },
    });
    return {
      id: plan.id,
      message:
        "Plan guardado. Los pagos ya informados conservan su precio y duración.",
    };
  });
}
export async function saveBillingSettings(userId: string, input: unknown) {
  await requirePlatformAdmin(userId);
  const data = z
    .object({
      graceDays: integerInput.pipe(z.literal(1)),
      paymentInstructions: z.string().trim().max(2000),
    })
    .strict()
    .parse(input);
  return serializable(async (tx) => {
    if (!(await tx.platformAdmin.findUnique({ where: { userId } }))?.active)
      throw new AppError(
        "FORBIDDEN",
        "Acceso de plataforma deshabilitado.",
        403,
      );
    await tx.saaSBillingSettings.update({
      where: { id: "main" },
      data: { ...data, trialDays: 0 },
    });
    await tx.platformAudit.create({
      data: {
        actorUserId: userId,
        action: "subscription.settings.saved",
        entityId: "main",
        detail: { graceDays: data.graceDays },
      },
    });
    return {
      message:
        "Instrucciones actualizadas. Se mantiene un día de gracia y no se ofrecen pruebas gratuitas.",
    };
  });
}
export async function ownerBilling(ctx: Context, page = 1) {
  billingOwner(ctx);
  const currentPage = z.number().int().min(1).max(10000).parse(page);
  const [
    subscription,
    plans,
    settings,
    payments,
    totalPayments,
    pendingPayments,
  ] = await Promise.all([
    db.saaSSubscription.findUnique({
      where: { organizationId: ctx.organizationId },
      include: { plan: true },
    }),
    db.saaSPlan.findMany({
      where: { active: true, durationMonths: { in: [1, 3, 6] } },
      orderBy: { price: "asc" },
      take: 30,
    }),
    db.saaSBillingSettings.findUniqueOrThrow({ where: { id: "main" } }),
    db.saaSPayment.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      skip: (currentPage - 1) * 12,
    }),
    db.saaSPayment.count({ where: { organizationId: ctx.organizationId } }),
    db.saaSPayment.count({
      where: { organizationId: ctx.organizationId, status: "PENDING" },
    }),
  ]);
  return {
    subscription,
    plans,
    settings,
    payments,
    totalPayments,
    pendingPayments,
  };
}
