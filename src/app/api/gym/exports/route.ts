import { getContext } from "@/modules/auth/context";
import { checkOrigin, errorResponse, readBody } from "@/infrastructure/http";
import { prepareExport } from "@/modules/reports/exports";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    const result = await prepareExport(ctx, await readBody(request));
    return new Response(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
