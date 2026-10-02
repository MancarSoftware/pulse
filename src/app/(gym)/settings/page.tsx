import Link from "next/link";
import { pageContext } from "@/lib/page-context";
import { authorize, can } from "@/modules/auth/permissions";
import { db } from "@/infrastructure/db";
import { lookups, type Search } from "@/modules/reports/queries";
import { OperationForm, type Field } from "@/components/operation-form";
import { Modal } from "@/components/modal";
import { formatMoney } from "@/shared/money";
import { durationLabel } from "@/shared/presentation";
import { DeleteAction } from "@/components/delete-action";
import { Icon, type IconName } from "@/components/icon";
import {
  whatsappPublicStatus,
  resolveWhatsAppConfig,
} from "@/modules/notifications/whatsapp-connect";
import { WhatsAppConnect } from "@/components/whatsapp-connect";
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const ctx = await pageContext();
  authorize(ctx, "settings:write");
  const search = await searchParams;
  const tab = String(search.tab ?? "services");
  const scope = { organizationId: ctx.organizationId };
  const data = await lookups(ctx);
  const nameField: Field = { name: "name", label: "Nombre" };
  const activeField: Field = {
    name: "active",
    label: "Habilitado",
    type: "checkbox",
  };
  let content: React.ReactNode;
  if (tab === "whatsapp") {
    const configured = !!(await resolveWhatsAppConfig(ctx.organizationId));
    const whatsapp = await whatsappPublicStatus(ctx.organizationId);
    const pending = await db.whatsAppMessage.count({
      where: { organizationId: ctx.organizationId, status: "PENDING" },
    });
    content = (
      <>
        <p className="eyebrow">COMUNICACIÓN CON SOCIOS</p>
        <h2>WhatsApp y QR de acceso</h2>
        <WhatsAppConnect {...whatsapp} owner={ctx.role === "OWNER"} />
        {configured && !whatsapp.connection && (
          <p className="notice success">
            Emisor configurado manualmente en el servidor. La conexión guiada
            está disponible cuando se habilite Meta.
          </p>
        )}
        <p className="muted">
          Al registrar el primer pago se prepara una bienvenida con el QR; los
          siguientes pagos generan una confirmación de renovación. Cada mensaje
          incluye el plan, los servicios y las fechas contratadas.
        </p>
        <p className="muted">
          {pending} mensajes pendientes. Solo se contacta a socios con
          autorización y celular válido. Un fallo de envío no afecta el pago ni
          su acceso.
        </p>
        <p className="muted">
          El QR permite un ingreso diario mientras la membresía esté vigente. No
          se envía un nuevo código cada día.
        </p>
      </>
    );
  } else if (tab === "general") {
    const organization = await db.organization.findUniqueOrThrow({
      where: { id: ctx.organizationId },
    });
    content = (
      <>
        <h2>Organización</h2>
        <p className="muted">
          Ecuador continental · USD · Acceso por sucursal contratada
        </p>
        <OperationForm
          endpoint="/api/gym/catalog"
          fixed={{ kind: "organization" }}
          fields={[
            {
              name: "name",
              label: "Nombre del gimnasio",
              value: organization.name,
            },
            {
              name: "duplicateScanSeconds",
              label: "Intervalo entre ingresos duplicados (segundos)",
              type: "number",
              min: "5",
              max: "300",
              value: String(organization.duplicateScanSeconds),
              hint: "Entre 5 y 300 segundos.",
            },
          ]}
        />
      </>
    );
  } else if (tab === "plans") {
    const plans = await db.plan.findMany({
      where: scope,
      include: { services: { include: { service: true } } },
      orderBy: { name: "asc" },
      take: 300,
    });
    const fields: Field[] = [
      nameField,
      { name: "price", label: "Precio USD", type: "decimal" },
      {
        name: "durationMonths",
        label: "Duración de la membresía",
        type: "select",
        options: [1, 3, 6].map((months) => ({
          value: String(months),
          label: durationLabel(months),
        })),
        hint: "Meses calendario completos; incluye sábados y domingos.",
      },
      { name: "description", label: "Descripción", required: false },
      {
        name: "serviceIds",
        label: "Servicios incluidos",
        type: "multiselect",
        options: data.services.map((s) => ({ value: s.id, label: s.name })),
        hint: "Selecciona uno o varios servicios.",
      },
      activeField,
    ];
    content = (
      <>
        <div className="section-heading">
          <h2>Planes de membresía</h2>
          <Modal title="Crear plan" trigger="Nuevo plan">
            <OperationForm
              endpoint="/api/gym/catalog"
              fixed={{ kind: "plan" }}
              fields={fields}
            />
          </Modal>
        </div>
        <p className="muted">
          Los cambios de precio o servicios aplican a nuevos contratos. Las
          membresías existentes conservan lo contratado. La duración y los
          servicios incluidos se eligen por separado; el precio es el total del
          período.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Plan</th>
                <th>Duración</th>
                <th>Precio</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.name}
                    <small className="plan-services">
                      Incluye:{" "}
                      {p.services.map((s) => s.service.name).join(", ")}
                    </small>
                  </td>
                  <td>
                    {p.durationMonths
                      ? durationLabel(p.durationMonths)
                      : `Revisar: ${p.durationDays} días (anterior)`}
                  </td>
                  <td>{formatMoney(p.price)}</td>
                  <td>
                    <span
                      className={`status ${p.active ? "success" : "neutral"}`}
                    >
                      {p.active ? "Habilitado" : "Deshabilitado"}
                    </span>
                  </td>
                  <td>
                    <Modal title="Editar plan" trigger="Editar">
                      <OperationForm
                        endpoint="/api/gym/catalog"
                        fixed={{ kind: "plan", id: p.id }}
                        fields={fields.map((f) => ({
                          ...f,
                          value:
                            f.name === "serviceIds"
                              ? p.services.map((s) => s.serviceId).join(",")
                              : f.name === "price"
                                ? p.price.toString()
                                : f.name === "durationMonths"
                                  ? p.durationMonths
                                    ? String(p.durationMonths)
                                    : ""
                                  : f.name === "active"
                                    ? String(p.active)
                                    : f.name === "description"
                                      ? p.description
                                      : p.name,
                        }))}
                      />
                    </Modal>
                    <DeleteAction kind="plan" id={p.id} name={p.name} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (tab === "staff") {
    authorize(ctx, "staff:write");
    const staff = await db.staff.findMany({
      where: scope,
      include: { user: { select: { name: true, email: true } }, branch: true },
      take: 200,
    });
    const access: Field[] = [
      {
        name: "branchId",
        label: "Sucursal",
        type: "select",
        options: data.branches.map((b) => ({ value: b.id, label: b.name })),
      },
      {
        name: "role",
        label: "Rol",
        type: "select",
        options: [
          { value: "ADMIN", label: "Administrador" },
          { value: "RECEPTIONIST", label: "Recepción" },
          { value: "TRAINER", label: "Entrenador" },
        ],
      },
    ];
    content = (
      <>
        <div className="section-heading">
          <h2>Equipo y permisos</h2>
          <Modal title="Crear empleado" trigger="Nuevo empleado">
            <OperationForm
              endpoint="/api/gym/catalog"
              fixed={{ kind: "staff" }}
              fields={[
                nameField,
                { name: "email", label: "Email de trabajo", type: "email" },
                {
                  name: "password",
                  label: "Contraseña inicial",
                  type: "password",
                  hint: "Mínimo 12 caracteres. Comparte por un canal seguro.",
                },
                ...access,
              ]}
            />
          </Modal>
        </div>
        <p className="muted">
          Recepción: socios, cobros y accesos de su sucursal. Entrenador:
          listado básico de socios. Administrador: operación y reportes. Solo el
          propietario administra empleados.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Sucursal</th>
                <th>Rol</th>
                <th>Acceso</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.user.name}
                    <br />
                    <small>{s.user.email}</small>
                  </td>
                  <td>{s.branch.name}</td>
                  <td>{s.role}</td>
                  <td>{s.active ? "Activo" : "Deshabilitado"}</td>
                  <td>
                    {s.role !== "OWNER" && (
                      <Modal title="Modificar permisos" trigger="Permisos">
                        <OperationForm
                          endpoint="/api/gym/catalog"
                          fixed={{ kind: "staff-access", id: s.id }}
                          fields={[
                            ...access.map((f) => ({
                              ...f,
                              value: f.name === "role" ? s.role : s.branchId,
                            })),
                            { ...activeField, value: String(s.active) },
                          ]}
                        />
                      </Modal>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else {
    const config =
      tab === "branches"
        ? {
            kind: "branch",
            title: "Sucursales",
            rows: await db.branch.findMany({ where: scope, take: 100 }),
          }
        : tab === "methods"
          ? {
              kind: "payment-method",
              title: "Métodos de pago",
              rows: await db.paymentMethod.findMany({
                where: scope,
                take: 100,
              }),
            }
          : tab === "categories"
            ? {
                kind: "expense-category",
                title: "Categorías de gastos",
                rows: await db.expenseCategory.findMany({
                  where: scope,
                  take: 100,
                }),
              }
            : {
                kind: "service",
                title: "Servicios del gimnasio",
                rows: await db.service.findMany({ where: scope, take: 300 }),
              };
    content = (
      <>
        <div className="section-heading">
          <h2>{config.title}</h2>
          <Modal title={`Crear: ${config.title}`} trigger="Agregar">
            <OperationForm
              endpoint="/api/gym/catalog"
              fixed={{ kind: config.kind }}
              fields={[
                nameField,
                ...(config.kind === "branch"
                  ? [
                      {
                        name: "address",
                        label: "Dirección",
                        required: false,
                      } satisfies Field,
                    ]
                  : []),
                activeField,
              ]}
            />
          </Modal>
        </div>
        {!config.rows.length && (
          <div className="empty">
            <h3>Configura tu operación</h3>
            <p>Agrega los registros que necesita tu gimnasio.</p>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>
                    <span
                      className={`status ${row.active ? "success" : "neutral"}`}
                    >
                      {row.active ? "Habilitado" : "Deshabilitado"}
                    </span>
                  </td>
                  <td>
                    <Modal title="Editar configuración" trigger="Editar">
                      <OperationForm
                        endpoint="/api/gym/catalog"
                        fixed={{ kind: config.kind, id: row.id }}
                        fields={[
                          { ...nameField, value: row.name },
                          ...(config.kind === "branch"
                            ? [
                                {
                                  name: "address",
                                  label: "Dirección",
                                  required: false,
                                  value:
                                    "address" in row ? String(row.address) : "",
                                } satisfies Field,
                              ]
                            : []),
                          { ...activeField, value: String(row.active) },
                        ]}
                      />
                    </Modal>
                    {!(config.kind === "branch" && row.id === ctx.branchId) && (
                      <DeleteAction
                        kind={config.kind}
                        id={row.id}
                        name={row.name}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">TU FORMA DE OPERAR</p>
          <h1>Configuración</h1>
          <p className="muted">
            Servicios, planes y equipo adaptados a tu gimnasio.
          </p>
        </div>
      </div>
      <div className="settings-layout">
        <nav className="tabs settings-nav" aria-label="Configuración">
          <div className="settings-nav-title">
            <Icon name="settings" /> Tu gimnasio
          </div>
          <Link
            href="/settings?tab=general"
            aria-current={tab === "general" ? "page" : undefined}
          >
            General
          </Link>
          <Link
            href="/settings"
            aria-current={tab === "services" ? "page" : undefined}
          >
            Servicios
          </Link>
          <Link
            href="/settings?tab=plans"
            aria-current={tab === "plans" ? "page" : undefined}
          >
            Planes
          </Link>
          <Link
            href="/settings?tab=branches"
            aria-current={tab === "branches" ? "page" : undefined}
          >
            Sucursales
          </Link>
          <Link
            href="/settings?tab=methods"
            aria-current={tab === "methods" ? "page" : undefined}
          >
            Métodos de pago
          </Link>
          <Link
            href="/settings?tab=categories"
            aria-current={tab === "categories" ? "page" : undefined}
          >
            Categorías de gastos
          </Link>
          <Link
            href="/settings?tab=whatsapp"
            aria-current={tab === "whatsapp" ? "page" : undefined}
          >
            WhatsApp
          </Link>
          {can(ctx.role, "staff:write") && (
            <Link
              href="/settings?tab=staff"
              aria-current={tab === "staff" ? "page" : undefined}
            >
              Equipo
            </Link>
          )}
        </nav>
        <section className="panel settings-panel">
          {content}
          {tab !== "general" && tab !== "staff" && tab !== "whatsapp" && (
            <p className="settings-note">
              <Icon name={"check" as IconName} /> Puedes eliminar registros sin
              uso. Deshabilita los utilizados para conservar su historial.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
