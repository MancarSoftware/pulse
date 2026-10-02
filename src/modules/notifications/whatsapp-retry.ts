import { z } from "zod";
import { serializable } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit, branchScope } from "@/modules/transactions/service";
import { id } from "@/shared/schemas";
import { AppError, requireFound } from "@/shared/errors";
export async function retryWhatsApp(ctx: Context, input: unknown) {
  authorize(ctx, "payments:write");
  const data = z
    .object({ messageId: id, verifiedNotSent: z.boolean().optional() })
    .strict()
    .parse(input);
  return serializable(async (tx) => {
    const message = requireFound(
      await tx.whatsAppMessage.findFirst({
        where: { id: data.messageId, organizationId: ctx.organizationId },
        include: { member: true, membership: true },
      }),
    );
    await branchScope(tx, ctx, message.member.branchId);
    if (
      message.status !== "FAILED" &&
      !(message.status === "REVIEW" && data.verifiedNotSent === true)
    )
      throw new AppError(
        "INVALID_STATE",
        "Solo se pueden reintentar envíos fallidos. Los envíos sin confirmación requieren revisión.",
        409,
      );
    if (
      !message.member.whatsappConsentAt ||
      !message.member.active ||
      message.membership.state !== "VALID" ||
      message.membership.endAt <= new Date()
    )
      throw new AppError(
        "INELIGIBLE",
        "Confirma la autorización y la membresía antes de reenviar.",
      );
    await tx.whatsAppMessage.update({
      where: { id: message.id },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        processingAt: null,
        sendingAt: null,
        lastError: null,
      },
    });
    await audit(tx, ctx, "whatsapp.retry.requested", message.id, {
      verifiedNotSent: data.verifiedNotSent === true,
    });
    return { id: message.id, message: "Mensaje en cola para reintentar" };
  });
}
