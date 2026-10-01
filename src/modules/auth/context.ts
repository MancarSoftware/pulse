import { auth } from "./auth";
import { db } from "@/infrastructure/db";
import { AppError } from "@/shared/errors";
import type { Context } from "./permissions";
export async function getContext(headers: Headers): Promise<Context> {
  const session = await auth.api.getSession({ headers });
  if (!session)
    throw new AppError("UNAUTHENTICATED", "Inicia sesión para continuar", 401);
  const staff = await db.staff.findUnique({
    where: { userId: session.user.id },
  });
  if (!staff)
    throw new AppError("SETUP_REQUIRED", "Configura tu organización", 409);
  if (!staff.active)
    throw new AppError("FORBIDDEN", "Acceso deshabilitado", 403);
  return {
    organizationId: staff.organizationId,
    staffId: staff.id,
    userId: staff.userId,
    role: staff.role,
    branchId: staff.branchId,
  };
}
