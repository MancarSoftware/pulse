import { auth } from "@/modules/auth/auth";
import { db } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
export async function requirePlatformAdmin(userId: string) {
  const admin = await db.platformAdmin.findUnique({ where: { userId } });
  if (!admin?.active)
    throw new AppError(
      "FORBIDDEN",
      "Solo la administración de MANCAR puede revisar suscripciones.",
      403,
    );
}
export async function platformContext(headers: Headers) {
  const session = await auth.api.getSession({ headers });
  if (!session)
    throw new AppError("UNAUTHENTICATED", "Inicia sesión para continuar", 401);
  await requirePlatformAdmin(session.user.id);
  return { userId: session.user.id };
}
