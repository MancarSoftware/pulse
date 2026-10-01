import { getContext } from "@/modules/auth/context";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import { saveMember } from "@/modules/members/service";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    return Response.json(
      await saveMember(ctx, await readBody(request), (await params).id),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
