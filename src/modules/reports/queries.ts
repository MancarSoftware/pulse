import { z } from "zod";
import { db } from "@/infrastructure/db";
import { Prisma } from "@/generated/prisma/client";
import {
  authorize,
  authorizeBranch,
  type Context,
} from "@/modules/auth/permissions";
import { dayStart, localDate, addDays } from "@/shared/dates";
import { AppError } from "@/shared/errors";
export type Search = Record<string, string | string[] | undefined>;
export function queryScope(ctx: Context, search: Search = {}) {
  const branchId =
    typeof search.branch === "string" && search.branch
      ? search.branch
      : ["OWNER", "ADMIN"].includes(ctx.role)
        ? undefined
        : ctx.branchId;
  if (branchId) authorizeBranch(ctx, branchId);
  return {
    organizationId: ctx.organizationId,
    ...(branchId ? { branchId } : {}),
  };
}
export function pagination(search: Search) {
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .catch(1)
    .parse(search.page);
  return { page, skip: (page - 1) * 25, take: 25 };
}
export async function lookups(ctx: Context) {
  const scope = queryScope(ctx);
  const [branches, services, plans, methods, categories] = await Promise.all([
    db.branch.findMany({
      where: {
        organizationId: ctx.organizationId,
        active: true,
        ...(scope.branchId ? { id: scope.branchId } : {}),
      },
      orderBy: { name: "asc" },
      take: 100,
    }),
    db.service.findMany({
      where: { organizationId: ctx.organizationId, active: true },
      orderBy: { name: "asc" },
      take: 300,
    }),
    db.plan.findMany({
      where: { organizationId: ctx.organizationId, active: true },
      orderBy: { name: "asc" },
      take: 300,
      include: { services: true },
    }),
    db.paymentMethod.findMany({
      where: { organizationId: ctx.organizationId, active: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
    db.expenseCategory.findMany({
      where: { organizationId: ctx.organizationId, active: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);
  return { branches, services, plans, methods, categories };
}
export async function listMembers(ctx: Context, search: Search) {
  authorize(ctx, "members:read");
  const now = new Date();
  const today = dayStart(localDate(now));
  const { skip, take, page } = pagination(search);
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
  const where: Prisma.MemberWhereInput = {
    ...queryScope(ctx, search),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            {
              AND: q
                .split(/\s+/)
                .slice(0, 5)
                .map((token) => ({
                  OR: [
                    {
                      firstName: {
                        contains: token,
                        mode: "insensitive" as const,
                      },
                    },
                    {
                      lastName: {
                        contains: token,
                        mode: "insensitive" as const,
                      },
                    },
                  ],
                })),
            },
            ...(ctx.role !== "TRAINER" ? [{ phone: { contains: q } }] : []),
          ],
        }
      : {}),
  };
  const valid: Prisma.MembershipWhereInput = {
    state: "VALID",
    endAt: { gt: now },
  };
  if (search.status === "active")
    where.memberships = { some: { ...valid, startAt: { lte: now } } };
  if (["expiring", "today", "3", "7"].includes(String(search.status))) {
    const days = search.status === "today" ? 1 : search.status === "3" ? 3 : 7;
    const boundary = addDays(today, days + (search.status === "today" ? 0 : 1));
    where.AND = [
      {
        memberships: {
          some: { state: "VALID", endAt: { gt: now, lte: boundary } },
        },
      },
      { memberships: { none: { state: "VALID", endAt: { gt: boundary } } } },
    ];
  }
  if (search.status === "expired")
    where.AND = [
      { memberships: { some: { state: "VALID", endAt: { lte: now } } } },
      { memberships: { none: valid } },
    ];
  const [rows, total] = await Promise.all([
    db.member.findMany({
      where,
      skip,
      take,
      orderBy: [{ lastName: "asc" }, { id: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: ctx.role !== "TRAINER",
        active: true,
        _count: {
          select: {
            memberships: {
              where: {
                state: "VALID",
                startAt: { lte: now },
                endAt: { gt: now },
              },
            },
          },
        },
        branch: { select: { name: true } },
        memberships: {
          where: { state: { not: "CANCELLED" } },
          orderBy: { endAt: "desc" },
          take: 1,
          select: { state: true, startAt: true, endAt: true, planName: true },
        },
      },
    }),
    db.member.count({ where }),
  ]);
  return { rows, total, page };
}
export function reportWindow(search: Search) {
  const end = typeof search.to === "string" ? search.to : localDate();
  const start =
    typeof search.from === "string" ? search.from : `${end.slice(0, 7)}-01`;
  let from: Date, to: Date;
  try {
    from = dayStart(start);
    to = addDays(dayStart(end), 1);
  } catch {
    throw new AppError("INVALID_DATE", "Revisa el período del reporte");
  }
  if (to <= from || to.getTime() - from.getTime() > 367 * 86400000)
    throw new AppError(
      "INVALID_RANGE",
      "Selecciona un período de hasta un año",
    );
  return { from, to, start, end };
}
export async function financialReport(ctx: Context, search: Search) {
  authorize(ctx, "reports:read");
  const scope = queryScope(ctx, search);
  const window = reportWindow(search);
  const { skip, take, page } = pagination(search);
  const where = { ...scope, occurredAt: { gte: window.from, lt: window.to } };
  const periodFormat =
    search.group === "month"
      ? "YYYY-MM"
      : search.group === "week"
        ? 'IYYY-"W"IW'
        : "YYYY-MM-DD";
  const branchSql = scope.branchId
    ? Prisma.sql`AND "branchId" = ${scope.branchId}`
    : Prisma.empty;
  const [sources, methods, entries, count, daily, attendance, bestSellers] =
    await Promise.all([
      db.ledgerEntry.groupBy({
        by: ["kind"],
        where,
        _sum: { amount: true },
        _count: true,
      }),
      db.ledgerEntry.groupBy({
        by: ["paymentMethodId"],
        where,
        _sum: { amount: true },
      }),
      db.ledgerEntry.findMany({
        where,
        skip,
        take,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        include: {
          paymentMethod: true,
          reversedBy: { select: { id: true } },
          expense: { select: { description: true } },
        },
      }),
      db.ledgerEntry.count({ where }),
      db.$queryRaw<
        { day: string; revenue: Prisma.Decimal; outflow: Prisma.Decimal }[]
      >(
        Prisma.sql`SELECT to_char("occurredAt" AT TIME ZONE 'America/Guayaquil', ${periodFormat}) AS day, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS revenue, SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END) AS outflow FROM "LedgerEntry" WHERE "organizationId" = ${ctx.organizationId} ${branchSql} AND "occurredAt" >= ${window.from} AND "occurredAt" < ${window.to} GROUP BY 1 ORDER BY 1`,
      ),
      db.checkIn.groupBy({
        by: ["serviceId"],
        where: { ...scope, createdAt: { gte: window.from, lt: window.to } },
        _count: true,
      }),
      db.saleLine.groupBy({
        by: ["productId", "name"],
        where: {
          organizationId: ctx.organizationId,
          sale: { ...scope, createdAt: { gte: window.from, lt: window.to } },
        },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
      }),
    ]);
  return {
    sources,
    methods,
    entries,
    count,
    daily,
    attendance,
    bestSellers,
    page,
    window,
  };
}
