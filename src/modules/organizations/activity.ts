import { db } from "@/infrastructure/db";
import { authorize, type Context } from "@/modules/auth/permissions";
import { pagination, type Search } from "@/modules/reports/queries";
export const activityGroups = {
  all: "Toda la actividad",
  member: "Socios",
  membership: "Membresías",
  staff: "Equipo y permisos",
  catalog: "Configuración",
  payment: "Cobros y correcciones",
};
export async function ownerActivity(ctx: Context, search: Search) {
  authorize(ctx, "staff:write");
  const group = String(search.group ?? "all");
  const categories: Record<string, string[]> = {
    member: ["member."],
    membership: ["membership."],
    staff: ["staff.", "catalog.staff"],
    catalog: ["catalog."],
    payment: [
      "membership.paid",
      "payment.",
      "sale.",
      "expense.",
      "transaction.",
      "reversal.",
    ],
  };
  const filter = {
    organizationId: ctx.organizationId,
    ...(categories[group]
      ? {
          OR: categories[group].map((prefix) => ({
            action: { startsWith: prefix },
          })),
        }
      : {}),
    ...(typeof search.actor === "string" && search.actor
      ? { actorId: search.actor }
      : {}),
  };
  const p = pagination(search, 12);
  const [rows, total, actors] = await Promise.all([
    db.auditEvent.findMany({
      where: filter,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: p.skip,
      take: p.take,
      include: { actor: { select: { user: { select: { name: true } } } } },
    }),
    db.auditEvent.count({ where: filter }),
    db.staff.findMany({
      where: { organizationId: ctx.organizationId },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
  ]);
  return { rows, total, actors, page: p.page };
}
export function activityLabel(action: string) {
  if (action === "member.imported") return "Socio y contrato migrados";
  if (action === "member.import.completed")
    return "Importación de socios completada";
  if (action === "cash.closing.recorded") return "Cierre de caja guardado";
  if (action === "data.export.prepared")
    return "Archivo de exportación preparado";
  const labels: Record<string, string> = {
    "member.created": "Socio registrado",
    "member.updated": "Perfil de socio actualizado",
    "membership.freeze": "Membresías congeladas",
    "membership.resume": "Membresías reactivadas",
    "staff.access.changed": "Permisos de empleado modificados",
    "catalog.staff.saved": "Empleado registrado",
    "catalog.staff-access.saved": "Configuración de acceso guardada",
    "membership.renewed": "Membresía cobrada o renovada",
    "organization.created": "Gimnasio creado",
  };
  if (action === "membership.paid") return "Membresía cobrada o renovada";
  if (action === "sale.paid") return "Venta cobrada";
  if (action === "expense.recorded") return "Gasto registrado";
  if (action === "transaction.reversed") return "Operación revertida";
  if (labels[action]) return labels[action];
  const catalog: Record<string, string> = {
    service: "Servicio",
    plan: "Plan",
    branch: "Sucursal",
    organization: "Gimnasio",
    product: "Producto",
    "expense-category": "Categoría de gasto",
    "payment-method": "Método de pago",
  };
  const [, kind, operation] = action.split(".");
  if (action.startsWith("catalog.") && catalog[kind])
    return `${catalog[kind]} ${operation === "deleted" ? "eliminado" : "actualizado"}`;
  return action;
}
export function safeActivityDetail(detail: unknown) {
  if (!detail || typeof detail !== "object" || Array.isArray(detail))
    return "Sin detalle adicional";
  const value = detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof value.reason === "string")
    parts.push(`Motivo: ${value.reason.slice(0, 300)}`);
  if (typeof value.active === "boolean")
    parts.push(value.active ? "Acceso habilitado" : "Acceso deshabilitado");
  const roles: Record<string, string> = {
    OWNER: "Propietario",
    ADMIN: "Administrador",
    RECEPTIONIST: "Recepción",
    TRAINER: "Entrenador",
  };
  if (typeof value.role === "string" && roles[value.role])
    parts.push(
      `Rol: ${typeof value.previousRole === "string" && roles[value.previousRole] ? `${roles[value.previousRole]} → ` : ""}${roles[value.role]}`,
    );
  if (typeof value.contracts === "number")
    parts.push(`${value.contracts} contratos afectados`);
  if (value.duplicateConfirmed === true)
    parts.push("Coincidencias revisadas y confirmadas");
  return parts.join(" · ") || "Operación registrada";
}
