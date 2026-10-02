import { z } from "zod";
import { db, serializable } from "@/infrastructure/db";
import {
  authorize,
  authorizeBranch,
  type Context,
} from "@/modules/auth/permissions";
import { audit, branchScope } from "@/modules/transactions/service";
import { id, name, phoneNumber, memberEmail } from "@/shared/schemas";
import { AppError, requireFound } from "@/shared/errors";
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
  })
  .strict();
export async function saveMember(
  ctx: Context,
  input: unknown,
  memberId?: string,
) {
  authorize(ctx, "members:write");
  const data = memberSchema.parse(input);
  return serializable(async (tx) => {
    await branchScope(tx, ctx, data.branchId);
    if (memberId) {
      const previous = requireFound(
        await tx.member.findFirst({
          where: { organizationId: ctx.organizationId, id: memberId },
        }),
      );
      authorizeBranch(ctx, previous.branchId);
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
          data: { ...data, email: data.email || null },
        })
      : await tx.member.create({
          data: {
            ...data,
            email: data.email || null,
            organizationId: ctx.organizationId,
          },
        });
    await audit(
      tx,
      ctx,
      memberId ? "member.updated" : "member.created",
      member.id,
      { branchId: member.branchId, active: member.active },
    );
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
