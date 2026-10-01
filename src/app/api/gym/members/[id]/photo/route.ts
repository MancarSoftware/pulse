import sharp from "sharp";
import { getContext } from "@/modules/auth/context";
import { authorize } from "@/modules/auth/permissions";
import { getMember } from "@/modules/members/service";
import { checkOrigin, errorResponse } from "@/infrastructure/http";
import { objectStorage } from "@/infrastructure/storage";
import { serializable } from "@/infrastructure/db";
import { audit } from "@/modules/transactions/service";
import { AppError } from "@/shared/errors";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const ctx = await getContext(request.headers);
    authorize(ctx, "members:write");
    const member = await getMember(ctx, (await params).id);
    const size = Number(request.headers.get("content-length"));
    if (!Number.isFinite(size) || size <= 0 || size > 2_200_000)
      throw new AppError(
        "UPLOAD_SIZE",
        "La fotografía debe pesar menos de 2 MB",
        413,
      );
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File) || file.size > 2_000_000)
      throw new AppError("UPLOAD_SIZE", "Selecciona una imagen de hasta 2 MB");
    const storage = objectStorage();
    const bytes = Buffer.from(await file.arrayBuffer());
    let encoded: Buffer;
    try {
      const image = sharp(bytes, { limitInputPixels: 16_000_000 });
      const metadata = await image.metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
        throw new Error("format");
      encoded = await image
        .rotate()
        .resize(600, 600, { fit: "cover", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new AppError(
        "INVALID_IMAGE",
        "Utiliza una imagen JPEG, PNG o WebP válida",
      );
    }
    const key = `${ctx.organizationId}/members/${member.id}/${crypto.randomUUID()}.webp`;
    await storage.put(key, encoded, "image/webp");
    await serializable(async (tx) => {
      await tx.member.update({
        where: {
          organizationId_id: {
            organizationId: ctx.organizationId,
            id: member.id,
          },
        },
        data: { photoKey: key },
      });
      await audit(tx, ctx, "member.photo.updated", member.id);
    });
    return Response.json({ id: member.id });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getContext(request.headers);
    if (ctx.role === "TRAINER")
      throw new AppError("FORBIDDEN", "Acceso no autorizado", 403);
    const member = await getMember(ctx, (await params).id);
    if (!member.photoKey)
      throw new AppError("NOT_FOUND", "Sin fotografía", 404);
    const bytes = await objectStorage().get(member.photoKey);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
