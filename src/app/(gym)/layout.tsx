import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { db } from "@/infrastructure/db";
import { can } from "@/modules/auth/permissions";
import { Logout } from "@/components/auth-form";
import { NavLink } from "@/components/nav-link";
export default async function GymLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await pageContext();
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
  });
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <aside className="sidebar">
        <Link href="/dashboard" className="wordmark">
          MANCAR<span>GYM</span>
        </Link>
        <div className="organization">
          <span className="org-icon">M</span>
          <div>
            <strong>{organization.name}</strong>
            <small>{ctx.role}</small>
          </div>
        </div>
        <nav aria-label="Navegación principal">
          <span className="nav-caption">OPERACIÓN</span>
          <NavLink href="/dashboard">Resumen de jornada</NavLink>
          <NavLink href="/members">Socios y membresías</NavLink>
          {can(ctx.role, "checkins:write") && (
            <NavLink href="/check-in">Control de acceso</NavLink>
          )}
          {can(ctx.role, "payments:write") && (
            <NavLink href="/pos">Punto de venta</NavLink>
          )}
          {can(ctx.role, "inventory:write") && (
            <NavLink href="/inventory">Inventario</NavLink>
          )}
          {can(ctx.role, "expenses:write") && (
            <NavLink href="/expenses">Gastos</NavLink>
          )}
          {can(ctx.role, "reports:read") && (
            <NavLink href="/reports">Reportes y caja</NavLink>
          )}
          {can(ctx.role, "settings:write") && (
            <NavLink href="/settings">Configuración</NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <small>MANCAR SOFTWARE</small>
          <Logout />
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>CONTROL DE TU GIMNASIO</span>
          <span className="badge">{organization.currency} · Ecuador</span>
        </header>
        <main id="main">{children}</main>
        <footer>Registros internos de operación · America/Guayaquil</footer>
      </div>
    </div>
  );
}
