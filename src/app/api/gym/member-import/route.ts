import { getContext } from "@/modules/auth/context";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import {
  previewMemberImport,
  confirmMemberImport,
} from "@/modules/members/import";
import { AppError } from "@/shared/errors";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    const body = await readBody(request, 524288);
    if (!body || typeof body !== "object" || !("action" in body))
      throw new AppError("ACTION", "Acción inválida.", 422);
    const { action, ...input } = body;
    const result =
      action === "preview"
        ? await previewMemberImport(ctx, input)
        : action === "confirm"
          ? await confirmMemberImport(ctx, input)
          : null;
    if (!result) throw new AppError("ACTION", "Acción inválida.", 422);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
