import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { authorize } from "@/modules/auth/permissions";
import { db } from "@/infrastructure/db";
import { CashClosingForm } from "@/components/cash-closing";
import { closingSnapshot } from "@/modules/cash-closing/service";
import { localDate, formatDateTime } from "@/shared/dates";
import { formatMoney } from "@/shared/money";
import { AppError } from "@/shared/errors";
import { pagination, type Search } from "@/modules/reports/queries";
import { Pagination } from "@/components/pagination";
import { z } from "zod";
const methodsSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    net: z.string().regex(/^-?\d+(\.\d{1,2})?$/),
  }),
);
export default async function CashClosingPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "reports:read");
  const search = await searchParams;
  const branches = await db.branch.findMany({
    where: { organizationId: ctx.organizationId, active: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const branchId =
    typeof search.branch === "string" && search.branch
      ? search.branch
      : ctx.branchId;
  const date =
    typeof search.date === "string" && search.date ? search.date : localDate();
  const p = pagination(search, 12);
  let snapshot;
  try {
    snapshot = await closingSnapshot(ctx, { branchId, date });
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return (
      <section className="panel">
        <h1>Cierre de caja</h1>
        <p role="alert" className="notice warning">
          {error.message}
        </p>
        <Link href="/cash-closing">Volver al cierre de hoy</Link>
      </section>
    );
  }
  const where = {
    organizationId: ctx.organizationId,
    branchId,
    businessDate: new Date(`${date}T00:00:00Z`),
  };
  const [history, total] = await Promise.all([
    db.cashClosing.findMany({
      where,
      orderBy: { version: "desc" },
      skip: p.skip,
      take: p.take,
      include: { createdBy: { select: { user: { select: { name: true } } } } },
    }),
    db.cashClosing.count({ where }),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CONTROL DIARIO</p>
          <h1>Cierre de caja</h1>
          <p className="muted">
            Ecuador · USD · Todas las versiones se conservan. El cierre no
            bloquea la operación ni modifica el libro de movimientos.
          </p>
        </div>
      </div>
      <form className="filters">
        <label>
          Fecha de operación
          <input
            name="date"
            type="date"
            defaultValue={date}
            max={localDate()}
            required
          />
        </label>
        <label>
          Sucursal
          <select name="branch" defaultValue={branchId}>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Consultar caja</button>
      </form>
      <CashClosingForm
        key={`${branchId}-${date}-${snapshot.latest?.id ?? "new"}`}
        initial={snapshot}
        isToday={date === localDate()}
      />
      <section className="panel" aria-label="Historial de cierres">
        <h2>Versiones del cierre · {date}</h2>
        {history.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Versión / fecha</th>
                  <th>Responsable</th>
                  <th>Fondo inicial / efectivo</th>
                  <th>Esperado USD</th>
                  <th>Contado USD</th>
                  <th>Diferencia USD</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id}>
                    <td>
                      Versión {item.version}
                      <br />
                      <small>{formatDateTime(item.createdAt)}</small>
                    </td>
                    <td>{item.createdBy.user.name}</td>
                    <td>
                      {formatMoney(item.opening)}
                      <details>
                        <summary>Formas consideradas</summary>
                        {(
                          methodsSchema.safeParse(item.methodSnapshot).data ??
                          []
                        )
                          .filter((method) =>
                            item.cashMethodIds.includes(method.id),
                          )
                          .map((method) => (
                            <p key={method.id}>
                              {method.name}: {formatMoney(method.net)} netos
                            </p>
                          ))}
                      </details>
                    </td>
                    <td>{formatMoney(item.expected)}</td>
                    <td>{formatMoney(item.counted)}</td>
                    <td>{formatMoney(item.difference)}</td>
                    <td>{item.reason || "Sin diferencia"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">
            Todavía no hay un cierre para esta fecha y sucursal.
          </p>
        )}
        <Pagination
          path="/cash-closing"
          search={search}
          page={p.page}
          pageSize={12}
          total={total}
        />
      </section>
    </>
  );
}
