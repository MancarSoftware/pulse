import Link from "next/link";
import { Icon } from "@/components/icon";
import { pageContext } from "@/lib/page-context";
import { db } from "@/infrastructure/db";
import { dayStart, localDate, addDays } from "@/shared/dates";
import { renewalAlerts } from "@/modules/notifications/service";
import { can } from "@/modules/auth/permissions";
import { formatMoney, Decimal } from "@/shared/money";
import {
  queryScope,
  reportWindow,
  lookups,
  type Search,
} from "@/modules/reports/queries";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  const search = await searchParams;
  const now = new Date();
  const today = dayStart(localDate(now));
  const scope = queryScope(ctx, search);
  const window = reportWindow({ ...search, from: search.from ?? localDate() });
  const data = await lookups(ctx);
  const ledger = can(ctx.role, "reports:read")
    ? await db.ledgerEntry.groupBy({
        by: ["kind"],
        where: { ...scope, occurredAt: { gte: window.from, lt: window.to } },
        _sum: { amount: true },
      })
    : null;
  const [newMembers, expired] = await Promise.all([
    db.member.count({
      where: { ...scope, createdAt: { gte: window.from, lt: window.to } },
    }),
    db.member.count({
      where: {
        ...scope,
        memberships: {
          some: { state: "VALID", endAt: { lte: now } },
          none: {
            OR: [{ state: "VALID", endAt: { gt: now } }, { state: "FROZEN" }],
          },
        },
      },
    }),
  ]);
  const [members, active, checkIns, expiring] = await Promise.all([
    db.member.count({ where: { ...scope, active: true } }),
    db.member.count({
      where: {
        ...scope,
        active: true,
        memberships: {
          some: { state: "VALID", startAt: { lte: now }, endAt: { gt: now } },
        },
      },
    }),
    db.checkIn.count({
      where: { ...scope, createdAt: { gte: today, lt: addDays(today, 1) } },
    }),
    renewalAlerts(ctx, scope.branchId),
  ]);
  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Intl.DateTimeFormat("es-EC", {
              dateStyle: "full",
              timeZone: "America/Guayaquil",
            }).format(now)}
          </p>
          <h1>Tu jornada, en un vistazo.</h1>
          <p className="muted">
            Las prioridades de hoy, antes del siguiente ingreso.
          </p>
        </div>
        <Link className="button" href="/members">
          <Icon name="search" /> Buscar socio
        </Link>
      </div>
      <section className="day-banner" aria-label="Acciones de recepción">
        <div className="day-banner-copy">
          <span className="banner-label">
            <Icon name="bolt" /> QUE NO PARE EL MOVIMIENTO
          </span>
          <h2>
            Tu gimnasio.
            <br />
            <span>A buen ritmo.</span>
          </h2>
          <p>Cada ingreso cuenta. La próxima acción, a un clic.</p>
          <div className="banner-actions">
            {can(ctx.role, "checkins:write") && (
              <Link className="button lime" href="/check-in">
                <Icon name="access" /> Registrar ingreso <Icon name="arrow" />
              </Link>
            )}
            {can(ctx.role, "payments:write") && (
              <Link className="banner-link" href="/pos">
                Abrir punto de venta <Icon name="arrow" />
              </Link>
            )}
            {!can(ctx.role, "checkins:write") && (
              <Link className="button lime" href="/members">
                Consultar socios <Icon name="arrow" />
              </Link>
            )}
          </div>
        </div>
        <div className="membership-pulse">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle className="pulse-track" cx="80" cy="80" r="65" />
            <circle
              className="pulse-value"
              cx="80"
              cy="80"
              r="65"
              pathLength="100"
              strokeDasharray={`${members ? (active / members) * 100 : 0} 100`}
            />
          </svg>
          <div>
            <strong>
              {members ? Math.round((active / members) * 100) : 0}
              <small>%</small>
            </strong>
            <span>
              socios con
              <br />
              membresía vigente
            </span>
          </div>
        </div>
      </section>
      <section className="metrics" aria-label="Actividad actual">
        <div className="metric-members">
          <span className="metric-icon">
            <Icon name="members" />
          </span>
          <span>Socios registrados</span>
          <strong>{members}</strong>
          <small>Socios activos en el directorio</small>
        </div>
        <div className="metric-active">
          <span className="metric-icon">
            <Icon name="check" />
          </span>
          <span>Con membresía vigente</span>
          <strong>{active}</strong>
          <small>Listos para seguir entrenando</small>
        </div>
        <div className="metric-visits">
          <span className="metric-icon">
            <Icon name="access" />
          </span>
          <span>Ingresos de hoy</span>
          <strong>{checkIns}</strong>
          <small>Actividad registrada en recepción</small>
        </div>
      </section>
      <div className="period-heading">
        <h2>El pulso de tu negocio</h2>
        <span className="badge">{newMembers} nuevos socios en el período</span>
      </div>
      <form className="filters dashboard-filters">
        <label>
          Desde
          <input type="date" name="from" defaultValue={window.start} />
        </label>
        <label>
          Hasta
          <input type="date" name="to" defaultValue={window.end} />
        </label>
        <label>
          Sucursal
          <select name="branch" defaultValue={String(search.branch ?? "")}>
            <option value="">Mis sucursales</option>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Aplicar</button>
      </form>
      <div className={`dashboard-detail ${ledger ? "" : "single"}`}>
        {ledger && (
          <section className="panel finance-panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">CAJA Y MOVIMIENTOS</p>
                <h2>Tu balance</h2>
              </div>
              <Icon name="reports" />
            </div>
            <div className="finance-strip">
              {[
                { key: "MEMBERSHIP_PAYMENT", label: "Membresías" },
                { key: "DAY_PASS", label: "Pases diarios" },
                { key: "PRODUCT_SALE", label: "Productos" },
                { key: "EXPENSE", label: "Gastos" },
              ].map((item) => (
                <div key={item.key}>
                  <span className="muted">{item.label}</span>
                  <strong>
                    {formatMoney(
                      ledger.find((l) => l.kind === item.key)?._sum.amount ??
                        "0",
                    )}
                  </strong>
                </div>
              ))}
              <div>
                <span className="muted">Flujo neto</span>
                <strong>
                  {formatMoney(
                    ledger.reduce(
                      (sum, l) => sum.plus(l._sum.amount ?? 0),
                      new Decimal(0),
                    ),
                  )}
                </strong>
              </div>
            </div>
            <Link className="finance-link" href="/reports">
              Ver libro de movimientos <Icon name="arrow" />
            </Link>
          </section>
        )}
        <section className="panel renewals-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">CUIDA TU COMUNIDAD</p>
              <h2>Próximos vencimientos</h2>
            </div>
            <Link href="/members?status=expiring">Ver socios →</Link>
          </div>
          <div className="renewal-filters">
            <Link href="/members?status=today">Vencen hoy</Link>
            <Link href="/members?status=3">En 3 días</Link>
            <Link href="/members?status=7">En 7 días</Link>
            <Link className="expired-link" href="/members?status=expired">
              {expired} vencidos
            </Link>
          </div>
          {expiring.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Socio</th>
                    <th>Plan</th>
                    <th>Último día de acceso</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {expiring.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className="member-cell">
                          <span className="member-avatar" aria-hidden="true">
                            {m.member.firstName.slice(0, 1)}
                            {m.member.lastName.slice(0, 1)}
                          </span>
                          <strong>
                            {m.member.firstName} {m.member.lastName}
                          </strong>
                        </div>
                      </td>
                      <td data-label="Plan">{m.planName}</td>
                      <td data-label="Último día de acceso">
                        {new Intl.DateTimeFormat("es-EC", {
                          timeZone: "America/Guayaquil",
                          dateStyle: "medium",
                        }).format(new Date(m.endAt.getTime() - 1))}
                      </td>
                      <td>
                        <Link
                          className="table-action"
                          href={`/members/${m.member.id}`}
                        >
                          Ver membresía
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <span className="empty-icon">
                <Icon name="check" />
              </span>
              <h3>Sin vencimientos en los próximos 7 días</h3>
              <p>
                Los contratos próximos a vencer aparecerán aquí para facilitar
                el seguimiento.
              </p>
            </div>
          )}
        </section>
      </div>
      <section className="quick-links">
        <Link href="/members">
          <Icon name="members" />
          <div>
            <h3>Socios y membresías</h3>
            <p>Encuentra un socio y revisa su historial.</p>
          </div>
          <Icon name="arrow" />
        </Link>
        {can(ctx.role, "checkins:write") && (
          <Link href="/check-in">
            <Icon name="access" />
            <div>
              <h3>Recepción en movimiento</h3>
              <p>Valida el acceso al servicio contratado.</p>
            </div>
            <Icon name="arrow" />
          </Link>
        )}
      </section>
    </div>
  );
}
