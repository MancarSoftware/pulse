import { notFound } from "next/navigation";
import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { db } from "@/infrastructure/db";
import { authorize } from "@/modules/auth/permissions";
import { queryScope } from "@/modules/reports/queries";
import { formatMoney } from "@/shared/money";
import { formatDate } from "@/shared/dates";
export default async function Receipt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "payments:write");
  const entry = await db.ledgerEntry.findFirst({
    where: { ...queryScope(ctx), id: (await params).id },
    include: {
      branch: true,
      paymentMethod: true,
      membership: {
        include: { member: { select: { firstName: true, lastName: true } } },
      },
      sale: { include: { lines: true } },
      dayPass: { include: { service: true } },
      reversedBy: { select: { id: true } },
    },
  });
  if (
    !entry ||
    ((entry.kind === "EXPENSE" || entry.kind === "CORRECTION") &&
      ctx.role === "RECEPTIONIST")
  )
    notFound();
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
  });
  return (
    <section className="panel narrow">
      <p className="eyebrow">GYMORA · RECIBO INTERNO</p>
      <h1>{organization.name}</h1>
      <p>
        {entry.branch.name} · {formatDate(entry.occurredAt)}
      </p>
      <p className="receipt">Referencia {entry.reference}</p>
      <p>
        {entry.kind} · {entry.paymentMethod.name}
      </p>
      {entry.membership && (
        <p>
          {entry.membership.member.firstName} {entry.membership.member.lastName}
          <br />
          {entry.membership.planName}
        </p>
      )}
      {entry.sale?.lines.map((l) => (
        <div className="cart-line" key={l.id}>
          <span>
            {l.quantity} × {l.name}
          </span>
          <span>{formatMoney(l.total)}</span>
        </div>
      ))}
      {entry.dayPass && <p>Pase del día · {entry.dayPass.service.name}</p>}
      <div className="total">
        <span>Total USD</span>
        <span>{formatMoney(entry.amount)}</span>
      </div>
      {entry.reversedBy.length > 0 && (
        <p className="notice danger">Este cobro fue revertido.</p>
      )}
      <p className="muted">
        Comprobante interno de registro. No constituye factura fiscal.
      </p>
      <Link href="/dashboard">Volver al resumen</Link>
    </section>
  );
}
