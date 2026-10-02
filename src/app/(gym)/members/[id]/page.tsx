import Link from "next/link";
import Image from "next/image";
import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { pageContext } from "@/lib/page-context";
import { getMember } from "@/modules/members/service";
import { lookups } from "@/modules/reports/queries";
import { db } from "@/infrastructure/db";
import { can } from "@/modules/auth/permissions";
import { OperationForm } from "@/components/operation-form";
import { Modal } from "@/components/modal";
import { MemberPhotoUpload } from "@/components/member-photo";
import { formatDate, membershipStatus, renewalWindow } from "@/shared/dates";
import { formatMoney } from "@/shared/money";
import { AppError } from "@/shared/errors";
import { membershipLabels, durationLabel } from "@/shared/presentation";
import { resolveWhatsAppConfig } from "@/modules/notifications/whatsapp-connect";
import { ecuadorWhatsAppPhone } from "@/modules/notifications/whatsapp-content";
export default async function MemberProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await pageContext();
  if (ctx.role === "TRAINER") notFound();
  const member = await getMember(ctx, (await params).id).catch((error) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const data = await lookups(ctx);
  const payments = await db.ledgerEntry.findMany({
    where: {
      organizationId: ctx.organizationId,
      membership: { memberId: member.id },
    },
    include: { paymentMethod: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const qr = await QRCode.toDataURL(member.credential, {
    width: 220,
    margin: 2,
  });
  const latest = member.memberships.find((m) => m.state !== "CANCELLED");
  const whatsappReady = !!(await resolveWhatsAppConfig(ctx.organizationId));
  const notificationLabels = {
    PENDING: "Pendiente",
    PROCESSING: "Procesando",
    ACCEPTED: "Aceptado por WhatsApp",
    FAILED: "Falló el envío",
    REVIEW: "Revisión necesaria",
    CANCELLED: "Cancelado",
  };
  return (
    <>
      <div className="inline">
        <Link href="/members">← Todos los socios</Link>
        <Link href={`/members/${member.id}/history`}>Historial completo →</Link>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PERFIL DEL SOCIO</p>
          <h1>
            {member.firstName} {member.lastName}
          </h1>
          <p className="muted">
            {member.phone} · {member.email || "Sin email"} · Alta{" "}
            {formatDate(member.createdAt)}
          </p>
        </div>
        {can(ctx.role, "members:write") && (
          <Modal title="Editar socio" trigger="Editar perfil">
            <OperationForm
              endpoint={`/api/gym/members/${member.id}`}
              method="PATCH"
              fields={[
                {
                  name: "firstName",
                  label: "Nombres",
                  value: member.firstName,
                },
                {
                  name: "lastName",
                  label: "Apellidos",
                  value: member.lastName,
                },
                {
                  name: "phone",
                  label: "Teléfono",
                  value: member.phone,
                  type: "tel",
                  numericOnly: true,
                  maxLength: 10,
                  pattern: "[0-9]{1,10}",
                  hint: "Solo números. Máximo 10 dígitos.",
                },
                {
                  name: "email",
                  label: "Email",
                  type: "email",
                  hint: "Correo válido con @, por ejemplo nombre@dominio.com. Opcional.",
                  value: member.email ?? "",
                  required: false,
                },
                {
                  name: "branchId",
                  label: "Sucursal de origen",
                  type: "select",
                  value: member.branchId,
                  options: data.branches.map((b) => ({
                    value: b.id,
                    label: b.name,
                  })),
                },
                {
                  name: "whatsappOptIn",
                  label:
                    "El socio autorizó recibir su membresía y QR por WhatsApp",
                  type: "checkbox",
                  value: String(Boolean(member.whatsappConsentAt)),
                  hint: "Si cambias el teléfono, se retira la autorización. Guarda el nuevo número y confirma su autorización nuevamente.",
                },
                {
                  name: "active",
                  label: "Socio habilitado",
                  type: "checkbox",
                  value: String(member.active),
                },
                {
                  name: "notes",
                  label: "Notas",
                  type: "textarea",
                  value: member.notes,
                },
                {
                  name: "emergencyContact",
                  label: "Contacto de emergencia (opcional)",
                  required: false,
                  value: member.emergencyContact ?? "",
                },
              ]}
            />
          </Modal>
        )}
      </div>
      <div className="split">
        <div>
          <section className="panel">
            <h2>Membresías contratadas</h2>
            {member.memberships.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Plan</th>
                      <th>Inicio / último día</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {member.memberships.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <strong>{m.planName}</strong>
                          {m.durationMonths && (
                            <>
                              <br />
                              <small>{durationLabel(m.durationMonths)}</small>
                            </>
                          )}
                          <br />
                          <small>{m.serviceNames.join(", ")}</small>
                          <br />
                          {formatMoney(m.amount)}
                        </td>
                        <td>
                          {formatDate(m.startAt)}
                          <br />
                          {formatDate(new Date(m.endAt.getTime() - 1))}
                        </td>
                        <td>{membershipLabels[membershipStatus(m)]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                Aún no tiene una membresía. Registra el primer cobro para
                habilitar su acceso.
              </p>
            )}
          </section>
          <section className="panel">
            <h2>Historial de pagos</h2>
            {payments.length ? (
              payments.map((p) => (
                <div className="cart-line" key={p.id}>
                  <div>
                    {formatDate(p.createdAt)} · {p.paymentMethod.name}
                    <br />
                    <Link className="receipt" href={`/receipts/${p.id}`}>
                      {p.reference}
                    </Link>
                  </div>
                  <strong>{formatMoney(p.amount)}</strong>
                </div>
              ))
            ) : (
              <p className="muted">Todavía no hay pagos registrados.</p>
            )}
          </section>
          <section className="panel">
            <h2>Últimos ingresos</h2>
            {member.checkIns.length ? (
              member.checkIns.map((c) => (
                <div className="cart-line" key={c.id}>
                  <span>{formatDate(c.createdAt)}</span>
                  <span>{c.service.name}</span>
                </div>
              ))
            ) : (
              <p className="muted">Los ingresos validados aparecerán aquí.</p>
            )}
          </section>
        </div>
        <div>
          {can(ctx.role, "payments:write") && (
            <section className="panel">
              <p className="eyebrow">RENOVACIÓN / NUEVO CONTRATO</p>
              <h2>Registrar membresía</h2>
              <p className="muted">
                Elige 1, 3 o 6 meses calendario. Incluye fines de semana y
                acceso hasta finalizar el último día. Una renovación anticipada
                comienza al terminar el contrato vigente.
              </p>
              {data.plans.length && data.methods.length ? (
                <OperationForm
                  endpoint="/api/gym/renewals"
                  financial
                  fixed={{
                    memberId: member.id,
                    branchId: member.branchId,
                    expectedLatestId: latest?.id ?? null,
                  }}
                  label="Confirmar cobro y membresía"
                  fields={[
                    {
                      name: "planId",
                      label: "Plan",
                      type: "select",
                      hint: "Selecciona una duración y revisa las fechas antes de cobrar.",
                      options: data.plans.map((p) => ({
                        value: p.id,
                        label: `${durationLabel(p.durationMonths!)} · ${p.name} · ${formatMoney(p.price)}`,
                        detail: (() => {
                          const period = renewalWindow(
                            p.durationMonths!,
                            latest?.endAt ?? null,
                          );
                          return `Acceso desde ${formatDate(period.startAt)} hasta ${formatDate(new Date(period.endAt.getTime() - 1))}, inclusive. Servicios: ${p.services.map((s) => s.service.name).join(", ")}.`;
                        })(),
                      })),
                    },
                    {
                      name: "expectedPrice",
                      label: "Confirma el importe USD",
                      hint: "Debe coincidir con el precio del plan.",
                      type: "decimal",
                    },
                    {
                      name: "paymentMethodId",
                      label: "Forma de pago",
                      type: "select",
                      options: data.methods.map((m) => ({
                        value: m.id,
                        label: m.name,
                      })),
                    },
                  ]}
                />
              ) : (
                <p>Configura un plan y un método de pago para continuar.</p>
              )}
            </section>
          )}
          {can(ctx.role, "catalog:write") && latest && (
            <section className="panel">
              <h2>Pausar o reactivar</h2>
              <p className="muted">
                La pausa conserva días de calendario y desplaza también los
                contratos futuros. No genera devoluciones.
              </p>
              <OperationForm
                endpoint="/api/gym/membership-state"
                fixed={{
                  memberId: member.id,
                  action: latest.state === "FROZEN" ? "resume" : "freeze",
                }}
                label={
                  latest.state === "FROZEN"
                    ? "Reactivar membresías"
                    : "Congelar membresías"
                }
                fields={[
                  {
                    name: "reason",
                    label: "Motivo de la pausa o reactivación",
                  },
                ]}
              />
            </section>
          )}
          <section className="panel">
            <h2>Credencial de acceso</h2>
            <p className="muted">
              Un ingreso por día, durante los meses calendario contratados. El
              mismo QR sirve al renovar; la vigencia y los servicios se
              comprueban al escanear.
            </p>
            {member.photoKey && (
              <Image
                src={`/api/gym/members/${member.id}/photo`}
                alt={`Foto de ${member.firstName}`}
                width={160}
                height={160}
                unoptimized
              />
            )}
            <Image
              className="qr"
              src={qr}
              alt={`Credencial QR de ${member.firstName}`}
              width={220}
              height={220}
              unoptimized
            />
            <p className="muted">
              Identificador aleatorio. El acceso se valida en cada ingreso.
            </p>
            <p className="receipt">{member.credential}</p>
            {can(ctx.role, "members:write") && (
              <MemberPhotoUpload memberId={member.id} />
            )}
          </section>
          <section className="panel" aria-label="Notificaciones de WhatsApp">
            <h2>Membresía por WhatsApp</h2>
            <p className="muted">
              {member.whatsappConsentAt
                ? "El socio autorizó recibir mensajes."
                : "Sin autorización. Actívala en Editar perfil cuando el socio lo confirme."}
            </p>
            {!ecuadorWhatsAppPhone(member.phone) && (
              <p className="notice warning">
                Se requiere un celular ecuatoriano de 10 dígitos que comience en
                09.
              </p>
            )}
            {!whatsappReady && (
              <p className="notice warning">
                WhatsApp pendiente de configuración. Los mensajes no se enviarán
                hasta conectar Meta. El QR está disponible arriba.
              </p>
            )}
            {member.whatsappMessages.map((message) => (
              <div className="notification-row" key={message.id}>
                <strong>
                  {message.kind === "WELCOME" ? "Bienvenida" : "Renovación"}
                </strong>
                <span className="status">
                  {notificationLabels[message.status]}
                </span>
                <small>
                  {formatDate(message.createdAt)}
                  {message.lastError ? ` · ${message.lastError}` : ""}
                </small>
                {message.status === "ACCEPTED" && (
                  <small>
                    Meta aceptó el envío; esto no confirma que el socio lo haya
                    recibido o leído.
                  </small>
                )}
                {message.status === "REVIEW" &&
                  can(ctx.role, "payments:write") && (
                    <Modal
                      title="Revisar antes de reenviar"
                      trigger="Revisar envío"
                    >
                      <p className="notice warning">
                        WhatsApp pudo haber recibido el mensaje. Comprueba el
                        envío con Meta o con el socio para evitar duplicarlo.
                      </p>
                      <OperationForm
                        endpoint="/api/gym/whatsapp-retry"
                        fixed={{ messageId: message.id }}
                        label="Confirmar reenvío"
                        fields={[
                          {
                            name: "verifiedNotSent",
                            label:
                              "Verifiqué que el mensaje no fue recibido por WhatsApp",
                            type: "checkbox",
                            value: "false",
                          },
                        ]}
                      />
                    </Modal>
                  )}
                {message.status === "FAILED" &&
                  can(ctx.role, "payments:write") && (
                    <OperationForm
                      endpoint="/api/gym/whatsapp-retry"
                      fields={[]}
                      fixed={{ messageId: message.id }}
                      label="Reintentar envío"
                    />
                  )}
              </div>
            ))}
            {!member.whatsappMessages.length && (
              <p className="muted">
                La bienvenida se prepara con el primer pago y la renovación con
                los pagos siguientes.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
