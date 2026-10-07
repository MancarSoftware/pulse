import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { platformContext } from "@/modules/billing/platform-auth";
import { AppError } from "@/shared/errors";
import { db } from "@/infrastructure/db";
import { BillingShell } from "@/components/billing-shell";
import { OperationForm, type Field } from "@/components/operation-form";
import { Modal } from "@/components/modal";
import { formatMoney } from "@/shared/money";
import { formatDate } from "@/shared/dates";
import {
  subscriptionLabels,
  subscriptionStatus,
} from "@/modules/billing/status";
import { saasPeriodLabel } from "@/modules/billing/schedule";
import { Pagination } from "@/components/pagination";
import { pagination, type Search } from "@/modules/reports/queries";
export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  try {
    await platformContext(await headers());
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED")
      redirect("/login");
    if (error instanceof AppError && error.code === "FORBIDDEN")
      return (
        <BillingShell>
          <section className="panel">
            <h1>Acceso restringido</h1>
            <p>
              Esta sección pertenece a la administración de Gymora. Ser
              propietario de un gimnasio no concede acceso a pagos de otros
              clientes.
            </p>
          </section>
        </BillingShell>
      );
    throw error;
  }
  const search = await searchParams;
  const tab = String(search.tab ?? "payments");
  const pendingCount = await db.saaSPayment.count({
    where: { status: "PENDING" },
  });
  let content: React.ReactNode;
  if (tab === "plans") {
    const plans = await db.saaSPlan.findMany({
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    const fields: Field[] = [
      { name: "name", label: "Nombre del plan" },
      {
        name: "price",
        label: "Precio USD",
        type: "decimal",
        min: "0",
        value: "0.00",
      },
      {
        name: "durationMonths",
        label: "Período",
        type: "select",
        options: [
          { value: "1", label: "Mensual · 1 mes" },
          { value: "3", label: "Trimestral · 3 meses" },
          { value: "6", label: "Semestral · 6 meses" },
        ],
      },
      {
        name: "active",
        label: "Publicado",
        type: "checkbox",
        value: "false",
        hint: "Un plan publicado debe tener un precio mayor que cero.",
      },
    ];
    content = (
      <section className="panel">
        <div className="section-heading">
          <h2>Planes de Gymora</h2>
          <Modal title="Nuevo plan SaaS" trigger="Nuevo plan">
            <OperationForm endpoint="/api/platform/plans" fields={fields} />
          </Modal>
        </div>
        <p className="muted">
          Estos planes son para los gimnasios que usan el sistema. Despublicar
          un plan conserva sus pagos y contratos.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Precio</th>
                <th>Período</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{formatMoney(p.price)}</td>
                  <td>{saasPeriodLabel(p.durationMonths)}</td>
                  <td>{p.active ? "Publicado" : "Borrador"}</td>
                  <td>
                    <Modal title="Editar plan SaaS" trigger="Editar">
                      <OperationForm
                        endpoint="/api/platform/plans"
                        fixed={{ id: p.id }}
                        fields={fields.map((f) => ({
                          ...f,
                          value:
                            f.name === "name"
                              ? p.name
                              : f.name === "price"
                                ? p.price.toFixed(2)
                                : f.name === "durationMonths"
                                  ? String(p.durationMonths)
                                  : String(p.active),
                        }))}
                      />
                    </Modal>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  } else if (tab === "settings") {
    const settings = await db.saaSBillingSettings.findUniqueOrThrow({
      where: { id: "main" },
    });
    content = (
      <section className="panel">
        <h2>Política y datos de pago</h2>
        <p className="notice warning">
          Cobro automático pendiente de configuración. Falta conectar un
          proveedor de pagos recurrentes; actualmente los pagos requieren
          verificación manual.
        </p>
        <p className="notice">
          Prueba privada de dos días para nuevos gimnasios. La gracia empieza
          cuando vence una suscripción ya pagada: un día calendario.
          Renovaciones el 30 (último día en febrero).
        </p>
        <OperationForm
          endpoint="/api/platform/settings"
          fixed={{ graceDays: 1 }}
          fields={[
            {
              name: "paymentInstructions",
              label: "Instrucciones para pagar",
              type: "textarea",
              maxLength: 2000,
              required: false,
              value: settings.paymentInstructions,
              hint: "Indica banco, titular, cuenta y cómo identificar el pago. No escribas contraseñas ni credenciales.",
            },
          ]}
        />
      </section>
    );
  } else if (tab === "gyms") {
    const total = await db.organization.count();
    const p = pagination(search, 12);
    const rows = await db.organization.findMany({
      orderBy: { createdAt: "desc" },
      take: p.take,
      skip: p.skip,
      include: { subscription: { include: { plan: true } } },
    });
    content = (
      <section className="panel">
        <h2>Gimnasios y acceso</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gimnasio</th>
                <th>Plan</th>
                <th>Estado actual</th>
                <th>Pagado hasta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = subscriptionStatus(r.subscription);
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.subscription?.plan?.name ?? "Sin pago aprobado"}</td>
                    <td>
                      <span
                        className={`status ${s.state === "ACTIVE" ? "success" : "warning"}`}
                      >
                        {subscriptionLabels[s.state]}
                      </span>
                    </td>
                    <td>
                      {r.subscription?.paidUntil
                        ? formatDate(
                            new Date(r.subscription.paidUntil.getTime() - 1),
                          )
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          path="/platform"
          search={search}
          page={p.page}
          pageSize={12}
          total={total}
        />
      </section>
    );
  } else {
    const filter = String(search.status ?? "PENDING");
    const where =
      filter === "ALL"
        ? {}
        : {
            status:
              filter === "APPROVED"
                ? ("APPROVED" as const)
                : filter === "REJECTED"
                  ? ("REJECTED" as const)
                  : ("PENDING" as const),
          };
    const p = pagination(search, 12);
    const [total, payments] = await Promise.all([
      db.saaSPayment.count({ where }),
      db.saaSPayment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: p.take,
        skip: p.skip,
        include: { organization: { select: { name: true } } },
      }),
    ]);
    content = (
      <section className="panel">
        <div className="section-heading">
          <h2>Revisión de pagos</h2>
          <form className="billing-filter">
            <input type="hidden" name="tab" value="payments" />
            <label>
              Estado
              <select name="status" defaultValue={filter}>
                <option value="PENDING">Pendientes</option>
                <option value="APPROVED">Aprobados</option>
                <option value="REJECTED">Rechazados</option>
                <option value="ALL">Todos</option>
              </select>
            </label>
            <button className="button secondary">Filtrar</button>
          </form>
        </div>
        <p className="muted">
          Comprueba el dinero en tu cuenta o el recibo de efectivo. La
          referencia informada por el cliente no constituye una confirmación
          bancaria.
        </p>
        {!payments.length && (
          <div className="empty">
            <h3>No hay pagos en esta vista</h3>
            <p>Los pagos informados aparecerán aquí para su revisión.</p>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Gimnasio / fecha</th>
                <th>Plan / importe</th>
                <th>Referencia informada</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.organization.name}
                    <small className="billing-reference">
                      {formatDate(p.createdAt)}
                    </small>
                  </td>
                  <td>
                    {p.planName}
                    <small className="billing-reference">
                      {formatMoney(p.amount)} · {p.durationMonths} mes(es)
                    </small>
                  </td>
                  <td>
                    {p.reference}
                    <small className="billing-reference">
                      {p.method === "TRANSFER" ? "Transferencia" : "Efectivo"}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </small>
                  </td>
                  <td>
                    {p.status === "PENDING"
                      ? "En revisión"
                      : p.status === "APPROVED"
                        ? "Aprobado"
                        : "Rechazado"}
                    {p.reviewNote && (
                      <small className="billing-reference">
                        {p.reviewNote}
                      </small>
                    )}
                  </td>
                  <td>
                    {p.status === "PENDING" ? (
                      <div className="billing-review-actions">
                        <Modal
                          title={`Aprobar pago · ${p.organization.name}`}
                          trigger="Revisar y aprobar"
                        >
                          <p className="notice">
                            Verifica {formatMoney(p.amount)} para {p.planName}.
                            Aprobar extiende el acceso; no cobra dinero desde
                            esta pantalla.
                          </p>
                          <OperationForm
                            endpoint="/api/platform/payments"
                            label="Aprobar y activar"
                            fixed={{ paymentId: p.id, decision: "APPROVE" }}
                            fields={[
                              {
                                name: "verifiedReference",
                                label: "Referencia verificada",
                                maxLength: 160,
                                hint: "Identificador único del movimiento recibido, incluyendo banco/cuenta. No reutilices un movimiento para dos pagos.",
                              },
                              {
                                name: "note",
                                label: "Detalle de la verificación",
                                type: "textarea",
                                maxLength: 1000,
                                required: true,
                              },
                              {
                                name: "fundsReceived",
                                label:
                                  "Confirmé que recibí el importe completo",
                                type: "checkbox",
                                required: true,
                                value: "false",
                              },
                            ]}
                          />
                        </Modal>
                        <Modal title="Rechazar pago" trigger="Rechazar">
                          <OperationForm
                            endpoint="/api/platform/payments"
                            label="Confirmar rechazo"
                            fixed={{ paymentId: p.id, decision: "REJECT" }}
                            fields={[
                              {
                                name: "note",
                                label: "Motivo del rechazo",
                                type: "textarea",
                                maxLength: 1000,
                                required: true,
                              },
                            ]}
                          />
                        </Modal>
                      </div>
                    ) : (
                      <span className="muted">
                        {p.verifiedReference ?? "Sin activación"}
                        {p.reviewedAt && (
                          <small className="billing-reference">
                            Revisado el {formatDate(p.reviewedAt)}
                          </small>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          path="/platform"
          search={search}
          page={p.page}
          pageSize={12}
          total={total}
        />
      </section>
    );
  }
  return (
    <BillingShell platformAdmin>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN DE LA PLATAFORMA</p>
          <h1>Suscripciones Gymora</h1>
          <p className="muted">
            {pendingCount} pagos pendientes de verificar. Los cobros de los
            socios permanecen dentro de cada gimnasio.
          </p>
        </div>
      </div>
      <nav className="tabs" aria-label="Administración SaaS">
        {[
          { key: "payments", label: "Pagos" },
          { key: "gyms", label: "Gimnasios" },
          { key: "plans", label: "Planes SaaS" },
          { key: "settings", label: "Datos de pago" },
        ].map((item) => (
          <Link
            key={item.key}
            href={`/platform?tab=${item.key}`}
            aria-current={tab === item.key ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {content}
    </BillingShell>
  );
}
