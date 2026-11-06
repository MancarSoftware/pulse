import { z } from "zod";
import { db, serializable } from "@/infrastructure/db";
import {
  authorize,
  authorizeBranch,
  type Context,
} from "@/modules/auth/permissions";
import { audit, branchScope } from "@/modules/transactions/service";
import { id, name, phoneNumber, memberEmail } from "@/shared/schemas";
import { AppError, DuplicateMemberError, requireFound } from "@/shared/errors";
export const memberSchema = z
  .object({
    firstName: name,
    lastName: name,
    phone: phoneNumber,
    email: memberEmail,
    branchId: id,
    notes: z.string().max(2000).default(""),
    emergencyContact: z.string().max(200).optional(),
    active: z.boolean().default(true),
    whatsappOptIn: z.boolean().optional(),
    duplicateConfirmed: z.boolean().default(false),
  })
  .strict();
export async function saveMember(
  ctx: Context,
  input: unknown,
  memberId?: string,
) {
  authorize(ctx, "members:write");
  const data = memberSchema.parse(input);
  const { whatsappOptIn, duplicateConfirmed, ...values } = data;
  values.email = values.email?.toLowerCase();
  return serializable(async (tx) => {
    await branchScope(tx, ctx, data.branchId);
    const previousMember = memberId
      ? requireFound(
          await tx.member.findFirst({
            where: { organizationId: ctx.organizationId, id: memberId },
          }),
        )
      : null;
    if (previousMember) authorizeBranch(ctx, previousMember.branchId);
    const identityChanged =
      !previousMember ||
      previousMember.phone !== data.phone ||
      (previousMember.email ?? "").toLowerCase() !== (values.email ?? "") ||
      previousMember.firstName !== data.firstName ||
      previousMember.lastName !== data.lastName;
    if (identityChanged && !duplicateConfirmed) {
      const matches = await tx.member.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(memberId ? { id: { not: memberId } } : {}),
          OR: [
            { phone: data.phone },
            ...(values.email
              ? [
                  {
                    email: {
                      equals: values.email,
                      mode: "insensitive" as const,
                    },
                  },
                ]
              : []),
            {
              firstName: { equals: data.firstName, mode: "insensitive" },
              lastName: { equals: data.lastName, mode: "insensitive" },
            },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          branchId: true,
          active: true,
        },
        take: 20,
      });
      if (matches.length)
        throw new DuplicateMemberError(
          matches
            .filter(
              (match) =>
                ["OWNER", "ADMIN"].includes(ctx.role) ||
                match.branchId === ctx.branchId,
            )
            .slice(0, 5)
            .map((match) => ({
              id: match.id,
              name: `${match.firstName} ${match.lastName}`,
              active: match.active,
            })),
        );
    }
    let consentAt: Date | null = whatsappOptIn ? new Date() : null;
    if (previousMember) {
      const previous = previousMember;
      consentAt =
        previous.phone !== data.phone || whatsappOptIn === false
          ? null
          : (previous.whatsappConsentAt ?? (whatsappOptIn ? new Date() : null));
      if (
        previous.branchId !== data.branchId &&
        (await tx.membership.count({
          where: {
            organizationId: ctx.organizationId,
            memberId,
            OR: [
              { state: "FROZEN" },
              { state: "VALID", endAt: { gt: new Date() } },
            ],
          },
        }))
      )
        throw new AppError(
          "ACTIVE_MEMBERSHIP",
          "No cambies la sucursal mientras existan contratos vigentes o congelados",
        );
    }
    const member = memberId
      ? await tx.member.update({
          where: {
            organizationId_id: {
              organizationId: ctx.organizationId,
              id: memberId,
            },
          },
          data: {
            ...values,
            whatsappConsentAt: consentAt,
            email: values.email || null,
          },
        })
      : await tx.member.create({
          data: {
            ...values,
            whatsappConsentAt: consentAt,
            email: values.email || null,
            organizationId: ctx.organizationId,
          },
        });
    await audit(
      tx,
      ctx,
      memberId ? "member.updated" : "member.created",
      member.id,
      {
        branchId: member.branchId,
        active: member.active,
        whatsappConsent: Boolean(member.whatsappConsentAt),
        duplicateConfirmed,
      },
    );
    if (!member.whatsappConsentAt)
      await tx.whatsAppMessage.updateMany({
        where: {
          organizationId: ctx.organizationId,
          memberId: member.id,
          status: { in: ["PENDING", "PROCESSING"] },
          sendingAt: null,
        },
        data: {
          status: "CANCELLED",
          lastError: "El socio no autorizó mensajes por WhatsApp.",
        },
      });
    return { id: member.id };
  });
}
export async function getMember(ctx: Context, memberId: string) {
  authorize(ctx, "members:read");
  if (ctx.role === "TRAINER")
    throw new AppError(
      "FORBIDDEN",
      "El rol entrenador solo permite el listado básico",
      403,
    );
  const member = requireFound(
    await db.member.findFirst({
      where: {
        organizationId: ctx.organizationId,
        id: memberId,
        ...(["OWNER", "ADMIN"].includes(ctx.role)
          ? {}
          : { branchId: ctx.branchId }),
      },
      include: {
        whatsappMessages: { orderBy: { createdAt: "desc" }, take: 10 },
        memberships: { orderBy: { endAt: "desc" }, take: 50 },
        checkIns: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { service: true },
        },
      },
    }),
  );
  return member;
}
