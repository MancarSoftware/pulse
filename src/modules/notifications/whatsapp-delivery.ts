import { db, serializable } from "@/infrastructure/db";
import { ecuadorWhatsAppPhone, membershipMessage } from "./whatsapp-content";
import {
  MetaWhatsAppProvider,
  whatsAppConfig,
  WhatsAppFailure,
  type WhatsAppConfig,
  type WhatsAppProvider,
} from "./whatsapp-provider";

export async function dispatchWhatsApp(
  config: WhatsAppConfig | null = whatsAppConfig(),
  provider?: WhatsAppProvider,
  limit = 10,
) {
  if (!config) return { configured: false, processed: 0 };
  const sender = provider ?? new MetaWhatsAppProvider(config);
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  // A crash after starting an external send cannot be retried safely without checking Meta.
  await db.whatsAppMessage.updateMany({
    where: {
      organizationId: config.organizationId,
      status: "PROCESSING",
      processingAt: { lt: stale },
      sendingAt: { not: null },
    },
    data: {
      status: "REVIEW",
      lastError:
        "Envío interrumpido sin confirmación. Revisa WhatsApp antes de reenviar.",
    },
  });
  await db.whatsAppMessage.updateMany({
    where: {
      organizationId: config.organizationId,
      status: "PROCESSING",
      processingAt: { lt: stale },
      sendingAt: null,
    },
    data: { status: "PENDING", processingAt: null },
  });
  let processed = 0;
  while (processed < limit) {
    const job = await serializable(async (tx) => {
      const candidate = await tx.whatsAppMessage.findFirst({
        where: {
          organizationId: config.organizationId,
          status: "PENDING",
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) return null;
      const claim = await tx.whatsAppMessage.updateMany({
        where: { id: candidate.id, status: "PENDING" },
        data: {
          status: "PROCESSING",
          processingAt: new Date(),
          sendingAt: null,
          attempts: { increment: 1 },
        },
      });
      return claim.count
        ? { ...candidate, attempts: candidate.attempts + 1 }
        : null;
    });
    if (!job) break;
    processed++;
    try {
      const current = await db.whatsAppMessage.findUniqueOrThrow({
        where: { id: job.id },
        include: {
          member: { include: { organization: true } },
          membership: true,
        },
      });
      const recipient = ecuadorWhatsAppPhone(current.member.phone);
      if (
        !current.member.active ||
        !current.member.whatsappConsentAt ||
        !recipient ||
        current.membership.state === "CANCELLED" ||
        current.membership.endAt <= new Date()
      ) {
        await db.whatsAppMessage.update({
          where: { id: job.id },
          data: {
            status: "CANCELLED",
            lastError:
              "No hay autorización, teléfono móvil válido o membresía disponible.",
          },
        });
        continue;
      }
      if (current.membership.state === "FROZEN") {
        await db.whatsAppMessage.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            processingAt: null,
            attempts: { decrement: 1 },
            nextAttemptAt: new Date(Date.now() + 3600000),
          },
        });
        continue;
      }
      const mediaId = await sender.uploadQr(current.member.credential);
      // Recheck consent and cancellation after the media upload, before initiating contact.
      const eligible = await db.whatsAppMessage.findFirst({
        where: {
          id: job.id,
          status: "PROCESSING",
          member: {
            active: true,
            phone: current.member.phone,
            whatsappConsentAt: { not: null },
          },
          membership: { state: "VALID", endAt: { gt: new Date() } },
        },
        include: {
          member: { include: { organization: true } },
          membership: true,
        },
      });
      if (!eligible) {
        await db.whatsAppMessage.update({
          where: { id: job.id },
          data: {
            status: "CANCELLED",
            lastError: "Autorización o membresía cambió antes del envío.",
          },
        });
        continue;
      }
      const content = membershipMessage({
        kind: job.kind,
        firstName: eligible.member.firstName,
        organizationName: eligible.member.organization.name,
        planName: eligible.membership.planName,
        startAt: eligible.membership.startAt,
        endAt: eligible.membership.endAt,
        services: eligible.membership.serviceNames,
      });
      await db.whatsAppMessage.update({
        where: { id: job.id },
        data: { sendingAt: new Date() },
      });
      const providerMessageId = await sender.sendTemplate({
        recipient,
        kind: job.kind,
        mediaId,
        parameters: content.parameters,
      });
      await db.whatsAppMessage.update({
        where: { id: job.id },
        data: {
          status: "ACCEPTED",
          providerMessageId,
          acceptedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      // Unknown failures after calling Meta may already have delivered a message.
      const state = await db.whatsAppMessage.findUnique({
        where: { id: job.id },
      });
      if (!state || state.status !== "PROCESSING") continue;
      const disposition =
        error instanceof WhatsAppFailure
          ? error.disposition
          : state?.sendingAt
            ? "review"
            : "retry";
      await db.whatsAppMessage.update({
        where: { id: job.id },
        data: {
          status:
            disposition === "review"
              ? "REVIEW"
              : disposition === "failed" || job.attempts >= 5
                ? "FAILED"
                : "PENDING",
          processingAt: null,
          sendingAt: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(3600, 30 * 2 ** job.attempts) * 1000,
          ),
          lastError:
            error instanceof WhatsAppFailure
              ? error.message
              : "No se pudo procesar la notificación. Revisa el estado antes de reenviar.",
        },
      });
    }
  }
  return { configured: true, processed };
}
