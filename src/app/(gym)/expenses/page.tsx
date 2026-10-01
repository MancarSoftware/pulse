import { pageContext } from "@/lib/page-context";
import { authorize } from "@/modules/auth/permissions";
import {
  lookups,
  queryScope,
  pagination,
  type Search,
} from "@/modules/reports/queries";
import { db } from "@/infrastructure/db";
import { OperationForm } from "@/components/operation-form";
import { Pagination } from "@/components/pagination";
import { formatMoney } from "@/shared/money";
import { localDate, formatDate } from "@/shared/dates";
export default async function Expenses({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "expenses:write");
  const search = await searchParams;
  const scope = queryScope(ctx, search);
  const { page, skip, take } = pagination(search);
  const [expenses, total, data] = await Promise.all([
    db.expense.findMany({
      where: scope,
      skip,
      take,
      orderBy: { occurredAt: "desc" },
      include: { category: true, branch: true },
    }),
    db.expense.count({ where: scope }),
    lookups(ctx),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SALIDAS DE DINERO</p>
          <h1>Gastos</h1>
          <p className="muted">
            Registra lo que sale. Conserva el motivo y la referencia.
          </p>
        </div>
      </div>
      <div className="split">
        <section className="panel">
          <h2>Gastos registrados</h2>
          <form className="filters">
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
            <button className="button secondary">Filtrar</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Categoría</th>
                  <th>Importe</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.occurredAt)}</td>
                    <td>
                      {e.description}
                      <br />
                      <small>{e.branch.name}</small>
                    </td>
                    <td>{e.category.name}</td>
                    <td>{formatMoney(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!expenses.length && (
            <p className="empty">No hay gastos registrados.</p>
          )}
          <Pagination
            page={page}
            total={total}
            search={search}
            path="/expenses"
          />
        </section>
        <section className="panel">
          <h2>Registrar gasto</h2>
          {data.categories.length ? (
            <OperationForm
              endpoint="/api/gym/expenses"
              financial
              label="Registrar gasto y salida"
              fields={[
                { name: "description", label: "Descripción del gasto" },
                { name: "amount", label: "Importe USD" },
                {
                  name: "categoryId",
                  label: "Categoría",
                  type: "select",
                  options: data.categories.map((c) => ({
                    value: c.id,
                    label: c.name,
                  })),
                },
                {
                  name: "paymentMethodId",
                  label: "Método de pago",
                  type: "select",
                  options: data.methods.map((m) => ({
                    value: m.id,
                    label: m.name,
                  })),
                },
                {
                  name: "branchId",
                  label: "Sucursal del gasto",
                  type: "select",
                  value: ctx.branchId,
                  options: data.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  })),
                },
                {
                  name: "date",
                  label: "Fecha",
                  type: "date",
                  value: localDate(),
                },
                {
                  name: "reference",
                  label: "Referencia de comprobante",
                  required: false,
                },
                {
                  name: "notes",
                  label: "Notas",
                  type: "textarea",
                  required: false,
                },
              ]}
            />
          ) : (
            <p>
              Agrega una categoría de gastos en Configuración para registrar el
              primer gasto.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
