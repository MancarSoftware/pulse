import { addDays } from "@/shared/dates";
export function subscriptionStatus(
  subscription: {
    trialEndsAt: Date;
    paidUntil: Date | null;
    graceDays: number;
  } | null,
  now = new Date(),
) {
  if (!subscription)
    return {
      state: "SUSPENDED" as const,
      allowed: false,
      endAt: null,
      graceEndsAt: null,
    };
  const endAt = subscription.paidUntil ?? subscription.trialEndsAt;
  const graceEndsAt = addDays(endAt, subscription.graceDays);
  if (now < endAt)
    return {
      state: subscription.paidUntil ? ("ACTIVE" as const) : ("TRIAL" as const),
      allowed: true,
      endAt,
      graceEndsAt,
    };
  if (subscription.paidUntil && now < graceEndsAt)
    return { state: "GRACE" as const, allowed: true, endAt, graceEndsAt };
  return { state: "SUSPENDED" as const, allowed: false, endAt, graceEndsAt };
}
export const subscriptionLabels = {
  ACTIVE: "Activa",
  TRIAL: "En prueba",
  GRACE: "Pago pendiente · período de gracia",
  SUSPENDED: "Suspendida",
};
