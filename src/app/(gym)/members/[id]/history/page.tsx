import Link from "next/link";
import { notFound } from "next/navigation";
import { pageContext } from "@/lib/page-context";
import { db } from "@/infrastructure/db";
import { queryScope, pagination, type Search } from "@/modules/reports/queries";
import { Pagination } from "@/components/pagination";
import { formatDate, membershipStatus } from "@/shared/dates";
import { formatMoney } from "@/shared/money";
import { membershipLabels } from "@/shared/presentation";
export default async function MemberHistory({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  if (ctx.role === "TRAINER") notFound();
  const { id } = await params;
  const search = await searchParams;
  const { page, skip, take } = pagination(search);
  const member = await db.member.findFirst({
    where: { ...queryScope(ctx), id },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) notFound();
  const where = { organizationId: ctx.organizationId, memberId: id };
  const tab = String(search.tab ?? "memberships");
  let count: number;
  let rows: React.ReactNode;
  if (tab === "payments") {
    const filter = {
      organizationId: ctx.organizationId,
      membership: { memberId: id },
    };
    const [entries, total] = await Promise.all([
      db.ledgerEntry.findMany({
        where: filter,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { paymentMethod: true },
      }),
      db.ledgerEntry.count({ where: filter }),
    ]);
    count = total;
    rows = (
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Método</th>
            <th>Importe</th>
            <th>Recibo</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{formatDate(e.createdAt)}</td>
              <td>{e.paymentMethod.name}</td>
              <td>{formatMoney(e.amount)}</td>
              <td>
                <Link href={`/receipts/${e.id}`}>Abrir recibo</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (tab === "attendance") {
    const [entries, total] = await Promise.all([
      db.checkIn.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: { service: true, branch: true },
      }),
      db.checkIn.count({ where }),
    ]);
    count = total;
    rows = (
      <table>
        <thead>
          <tr>
            <th>Fecha y hora</th>
            <th>Servicio</th>
            <th>Sucursal</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>
                {e.createdAt.toLocaleString("es-EC", {
                  timeZone: "America/Guayaquil",
                })}
              </td>
              <td>{e.service.name}</td>
              <td>{e.branch.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else {
    const [entries, total] = await Promise.all([
      db.membership.findMany({
        where,
        skip,
        take,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      db.membership.count({ where }),
    ]);
    count = total;
    rows = (
      <table>
        <thead>
          <tr>
            <th>Plan contratado</th>
            <th>Inicio</th>
            <th>Último día</th>
            <th>Estado</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>
                {e.planName}
                <br />
                <small>{e.serviceNames.join(", ")}</small>
              </td>
              <td>{formatDate(e.startAt)}</td>
              <td>{formatDate(new Date(e.endAt.getTime() - 1))}</td>
              <td>{membershipLabels[membershipStatus(e)]}</td>
              <td>{formatMoney(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return (
    <>
      <Link href={`/members/${id}`}>← Volver al perfil</Link>
      <div className="page-heading">
        <h1>
          Historial de {member.firstName} {member.lastName}
        </h1>
      </div>
      <nav className="tabs">
        <Link href={`/members/${id}/history`}>Membresías</Link>
        <Link href={`/members/${id}/history?tab=payments`}>Pagos</Link>
        <Link href={`/members/${id}/history?tab=attendance`}>Asistencia</Link>
      </nav>
      <section className="panel">
        <div className="table-wrap">{rows}</div>
        {count === 0 && (
          <p className="empty">No hay registros en este historial.</p>
        )}
        <Pagination
          page={page}
          total={count}
          search={search}
          path={`/members/${id}/history`}
        />
      </section>
    </>
  );
}
