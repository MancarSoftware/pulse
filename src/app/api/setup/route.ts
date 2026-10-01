import { auth } from "@/modules/auth/auth";
import { setupOrganization } from "@/modules/organizations/service";
import { AppError } from "@/shared/errors";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) throw new AppError("UNAUTHENTICATED", "Inicia sesión", 401);
    return Response.json(
      await setupOrganization(session.user.id, await readBody(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
