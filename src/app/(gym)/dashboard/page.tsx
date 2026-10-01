import Link from "next/link";
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
    <>
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
          Buscar socio
        </Link>
      </div>
      <form className="filters">
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
      <section className="metrics">
        <div>
          <span>Socios registrados</span>
          <strong>{members}</strong>
        </div>
        <div>
          <span>Con membresía vigente</span>
          <strong>{active}</strong>
        </div>
        <div>
          <span>Ingresos de hoy</span>
          <strong>{checkIns}</strong>
        </div>
      </section>
      <div className="inline" style={{ marginBottom: 24 }}>
        <span className="badge">{newMembers} nuevos socios en el período</span>
        <Link href="/members?status=today">Vencen hoy</Link>
        <Link href="/members?status=3">Próximos 3 días</Link>
        <Link href="/members?status=7">Próximos 7 días</Link>
        <Link href="/members?status=expired">{expired} socios vencidos</Link>
      </div>
      {ledger && (
        <section className="panel">
          <div className="section-heading">
            <h2>Dinero registrado en el período</h2>
            <Link href="/reports">Ver libro →</Link>
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
                    ledger.find((l) => l.kind === item.key)?._sum.amount ?? "0",
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
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SEGUIMIENTO</p>
            <h2>Próximos vencimientos</h2>
          </div>
          <Link href="/members?status=expiring">Ver socios →</Link>
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
                      {m.member.firstName} {m.member.lastName}
                    </td>
                    <td>{m.planName}</td>
                    <td>
                      {new Intl.DateTimeFormat("es-EC", {
                        timeZone: "America/Guayaquil",
                        dateStyle: "medium",
                      }).format(new Date(m.endAt.getTime() - 1))}
                    </td>
                    <td>
                      <Link href={`/members/${m.member.id}`}>
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
            <h3>Sin vencimientos en los próximos 7 días</h3>
            <p>
              Los contratos próximos a vencer aparecerán aquí para facilitar el
              seguimiento.
            </p>
          </div>
        )}
      </section>
      <section className="quick-links">
        <Link href="/members">
          <span>01</span>
          <h3>Socios y membresías</h3>
          <p>Encuentra un socio y revisa su historial.</p>
        </Link>
        <Link href="/check-in">
          <span>02</span>
          <h3>Recepción en movimiento</h3>
          <p>Valida el acceso al servicio contratado.</p>
        </Link>
      </section>
    </>
  );
}
