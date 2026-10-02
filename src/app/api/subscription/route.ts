import { getContext } from "@/modules/auth/context";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import { submitSubscriptionPayment } from "@/modules/billing/service";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers, { allowSuspended: true });
    return Response.json(
      await submitSubscriptionPayment(ctx, await readBody(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
