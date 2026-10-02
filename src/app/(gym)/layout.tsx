import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { db } from "@/infrastructure/db";
import { can } from "@/modules/auth/permissions";
import { Logout } from "@/components/auth-form";
import { NavLink } from "@/components/nav-link";
import { AppNavigation } from "@/components/app-navigation";
import { Icon } from "@/components/icon";
import { subscriptionAccess } from "@/modules/billing/access";
import { formatDate, remainingDays } from "@/shared/dates";
export default async function GymLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await pageContext();
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
  });
  const subscription = await subscriptionAccess(ctx.organizationId);
  const platformAdmin = await db.platformAdmin.findUnique({
    where: { userId: ctx.userId },
  });
  return (
    <div className="app-shell">
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <AppNavigation>
        <Link href="/dashboard" className="wordmark">
          MANCAR<span>GYM</span>
        </Link>
        <div className="organization">
          <span className="org-icon">M</span>
          <div>
            <strong>{organization.name}</strong>
            <small>
              {
                {
                  OWNER: "Propietario",
                  ADMIN: "Administrador",
                  RECEPTIONIST: "Recepción",
                  TRAINER: "Entrenador",
                }[ctx.role]
              }
            </small>
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
          {ctx.role === "OWNER" && (
            <NavLink href="/subscription">Mi suscripción</NavLink>
          )}
          {platformAdmin?.active && (
            <NavLink href="/platform">Administración SaaS</NavLink>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-signature">
            <Icon name="bolt" />
            <strong>
              Todo listo.
              <br />A mover tu gimnasio.
            </strong>
          </div>
          <small>MANCAR · GESTIÓN EN MOVIMIENTO</small>
          <Logout />
        </div>
      </AppNavigation>
      <div className="workspace">
        <header className="topbar">
          <form action="/members" className="global-search" role="search">
            <Icon name="search" />
            <input
              name="q"
              aria-label="Buscar en socios"
              placeholder="Buscar por nombre o teléfono…"
            />
            <button type="submit" aria-label="Realizar búsqueda">
              <Icon name="arrow" />
            </button>
          </form>
          <div className="topbar-meta">
            <span className="locale-dot" /> {organization.currency} · Ecuador
            <span className="profile-avatar" aria-label={organization.name}>
              {organization.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main id="main">
          {(subscription.state === "GRACE" ||
            (subscription.endAt && remainingDays(subscription.endAt) <= 7)) && (
            <div className="notice warning" role="status">
              {subscription.state === "GRACE"
                ? `Pago pendiente. El acceso se suspende al finalizar el ${formatDate(new Date(subscription.graceEndsAt!.getTime() - 1))}.`
                : `La suscripción de MANCAR vence al finalizar el ${formatDate(new Date(subscription.endAt!.getTime() - 1))}.`}
              {ctx.role === "OWNER" ? (
                <Link href="/subscription"> Revisar mi suscripción →</Link>
              ) : (
                " Contacta al propietario para renovar."
              )}
            </div>
          )}
          {children}
        </main>
        <footer>Registros internos de operación · America/Guayaquil</footer>
      </div>
    </div>
  );
}
