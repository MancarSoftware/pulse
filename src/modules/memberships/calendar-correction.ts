import { serializable } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { audit } from "@/modules/transactions/service";
import { addCalendarMonths, addDays } from "@/shared/dates";

/** One-time, audited correction of legacy day-based contracts. Safe to rerun. */
export async function correctCalendarMemberships(ctx: Context) {
  authorize(ctx, "staff:write");
  return serializable(async (tx) => {
    const contracts = await tx.membership.findMany({
      where: {
        organizationId: ctx.organizationId,
        state: { not: "CANCELLED" },
      },
      include: { plan: true },
      orderBy: [{ memberId: "asc" }, { startAt: "asc" }, { createdAt: "asc" }],
    });
    let corrected = 0;
    let shifted = 0;
    const review: string[] = [];
    let previous: { memberId: string; oldEnd: Date; newEnd: Date } | undefined;
    for (const contract of contracts) {
      const shift =
        previous?.memberId === contract.memberId &&
        previous.oldEnd.getTime() === contract.startAt.getTime()
          ? (previous.newEnd.getTime() - previous.oldEnd.getTime()) / 86400000
          : 0;
      const startAt = addDays(contract.startAt, shift);
      let endAt = addDays(contract.endAt, shift);
      let months = contract.durationMonths;
      if (months === null) {
        const days = contract.plan.durationDays;
        months = days === 30 ? 1 : days === 90 ? 3 : days === 180 ? 6 : null;
        const span =
          (contract.endAt.getTime() - contract.startAt.getTime()) / 86400000;
        if (
          months === null ||
          days === null ||
          !Number.isInteger(span) ||
          span < days
        ) {
          review.push(contract.id);
          previous = {
            memberId: contract.memberId,
            oldEnd: contract.endAt,
            newEnd: contract.endAt,
          };
          continue;
        }
        // Extra days come from pauses on a running contract. Future contracts
        // moved by a pause retain their original span and therefore add zero.
        endAt = addDays(addCalendarMonths(startAt, months), span - days);
        corrected++;
      } else if (shift !== 0) shifted++;
      if (contract.durationMonths === null || shift !== 0) {
        await tx.membership.update({
          where: {
            organizationId_id: {
              organizationId: ctx.organizationId,
              id: contract.id,
            },
          },
          data: { startAt, endAt, durationMonths: months },
        });
        await audit(tx, ctx, "membership.calendar.corrected", contract.id, {
          oldStartAt: contract.startAt.toISOString(),
          oldEndAt: contract.endAt.toISOString(),
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          durationMonths: months,
          reason:
            "Corrección autorizada: membresías de meses calendario en lugar de días fijos",
        });
      }
      previous = {
        memberId: contract.memberId,
        oldEnd: contract.endAt,
        newEnd: endAt,
      };
    }
    return { corrected, shifted, review };
  });
}
