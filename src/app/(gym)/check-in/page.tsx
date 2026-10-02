import { pageContext } from "@/lib/page-context";
import { authorize } from "@/modules/auth/permissions";
import { lookups, queryScope, type Search } from "@/modules/reports/queries";
import { db } from "@/infrastructure/db";
import { QrScanner } from "@/components/qr-scanner";
import { OperationForm } from "@/components/operation-form";
import { formatDate } from "@/shared/dates";
export default async function CheckInPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "checkins:write");
  const search = await searchParams;
  const data = await lookups(ctx);
  const scope = queryScope(ctx, search);
  const branchId = scope.branchId ?? ctx.branchId;
  const q = typeof search.q === "string" ? search.q.trim().slice(0, 100) : "";
  const [members, recent] = await Promise.all([
    q
      ? db.member.findMany({
          where: {
            organizationId: ctx.organizationId,
            branchId,
            active: true,
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              {
                AND: q
                  .split(/\s+/)
                  .slice(0, 5)
                  .map((token) => ({
                    OR: [
                      {
                        firstName: {
                          contains: token,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        lastName: {
                          contains: token,
                          mode: "insensitive" as const,
                        },
                      },
                    ],
                  })),
              },
            ],
          },
          take: 10,
          select: { id: true, firstName: true, lastName: true, phone: true },
        })
      : Promise.resolve([]),
    db.checkIn.findMany({
      where: { organizationId: ctx.organizationId, branchId },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        member: { select: { firstName: true, lastName: true } },
        service: true,
      },
    }),
  ]);
  const serviceOptions = data.services.map((s) => ({
    value: s.id,
    label: s.name,
  }));
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">RECEPCIÓN</p>
          <h1>Control de acceso</h1>
          <p className="muted">
            Un ingreso por socio al día, con membresía vigente y servicio
            contratado. El día se calcula en la hora de Ecuador.
          </p>
        </div>
      </div>
      <form className="filters">
        <label>
          Sucursal
          <select name="branch" defaultValue={branchId}>
            {data.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="search">
          Buscar por nombre o teléfono
          <input name="q" defaultValue={q} placeholder="Encuentra al socio" />
        </label>
        <button className="button secondary">Buscar</button>
      </form>
      <div className="split">
        <div>
          <section className="panel">
            <h2>Leer credencial</h2>
            <QrScanner
              key={branchId}
              branchId={branchId}
              services={data.services}
            />
            <details>
              <summary>Ingresar credencial manualmente</summary>
              <OperationForm
                endpoint="/api/gym/check-ins"
                fixed={{ branchId }}
                label="Validar credencial"
                fields={[
                  { name: "credential", label: "Código de credencial" },
                  {
                    name: "serviceId",
                    label: "Servicio",
                    type: "select",
                    options: serviceOptions,
                  },
                ]}
              />
            </details>
          </section>
          {q && (
            <section className="panel">
              <h2>Resultado de búsqueda</h2>
              {members.length ? (
                members.map((m) => (
                  <div key={m.id} className="panel">
                    <h3>
                      {m.firstName} {m.lastName}
                    </h3>
                    <p>{m.phone}</p>
                    <OperationForm
                      endpoint="/api/gym/check-ins"
                      fixed={{ branchId, memberId: m.id }}
                      label="Registrar ingreso"
                      fields={[
                        {
                          name: "serviceId",
                          label: "Servicio",
                          type: "select",
                          options: serviceOptions,
                        },
                      ]}
                    />
                  </div>
                ))
              ) : (
                <p>No se encontraron socios en esta sucursal.</p>
              )}
            </section>
          )}
          <section className="panel">
            <h2>Últimos ingresos</h2>
            {recent.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Socio</th>
                      <th>Servicio</th>
                      <th>Fecha y hora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.member.firstName} {c.member.lastName}
                        </td>
                        <td>{c.service.name}</td>
                        <td>
                          {formatDate(c.createdAt)} ·{" "}
                          {c.createdAt.toLocaleTimeString("es-EC", {
                            timeZone: "America/Guayaquil",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Todavía no hay ingresos registrados.</p>
            )}
          </section>
        </div>
        <section className="panel">
          <p className="eyebrow">VISITA SIN MEMBRESÍA</p>
          <h2>Pase del día</h2>
          <p className="muted">
            Registra el cobro y la visita en un solo paso.
          </p>
          <OperationForm
            endpoint="/api/gym/day-passes"
            financial
            fixed={{ branchId }}
            label="Cobrar pase del día"
            fields={[
              {
                name: "serviceId",
                label: "Servicio del pase",
                type: "select",
                options: serviceOptions,
              },
              { name: "amount", label: "Importe USD", type: "decimal" },
              {
                name: "paymentMethodId",
                label: "Método de pago",
                type: "select",
                options: data.methods.map((m) => ({
                  value: m.id,
                  label: m.name,
                })),
              },
            ]}
          />
        </section>
      </div>
    </>
  );
}
