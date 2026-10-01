import { AppError } from "@/shared/errors";
export const permissions = [
  "members:read",
  "members:write",
  "checkins:write",
  "payments:write",
  "catalog:write",
  "inventory:write",
  "expenses:write",
  "reports:read",
  "staff:write",
  "settings:write",
  "refunds:write",
] as const;
export type Permission = (typeof permissions)[number];
export type Role = "OWNER" | "ADMIN" | "RECEPTIONIST" | "TRAINER";
const grants: Record<Role, readonly Permission[]> = {
  OWNER: permissions,
  ADMIN: permissions.filter((p) => p !== "staff:write"),
  RECEPTIONIST: [
    "members:read",
    "members:write",
    "checkins:write",
    "payments:write",
  ],
  TRAINER: ["members:read"],
};
export function can(role: Role, permission: Permission) {
  return grants[role].includes(permission);
}
export type Context = {
  organizationId: string;
  staffId: string;
  userId: string;
  role: Role;
  branchId: string;
};
export function authorize(ctx: Context, permission: Permission) {
  if (!can(ctx.role, permission))
    throw new AppError(
      "FORBIDDEN",
      "No tienes permiso para esta operación",
      403,
    );
}
export function authorizeBranch(ctx: Context, branchId: string) {
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN" && ctx.branchId !== branchId)
    throw new AppError("FORBIDDEN", "Sucursal no autorizada", 403);
}
