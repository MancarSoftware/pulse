import { db } from "@/infrastructure/db";
import { queryScope } from "@/modules/reports/queries";
import { addDays, dayStart, localDate } from "@/shared/dates";
import type { Context } from "@/modules/auth/permissions";
import { AppError } from "@/shared/errors";
export interface NotificationService {
  send(message: { recipient: string; text: string }): Promise<void>;
}
export class UnconfiguredNotificationChannel implements NotificationService {
  constructor(private channel: "WhatsApp" | "Email") {}
  async send(): Promise<void> {
    throw new AppError(
      "CHANNEL_NOT_CONFIGURED",
      `${this.channel} no está configurado`,
      503,
    );
  }
}
export async function renewalAlerts(ctx: Context, branchId?: string) {
  const now = new Date();
  const until = addDays(dayStart(localDate(now)), 8);
  return db.membership.findMany({
    where: {
      ...queryScope(ctx, { branch: branchId }),
      state: "VALID",
      endAt: { gt: now, lte: until },
      member: {
        active: true,
        memberships: { none: { state: "VALID", endAt: { gt: until } } },
      },
    },
    orderBy: { endAt: "asc" },
    take: 10,
    include: {
      member: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}
