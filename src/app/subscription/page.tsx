import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { BillingShell } from "@/components/billing-shell";
import { db } from "@/infrastructure/db";
import { ownerBilling } from "@/modules/billing/service";
import { subscriptionAccess } from "@/modules/billing/access";
import { subscriptionLabels } from "@/modules/billing/status";
import { formatDate, formatDateTime } from "@/shared/dates";
import { formatMoney } from "@/shared/money";
import { Modal } from "@/components/modal";
import { OperationForm } from "@/components/operation-form";
import { saasPeriodLabel } from "@/modules/billing/schedule";
import { Pagination } from "@/components/pagination";
import { pagination, type Search } from "@/modules/reports/queries";
export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext({ allowSuspended: true });
  const status = await subscriptionAccess(ctx.organizationId);
  const platformAdmin = !!(
    await db.platformAdmin.findUnique({ where: { userId: ctx.userId } })
  )?.active;
  const organization = await db.organization.findUniqueOrThrow({
    where: { id: ctx.organizationId },
    select: { name: true },
  });
  if (ctx.role !== "OWNER")
    return (
      <BillingShell platformAdmin={platformAdmin}>
        <section className="panel">
          <h1>
            {status.allowed ? "Suscripción del gimnasio" : "Acceso suspendido"}
          </h1>
          <p>
            El propietario de {organization.name} debe revisar la suscripción de
            Gymora. Tus datos se conservan.
          </p>
          {status.allowed && (
            <Link className="button" href="/dashboard">
              Volver al gimnasio
            </Link>
          )}
        </section>
      </BillingShell>
    );
  const search = await searchParams;
  const p = pagination(search, 12);
  const data = await ownerBilling(ctx, p.page);
  const pending = data.pendingPayments > 0;
  const canSubmit = !!data.settings.paymentInstructions.trim() && !pending;
  return (
    <BillingShell platformAdmin={platformAdmin}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EL SISTEMA DE TU GIMNASIO</p>
          <h1>Mi suscripción</h1>
          <p className="muted">
            {organization.name} · Acceso a Gymora, separado de las membresías de
            tus socios.
          </p>
        </div>
        {status.allowed && (
          <Link className="button secondary" href="/dashboard">
            Volver al gimnasio →
          </Link>
        )}
      </div>
      <section
        className={`panel billing-summary ${status.allowed ? "" : "billing-suspended"}`}
        aria-label="Estado de suscripción"
      >
        <div>
          <span
            className={`status ${status.state === "ACTIVE" ? "success" : "warning"}`}
          >
            {subscriptionLabels[status.state]}
          </span>
          <h2>
            {data.subscription?.plan?.name ??
              (status.state === "TRIAL"
                ? "Tu prueba privada de Gymora"
                : "Activa un plan para continuar")}
          </h2>
          <p>
            {data.subscription?.paidUntil
              ? `Pagada hasta el ${formatDate(new Date(data.subscription.paidUntil.getTime() - 1))}, inclusive.`
              : status.state === "TRIAL"
                ? `Puedes usar el sistema hasta el ${formatDateTime(status.endAt!)} (hora de Ecuador).`
                : "Tu prueba ha finalizado o no hay un período pagado vigente. Activa un plan para continuar con tus mismos datos."}
          </p>
          {data.subscription?.paidUntil && (
            <p>Próxima renovación: {formatDate(data.subscription.paidUntil)}</p>
          )}
          {status.state === "GRACE" && (
            <p className="notice warning">
              Renueva antes de finalizar el{" "}
              {formatDate(new Date(status.graceEndsAt!.getTime() - 1))} para
              evitar la suspensión.
            </p>
          )}
          {!status.allowed && (
            <p className="muted">
              Los registros de tu gimnasio se conservan. Puedes informar el pago
              y consultar su revisión desde aquí.
            </p>
          )}
        </div>
        <div className="billing-policy">
          <strong>Prueba privada de 2 días</strong>
          <span>
            48 horas desde que creas tu gimnasio. Al pagar, conservas esta misma
            cuenta y tus datos.
          </span>
          <span>
            {data.subscription?.graceDays ?? data.settings.graceDays} día de
            gracia después de una suscripción pagada
          </span>
          <span>
            Un comprobante informado no confirma que el dinero fue recibido.
          </span>
        </div>
      </section>
      {pending && (
        <p className="notice warning" role="status">
          Tu pago está pendiente de revisión. La suscripción se actualizará
          cuando Gymora confirme que recibió el dinero.
        </p>
      )}
      <section className="panel">
        <h2>Cómo pagar</h2>
        <p className="notice warning">
          Cobro automático pendiente de configuración. Por ahora, realiza el
          pago e informa su referencia para verificación.
        </p>
        {data.settings.paymentInstructions ? (
          <p className="billing-instructions">
            {data.settings.paymentInstructions}
          </p>
        ) : (
          <p className="notice warning">
            Gymora todavía debe publicar sus instrucciones de pago. No se han
            configurado datos bancarios.
          </p>
        )}
        <p className="muted">
          Realiza el pago del plan elegido e informa su referencia. Gymora
          verifica el movimiento y te muestra el resultado aquí.
        </p>
      </section>
      <p className="notice">
        Renovación el 30 cada 1, 3 o 6 meses; en febrero, el último día. La
        primera activación conserva el período completo y añade sin costo los
        días necesarios para alinearlo. Un día de gracia; después, acceso
        suspendido hasta confirmar el pago.
      </p>
      <section aria-label="Planes del sistema">
        <div className="section-heading">
          <h2>Elige tu suscripción</h2>
          <span className="muted">USD · cobro manual</span>
        </div>
        <div className="billing-plans">
          {!data.plans.length && (
            <div className="panel empty">
              <h3>Planes pendientes de publicación</h3>
              <p>Los precios deben definirse antes de habilitar los pagos.</p>
            </div>
          )}
          {data.plans.map((plan) => (
            <article className="panel billing-plan" key={plan.id}>
              <span className="eyebrow">
                {saasPeriodLabel(plan.durationMonths).toUpperCase()}
              </span>
              <h3>{plan.name}</h3>
              <p className="billing-price">
                {formatMoney(plan.price)}
                <small>
                  {" "}
                  /{" "}
                  {plan.durationMonths === 1
                    ? "mes"
                    : `${plan.durationMonths} meses`}
                </small>
              </p>
              <p className="muted">
                Acceso al sistema de gestión del gimnasio durante{" "}
                {plan.durationMonths} mes(es) calendario.
              </p>
              {plan.durationMonths > 1 && (
                <p className="muted">
                  Equivale a{" "}
                  {formatMoney(plan.price.dividedBy(plan.durationMonths))} por
                  mes; pago del período completo.
                </p>
              )}
              {canSubmit ? (
                <Modal
                  title={`Informar pago · ${plan.name}`}
                  trigger="Informar pago"
                >
                  <p className="notice">
                    Importe a verificar: {formatMoney(plan.price)}. El acceso se
                    activa después de la aprobación.
                  </p>
                  <OperationForm
                    endpoint="/api/subscription"
                    financial
                    label="Enviar a revisión"
                    fixed={{
                      planId: plan.id,
                      expectedPrice: plan.price.toFixed(2),
                    }}
                    fields={[
                      {
                        name: "method",
                        label: "Método de pago",
                        type: "select",
                        options: [
                          { value: "TRANSFER", label: "Transferencia" },
                          { value: "CASH", label: "Efectivo" },
                        ],
                      },
                      {
                        name: "reference",
                        label: "Referencia del pago",
                        maxLength: 160,
                        hint: "Número del movimiento o recibo; no incluyas claves bancarias.",
                      },
                      {
                        name: "notes",
                        label: "Observaciones",
                        type: "textarea",
                        maxLength: 1000,
                        required: false,
                      },
                    ]}
                  />
                </Modal>
              ) : (
                <button className="button" disabled>
                  {pending ? "Pago en revisión" : "Pago aún no habilitado"}
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2>Mis pagos</h2>
        {!data.payments.length ? (
          <p className="muted">
            Todavía no has informado pagos de tu suscripción.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha / referencia</th>
                  <th>Plan</th>
                  <th>Importe</th>
                  <th>Revisión</th>
                  <th>Período aprobado</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {formatDate(p.createdAt)}
                      <small className="billing-reference">{p.reference}</small>
                    </td>
                    <td>{p.planName}</td>
                    <td>{formatMoney(p.amount)}</td>
                    <td>
                      <span
                        className={`status ${p.status === "APPROVED" ? "success" : p.status === "PENDING" ? "warning" : "neutral"}`}
                      >
                        {p.status === "APPROVED"
                          ? "Aprobado"
                          : p.status === "PENDING"
                            ? "En revisión"
                            : "Rechazado"}
                      </span>
                      {p.reviewNote && (
                        <small className="billing-reference">
                          {p.reviewNote}
                        </small>
                      )}
                    </td>
                    <td>
                      {p.periodStart && p.periodEnd
                        ? `${formatDate(p.periodStart)} – ${formatDate(new Date(p.periodEnd.getTime() - 1))}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          path="/subscription"
          search={search}
          page={p.page}
          pageSize={12}
          total={data.totalPayments}
        />
      </section>
    </BillingShell>
  );
}
