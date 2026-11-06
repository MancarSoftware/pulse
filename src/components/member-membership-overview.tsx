import Link from "next/link";
import { db } from "@/infrastructure/db";
import { formatDate, dayStart, localDate, remainingDays } from "@/shared/dates";
export async function MemberMembershipOverview({
  organizationId,
  memberId,
  active,
  canManage,
  canPause,
}: {
  organizationId: string;
  memberId: string;
  active: boolean;
  canManage: boolean;
  canPause: boolean;
}) {
  const now = new Date();
  const where = { organizationId, memberId };
  const [current, next, usedToday] = await Promise.all([
    db.membership.findFirst({
      where: {
        ...where,
        OR: [
          { state: "FROZEN" },
          { state: "VALID", startAt: { lte: now }, endAt: { gt: now } },
        ],
      },
      orderBy: { startAt: "asc" },
    }),
    db.membership.findFirst({
      where: { ...where, state: "VALID", startAt: { gt: now } },
      orderBy: { startAt: "asc" },
    }),
    db.checkIn.findFirst({
      where: { ...where, createdAt: { gte: dayStart(localDate(now)) } },
      select: { id: true },
    }),
  ]);
  const frozen = current?.state === "FROZEN";
  const title = !active
    ? "Socio deshabilitado"
    : frozen
      ? "Acceso pausado"
      : current
        ? usedToday
          ? "Ingreso de hoy registrado"
          : "Membresía vigente"
        : next
          ? "Membresía programada"
          : "Sin acceso vigente";
  return (
    <section
      className="member-membership-overview"
      aria-label="Resumen de membresía"
    >
      <div>
        <span
          className={`status ${active && current && !frozen ? "success" : "warning"}`}
        >
          {title}
        </span>
        <h2>
          {current?.planName ??
            next?.planName ??
            "Revisa la membresía del socio"}
        </h2>
        {!active ? (
          <p>
            Habilita el perfil antes de registrar un ingreso. Sus contratos e
            historial se conservan.
          </p>
        ) : frozen && current ? (
          <p>
            {remainingDays(current.endAt, current.frozenAt ?? now)} días
            conservados. Al reactivar se recalculan las fechas y las
            renovaciones futuras ya pagadas.
          </p>
        ) : current ? (
          <p>
            Acceso hasta finalizar el{" "}
            <strong>{formatDate(new Date(current.endAt.getTime() - 1))}</strong>
            . {remainingDays(current.endAt)} días disponibles, incluido hoy.
          </p>
        ) : next ? (
          <p>
            El acceso empieza el {formatDate(next.startAt)}. Todavía no permite
            ingresar.
          </p>
        ) : (
          <p>Registra un pago de membresía para habilitar el acceso.</p>
        )}
        {current && (
          <p>
            Servicios: {current.serviceNames.join(", ")}. Un ingreso diario en
            la sucursal contratada.
          </p>
        )}
        {!frozen && current && next && (
          <p>
            Renovación ya registrada: {next.planName}, desde el{" "}
            {formatDate(next.startAt)}.
          </p>
        )}
      </div>
      <div className="member-overview-actions">
        {(frozen ? canPause : canManage) && (
          <Link
            className="button secondary"
            href={frozen ? "#pausar-membresia" : "#registrar-membresia"}
          >
            {frozen
              ? "Reactivar membresías"
              : current
                ? "Renovar membresía"
                : "Registrar membresía"}
          </Link>
        )}
        {frozen && !canPause && (
          <p>La administración del gimnasio debe reactivar la membresía.</p>
        )}
        <Link href={`/members/${memberId}/history`}>
          Ver historial completo →
        </Link>
      </div>
    </section>
  );
}
