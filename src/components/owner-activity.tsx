import {
  ownerActivity,
  activityGroups,
  activityLabel,
  safeActivityDetail,
} from "@/modules/organizations/activity";
import type { Context } from "@/modules/auth/permissions";
import type { Search } from "@/modules/reports/queries";
import { Pagination } from "./pagination";
import { formatDateTime } from "@/shared/dates";
export async function OwnerActivity({
  ctx,
  search,
}: {
  ctx: Context;
  search: Search;
}) {
  if (ctx.role !== "OWNER")
    return (
      <p role="alert">
        Solo el propietario puede consultar la actividad del equipo.
      </p>
    );
  const data = await ownerActivity(ctx, search);
  return (
    <>
      <h2>Actividad del gimnasio</h2>
      <p className="muted">
        Quién hizo cada cambio y cuándo. El registro se conserva y no se puede
        editar desde esta pantalla.
      </p>
      <form className="filters">
        <input type="hidden" name="tab" value="activity" />
        <label>
          Tipo de actividad
          <select name="group" defaultValue={String(search.group ?? "all")}>
            {Object.entries(activityGroups).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Realizado por
          <select name="actor" defaultValue={String(search.actor ?? "")}>
            <option value="">Todo el equipo</option>
            {data.actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.user.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button secondary">Filtrar actividad</button>
      </form>
      {data.rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha y hora · Ecuador</th>
                <th>Persona</th>
                <th>Acción</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDateTime(row.createdAt)}</td>
                  <td>{row.actor.user.name}</td>
                  <td>{activityLabel(row.action)}</td>
                  <td>{safeActivityDetail(row.detail)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">No hay actividad para estos filtros.</p>
      )}
      <Pagination
        path="/settings"
        search={search}
        page={data.page}
        pageSize={12}
        total={data.total}
      />
    </>
  );
}
