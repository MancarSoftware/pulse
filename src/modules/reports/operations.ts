import { db } from "@/infrastructure/db";
import { Prisma } from "@/generated/prisma/client";
import { authorize, type Context } from "@/modules/auth/permissions";
import { queryScope, reportWindow, type Search } from "./queries";
import { addDays, dayStart, localDate } from "@/shared/dates";
export async function operationalReport(ctx: Context, search: Search) {
  authorize(ctx, "reports:read");
  const scope = queryScope(ctx, search);
  const window = reportWindow(search);
  const now = new Date();
  const branchSql = scope.branchId
    ? Prisma.sql`AND m."branchId" = ${scope.branchId}`
    : Prisma.empty;
  const attendanceBranch = scope.branchId
    ? Prisma.sql`AND "branchId" = ${scope.branchId}`
    : Prisma.empty;
  const [
    active,
    expiring,
    expired,
    frozen,
    distribution,
    contracts,
    attendanceDays,
    hours,
    passes,
  ] = await Promise.all([
    db.member.count({
      where: {
        ...scope,
        active: true,
        memberships: {
          some: { state: "VALID", startAt: { lte: now }, endAt: { gt: now } },
        },
      },
    }),
    db.member.count({
      where: {
        ...scope,
        active: true,
        memberships: {
          some: {
            state: "VALID",
            endAt: { gt: now, lte: addDays(dayStart(localDate(now)), 8) },
          },
          none: {
            state: "VALID",
            endAt: { gt: addDays(dayStart(localDate(now)), 8) },
          },
        },
      },
    }),
    db.member.count({
      where: {
        ...scope,
        memberships: {
          some: { state: "VALID", endAt: { lte: now } },
          none: {
            OR: [{ state: "VALID", endAt: { gt: now } }, { state: "FROZEN" }],
          },
        },
      },
    }),
    db.member.count({
      where: { ...scope, memberships: { some: { state: "FROZEN" } } },
    }),
    db.membership.groupBy({
      by: ["planName"],
      where: {
        ...scope,
        state: "VALID",
        startAt: { lte: now },
        endAt: { gt: now },
      },
      _count: true,
      orderBy: { _count: { planName: "desc" } },
      take: 100,
    }),
    db.$queryRaw<{ new: number; renewals: number }[]>(
      Prisma.sql`SELECT COUNT(*) FILTER (WHERE NOT EXISTS(SELECT 1 FROM "Membership" old WHERE old."organizationId" = m."organizationId" AND old."memberId" = m."memberId" AND (old."createdAt", old.id) < (m."createdAt", m.id)))::int AS new, COUNT(*) FILTER (WHERE EXISTS(SELECT 1 FROM "Membership" old WHERE old."organizationId" = m."organizationId" AND old."memberId" = m."memberId" AND (old."createdAt", old.id) < (m."createdAt", m.id)))::int AS renewals FROM "Membership" m WHERE m."organizationId" = ${ctx.organizationId} ${branchSql} AND m."createdAt" >= ${window.from} AND m."createdAt" < ${window.to}`,
    ),
    db.$queryRaw<{ day: string; count: number }[]>(
      Prisma.sql`SELECT to_char("createdAt" AT TIME ZONE 'America/Guayaquil', 'YYYY-MM-DD') AS day, COUNT(*)::int AS count FROM "CheckIn" WHERE "organizationId" = ${ctx.organizationId} ${attendanceBranch} AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to} GROUP BY 1 ORDER BY 1`,
    ),
    db.$queryRaw<{ hour: number; count: number }[]>(
      Prisma.sql`SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'America/Guayaquil')::int AS hour, COUNT(*)::int AS count FROM "CheckIn" WHERE "organizationId" = ${ctx.organizationId} ${attendanceBranch} AND "createdAt" >= ${window.from} AND "createdAt" < ${window.to} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    ),
    db.dayPass.count({
      where: { ...scope, createdAt: { gte: window.from, lt: window.to } },
    }),
  ]);
  return {
    active,
    expiring,
    expired,
    frozen,
    distribution,
    contracts: contracts[0],
    attendanceDays,
    hours,
    passes,
  };
}
