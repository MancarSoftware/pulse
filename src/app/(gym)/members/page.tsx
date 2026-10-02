import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { listMembers, lookups, type Search } from "@/modules/reports/queries";
import { can } from "@/modules/auth/permissions";
import { OperationForm } from "@/components/operation-form";
import { Modal } from "@/components/modal";
import { Pagination } from "@/components/pagination";
import { formatDate, membershipStatus } from "@/shared/dates";
import { membershipLabels } from "@/shared/presentation";
export default async function Members({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  const search = await searchParams;
  const [list, data] = await Promise.all([
    listMembers(ctx, search),
    lookups(ctx),
  ]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RELACIONES QUE PERDURAN</p>
          <h1>Socios y membresías</h1>
          <p className="muted">Cada socio, su plan y el siguiente paso.</p>
        </div>
        {can(ctx.role, "members:write") && (
          <Modal title="Registrar socio" trigger="Nuevo socio">
            <OperationForm
              endpoint="/api/gym/members"
              redirectTo="/members/:id"
              label="Registrar socio"
              fields={[
                { name: "firstName", label: "Nombres" },
                { name: "lastName", label: "Apellidos" },
                { name: "phone", label: "Teléfono" },
                {
                  name: "email",
                  label: "Email",
                  type: "email",
                  required: false,
                },
                {
                  name: "branchId",
                  label: "Sucursal",
                  type: "select",
                  value: ctx.branchId,
                  options: data.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  })),
                },
              ]}
            />
          </Modal>
        )}
      </div>
      <section className="panel">
        <form className="filters">
          <label className="search">
            Buscar socio
            <input
              name="q"
              defaultValue={typeof search.q === "string" ? search.q : ""}
              placeholder="Nombre, apellido o teléfono"
            />
          </label>
          <label>
            Estado
            <select name="status" defaultValue={String(search.status ?? "")}>
              <option value="">Todos</option>
              <option value="active">Vigentes</option>
              <option value="today">Vencen hoy</option>
              <option value="3">Vencen en 3 días</option>
              <option value="7">Vencen en 7 días</option>
              <option value="expired">Vencidos</option>
            </select>
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
          <button className="button secondary">Filtrar</button>
        </form>
        {list.rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Socio</th>
                  {ctx.role !== "TRAINER" && <th>Teléfono</th>}
                  <th>Plan</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.rows.map((m) => {
                  const membership = m.memberships[0];
                  const status =
                    m._count.memberships > 0 &&
                    membership?.startAt &&
                    membership.startAt > new Date()
                      ? "ACTIVE"
                      : membership
                        ? membershipStatus(membership)
                        : "Sin membresía";
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="member-cell">
                          <span className="member-avatar" aria-hidden="true">
                            {m.firstName.slice(0, 1)}
                            {m.lastName.slice(0, 1)}
                          </span>
                          <div>
                            <strong>
                              {m.firstName} {m.lastName}
                            </strong>
                            <br />
                            <small>{m.branch.name}</small>
                          </div>
                        </div>
                      </td>
                      {ctx.role !== "TRAINER" && <td>{m.phone}</td>}
                      <td>{membership?.planName ?? "—"}</td>
                      <td>
                        {membership
                          ? formatDate(new Date(membership.endAt.getTime() - 1))
                          : "—"}
                      </td>
                      <td>
                        <span
                          className={`status ${status === "EXPIRED" ? "danger" : status === "EXPIRING_SOON" ? "warning" : ""}`}
                        >
                          {membershipLabels[status] ?? status}
                        </span>
                      </td>
                      <td>
                        {ctx.role !== "TRAINER" && (
                          <Link href={`/members/${m.id}`}>Abrir perfil →</Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No hay socios para mostrar</h3>
            <p>Registra tu primer socio o ajusta la búsqueda.</p>
          </div>
        )}
        <Pagination
          page={list.page}
          total={list.total}
          search={search}
          path="/members"
        />
      </section>
    </>
  );
}
