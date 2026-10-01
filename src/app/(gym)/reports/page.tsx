import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import {
  financialReport,
  lookups,
  type Search,
} from "@/modules/reports/queries";
import { Decimal, formatMoney } from "@/shared/money";
import { formatDate } from "@/shared/dates";
import { RevenueChart } from "@/components/revenue-chart";
import { Pagination } from "@/components/pagination";
import { Modal } from "@/components/modal";
import { OperationForm } from "@/components/operation-form";
import { operationalReport } from "@/modules/reports/operations";
const labels: Record<string, string> = {
  MEMBERSHIP_PAYMENT: "Membresías",
  DAY_PASS: "Pases diarios",
  PRODUCT_SALE: "Productos",
  EXPENSE: "Gastos",
  REFUND: "Devoluciones",
  CORRECTION: "Correcciones de gastos",
};
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  const search = await searchParams;
  const [report, data, operations] = await Promise.all([
    financialReport(ctx, search),
    lookups(ctx),
    operationalReport(ctx, search),
  ]);
  const income = report.sources
    .filter((s) =>
      ["MEMBERSHIP_PAYMENT", "DAY_PASS", "PRODUCT_SALE"].includes(s.kind),
    )
    .reduce((sum, s) => sum.plus(s._sum.amount ?? 0), new Decimal(0));
  const outflow = report.sources
    .filter((s) => ["EXPENSE", "REFUND"].includes(s.kind))
    .reduce((sum, s) => sum.minus(s._sum.amount ?? 0), new Decimal(0));
  const net = report.sources.reduce(
    (sum, s) => sum.plus(s._sum.amount ?? 0),
    new Decimal(0),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DECISIONES CON DATOS</p>
          <h1>Reportes y caja</h1>
          <p className="muted">
            Flujo de dinero registrado. No representa utilidad contable ni saldo
            bancario.
          </p>
        </div>
      </div>
      <form className="filters">
        <label>
          Desde
          <input type="date" name="from" defaultValue={report.window.start} />
        </label>
        <label>
          Hasta
          <input type="date" name="to" defaultValue={report.window.end} />
        </label>
        <label>
          Sucursal
          <select name="branch" defaultValue={String(search.branch ?? "")}>
            <option value="">Toda la organización</option>
            {data.branches.map((b) => (
              <option value={b.id} key={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Agrupar
          <select name="group" defaultValue={String(search.group ?? "day")}>
            <option value="day">Día</option>
            <option value="week">Semana ISO</option>
            <option value="month">Mes</option>
          </select>
        </label>
        <button className="button secondary">Aplicar período</button>
      </form>
      <section className="metrics">
        <div>
          <span>Ingresos brutos</span>
          <strong>{formatMoney(income)}</strong>
        </div>
        <div>
          <span>Gastos + devoluciones</span>
          <strong>{formatMoney(outflow)}</strong>
        </div>
        <div>
          <span>Flujo neto registrado</span>
          <strong>{formatMoney(net)}</strong>
        </div>
      </section>
      <section className="panel">
        <h2>Entradas y salidas por período</h2>
        {report.daily.length ? (
          <RevenueChart
            data={report.daily.map((d) => ({
              day: d.day,
              revenue: Number(d.revenue),
              outflow: Number(d.outflow),
            }))}
          />
        ) : (
          <div className="empty">No hay movimientos en este período.</div>
        )}
      </section>
      <section className="panel">
        <h2>Membresías y crecimiento</h2>
        <p className="muted">
          Estado actual de socios; altas y renovaciones dentro del período
          seleccionado.
        </p>
        <div className="finance-strip">
          <div>
            Vigentes<strong>{operations.active}</strong>
          </div>
          <div>
            Vencen en 7 días<strong>{operations.expiring}</strong>
          </div>
          <div>
            Vencidos<strong>{operations.expired}</strong>
          </div>
          <div>
            Congelados<strong>{operations.frozen}</strong>
          </div>
          <div>
            Nuevos contratos<strong>{operations.contracts.new}</strong>
          </div>
          <div>
            Renovaciones<strong>{operations.contracts.renewals}</strong>
          </div>
        </div>
        <h3 style={{ marginTop: 24 }}>Distribución de planes vigentes</h3>
        {operations.distribution.map((p) => (
          <div className="cart-line" key={p.planName}>
            <span>{p.planName}</span>
            <strong>{p._count}</strong>
          </div>
        ))}
      </section>
      <div className="split">
        <section className="panel">
          <h2>Asistencia por día</h2>
          <p className="muted">
            Además se registraron {operations.passes} pases diarios.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Ingresos de socios</th>
                </tr>
              </thead>
              <tbody>
                {operations.attendanceDays.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>{d.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <h2>Horarios de mayor actividad</h2>
          <p className="muted">
            Hora local de Ecuador. Registros del período seleccionado.
          </p>
          {operations.hours.map((h) => (
            <div className="cart-line" key={h.hour}>
              <span>
                {String(h.hour).padStart(2, "0")}:00 –{" "}
                {String(h.hour).padStart(2, "0")}:59
              </span>
              <strong>{h.count} ingresos</strong>
            </div>
          ))}
        </section>
      </div>
      <div className="split">
        <section className="panel">
          <h2>Origen del flujo</h2>
          {report.sources.map((s) => (
            <div className="cart-line" key={s.kind}>
              <span>{labels[s.kind]}</span>
              <strong>{formatMoney(s._sum.amount ?? "0")}</strong>
            </div>
          ))}
        </section>
        <section className="panel">
          <h2>Por método de pago</h2>
          {report.methods.map((m) => (
            <div className="cart-line" key={m.paymentMethodId}>
              <span>
                {data.methods.find((v) => v.id === m.paymentMethodId)?.name ??
                  "Método deshabilitado"}
              </span>
              <strong>{formatMoney(m._sum.amount ?? "0")}</strong>
            </div>
          ))}
        </section>
      </div>
      <section className="panel">
        <h2>Libro de movimientos</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Método</th>
                <th>Importe USD</th>
                <th>Referencia / corrección</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.occurredAt)}</td>
                  <td>
                    {labels[e.kind]}
                    {e.expense && (
                      <>
                        <br />
                        <small>{e.expense.description}</small>
                      </>
                    )}
                  </td>
                  <td>{e.paymentMethod.name}</td>
                  <td>{formatMoney(e.amount)}</td>
                  <td>
                    <Link href={`/receipts/${e.id}`} className="receipt">
                      {e.reference.slice(0, 8)}…
                    </Link>
                    {!e.reversesId && !e.reversedBy.length && (
                      <Modal
                        title="Revertir movimiento completo"
                        trigger="Revertir"
                      >
                        <p className="notice danger">
                          Se registrará una contrapartida por{" "}
                          {formatMoney(e.amount)}. Una membresía revertida
                          perderá su acceso.
                        </p>
                        <OperationForm
                          endpoint="/api/gym/reversals"
                          financial
                          fixed={{
                            entryId: e.id,
                            branchId: e.branchId,
                            paymentMethodId: e.paymentMethodId,
                            ...(e.saleId ? {} : { returnStock: false }),
                          }}
                          label="Confirmar reversión completa"
                          fields={[
                            { name: "reason", label: "Motivo obligatorio" },
                            ...(e.saleId
                              ? [
                                  {
                                    name: "returnStock",
                                    label:
                                      "Recibí los productos y deben volver al stock",
                                    type: "checkbox" as const,
                                    value: "false",
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </Modal>
                    )}
                    {e.reversedBy.length > 0 && (
                      <span className="status warning">Revertido</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={report.page}
          total={report.count}
          search={search}
          path="/reports"
        />
      </section>
      <div className="split">
        <section className="panel">
          <h2>Asistencia por servicio</h2>
          {report.attendance.length ? (
            report.attendance.map((a) => (
              <div className="cart-line" key={a.serviceId}>
                <span>
                  {data.services.find((s) => s.id === a.serviceId)?.name ??
                    "Servicio deshabilitado"}
                </span>
                <strong>{a._count} ingresos</strong>
              </div>
            ))
          ) : (
            <p className="muted">No hay asistencia en este período.</p>
          )}
        </section>
        <section className="panel">
          <h2>Productos más vendidos</h2>
          <p className="muted">
            Ventas brutas; las devoluciones se muestran en el libro.
          </p>
          {report.bestSellers.map((p) => (
            <div className="cart-line" key={`${p.productId}-${p.name}`}>
              <span>
                {p.name}
                <br />
                <small>{p._sum.quantity} unidades</small>
              </span>
              <strong>{formatMoney(p._sum.total ?? "0")}</strong>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
