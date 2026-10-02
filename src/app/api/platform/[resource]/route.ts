import { platformContext } from "@/modules/billing/platform-auth";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import {
  reviewSubscriptionPayment,
  saveBillingSettings,
  saveSaaSPlan,
} from "@/modules/billing/service";
import { AppError } from "@/shared/errors";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  try {
    checkOrigin(request);
    const { userId } = await platformContext(request.headers);
    const body = await readBody(request);
    switch ((await params).resource) {
      case "payments":
        return Response.json(await reviewSubscriptionPayment(userId, body));
      case "plans":
        return Response.json(await saveSaaSPlan(userId, body));
      case "settings":
        return Response.json(await saveBillingSettings(userId, body));
      default:
        throw new AppError("NOT_FOUND", "Operación no disponible", 404);
    }
  } catch (error) {
    return errorResponse(error);
  }
}
