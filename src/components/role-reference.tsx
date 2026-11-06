import { can, type Role, type Permission } from "@/modules/auth/permissions";
export const roleLabels: Record<Role, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  RECEPTIONIST: "Recepción",
  TRAINER: "Entrenador",
};
export function RoleReference() {
  const functions: { label: string; permission: Permission }[] = [
    { label: "Consultar socios", permission: "members:read" },
    { label: "Registrar y editar socios", permission: "members:write" },
    { label: "Registrar ingresos", permission: "checkins:write" },
    { label: "Cobrar y renovar", permission: "payments:write" },
    { label: "Reportes", permission: "reports:read" },
    { label: "Configuración y congelaciones", permission: "catalog:write" },
    { label: "Revertir operaciones", permission: "refunds:write" },
    { label: "Equipo y actividad", permission: "staff:write" },
  ];
  return (
    <details className="role-reference">
      <summary>Qué puede hacer cada rol</summary>
      <p>
        Recepción y entrenadores trabajan dentro de su sucursal. Entrenadores
        ven el directorio básico, sin teléfonos ni acceso al perfil. Solo el
        propietario conecta WhatsApp y gestiona la suscripción.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Función</th>
              {Object.entries(roleLabels).map(([role, label]) => (
                <th key={role}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {functions.map((item) => (
              <tr key={item.permission}>
                <td>{item.label}</td>
                {(Object.keys(roleLabels) as Role[]).map((role) => (
                  <td key={role}>
                    {can(role, item.permission) ? "Permitido" : "Sin acceso"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
