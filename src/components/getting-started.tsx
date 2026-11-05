import Link from "next/link";
import { Icon } from "@/components/icon";
import { db } from "@/infrastructure/db";
import type { Context } from "@/modules/auth/permissions";
import "./getting-started.css";

export async function GettingStarted({ ctx }: { ctx: Context }) {
  if (ctx.role !== "OWNER") return null;
  const scope = { organizationId: ctx.organizationId };
  const [service, plan, member, payment] = await Promise.all([
    db.service.findFirst({
      where: { ...scope, active: true },
      select: { id: true },
    }),
    db.plan.findFirst({
      where: {
        ...scope,
        active: true,
        durationMonths: { in: [1, 3, 6] },
        services: { some: {}, every: { service: { active: true } } },
      },
      select: { id: true },
    }),
    db.member.findFirst({
      where: { ...scope, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    db.ledgerEntry.findFirst({
      where: { ...scope, kind: "MEMBERSHIP_PAYMENT", reversedBy: { none: {} } },
      select: { id: true },
    }),
  ]);
  const steps = [
    {
      title: "Prepara tus servicios y planes",
      description: service
        ? "Crea un plan de 1, 3 o 6 meses con su precio y servicios incluidos."
        : "Agrega lo que ofrece tu gimnasio; después crea un plan con esos servicios.",
      done: !!plan,
      href: service ? "/settings?tab=plans" : "/settings?tab=services",
      action: service ? "Configurar planes" : "Agregar servicios",
      icon: "settings",
    },
    {
      title: "Registra tu primer socio",
      description:
        "Agrega sus datos de contacto y la sucursal a la que pertenece.",
      done: !!member,
      href: "/members",
      action: "Agregar socio",
      icon: "members",
    },
    {
      title: "Registra el primer pago de membresía",
      description:
        "Abre el perfil del socio, elige su plan y registra el pago recibido.",
      done: !!payment,
      href: member && plan ? `/members/${member.id}#registrar-membresia` : null,
      action: "Abrir perfil y registrar pago",
      icon: "pos",
    },
  ] as const;
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;
  return (
    <section
      className="getting-started"
      aria-labelledby="getting-started-title"
    >
      <div className="getting-started-heading">
        <div>
          <h2 id="getting-started-title">Deja listo tu gimnasio</h2>
          <p>
            Empieza por estas tareas. El avance se actualiza con tus registros.
          </p>
        </div>
        <span>
          {completed} de {steps.length} completadas
        </span>
      </div>
      <progress
        value={completed}
        max={steps.length}
        aria-label="Avance de configuración"
      />
      <ul>
        {steps.map((step) => (
          <li
            key={step.title}
            className={step.done ? "is-complete" : undefined}
          >
            <span className="getting-started-icon">
              <Icon name={step.done ? "check" : step.icon} />
            </span>
            <div>
              <h3>{step.title}</h3>
              {step.done ? <p>Completado</p> : <p>{step.description}</p>}
            </div>
            {!step.done &&
              (step.href ? (
                <Link href={step.href}>
                  {step.action}
                  <Icon name="arrow" />
                </Link>
              ) : (
                <span className="getting-started-prerequisite">
                  Primero crea un plan y un socio.
                </span>
              ))}
          </li>
        ))}
      </ul>
      <p className="getting-started-note">
        El pago de una membresía es un cobro a tu socio. Tu suscripción a Gymora
        se gestiona por separado en{" "}
        <Link href="/subscription">Mi suscripción</Link>.
      </p>
    </section>
  );
}
