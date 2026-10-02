import { db } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
import { subscriptionStatus } from "./status";
export async function subscriptionAccess(organizationId: string) {
  return subscriptionStatus(
    await db.saaSSubscription.findUnique({ where: { organizationId } }),
  );
}
export async function requireSubscription(organizationId: string) {
  if (!(await subscriptionAccess(organizationId)).allowed)
    throw new AppError(
      "SUBSCRIPTION_SUSPENDED",
      "La suscripción del gimnasio está suspendida. El propietario debe revisar el pago en Mi suscripción.",
      402,
    );
}
