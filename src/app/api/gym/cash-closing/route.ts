import { getContext } from "@/modules/auth/context";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import {
  closingSnapshot,
  saveCashClosing,
} from "@/modules/cash-closing/service";
export async function GET(request: Request) {
  try {
    const ctx = await getContext(request.headers);
    const url = new URL(request.url);
    return Response.json(
      await closingSnapshot(ctx, {
        branchId: url.searchParams.get("branchId"),
        date: url.searchParams.get("date"),
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    return Response.json(await saveCashClosing(ctx, await readBody(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
