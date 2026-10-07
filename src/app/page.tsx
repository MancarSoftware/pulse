import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { MarketingWalkthrough } from "@/components/marketing-walkthrough";
import { MarketingPlans } from "@/components/marketing-plans";
import { TrialAccess, TrialButton } from "@/components/trial-access";
import { db } from "@/infrastructure/db";
import { formatMoney } from "@/shared/money";
import { saasPeriodLabel } from "@/modules/billing/schedule";
import "./marketing.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gymora · Software para gimnasios",
  description:
    "Gestiona socios, membresías, accesos QR y caja de tu gimnasio en Ecuador. Prueba privada de dos días; conserva tus datos al activar un plan.",
  robots: { index: true, follow: true },
};
export default async function Home() {
  const plans = await db.saaSPlan.findMany({
    where: {
      id: { in: ["mancar-monthly", "mancar-quarterly", "mancar-semiannual"] },
      active: true,
      durationMonths: { in: [1, 3, 6] },
    },
    orderBy: { durationMonths: "asc" },
  });
  return (
    <TrialAccess>
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="marketing-header">
        <Link className="wordmark dark" href="/" aria-label="Gymora, inicio">
          <Brand />
        </Link>
        <nav aria-label="Navegación del sitio">
          <a href="#funciones" className="marketing-nav-feature">
            Conoce Gymora
          </a>
          <a href="#planes">Planes</a>
          <Link href="/login" className="marketing-login">
            Acceso clientes
          </Link>
          <TrialButton className="button marketing-nav-trial">
            Probar 2 días
          </TrialButton>
        </nav>
      </header>
      <main id="main">
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-hero-copy">
            <p className="marketing-hero-label">
              Hecho para quienes llevan un gimnasio.
            </p>
            <h1 id="hero-title">
              Administra tu gimnasio
              <br />
              <em>sin complicar tu día.</em>
            </h1>
            <p className="marketing-hero-description">
              Socios, membresías, accesos y caja. Un espacio de trabajo para
              atender a tu gente y mantener la administración al día.
            </p>
            <div className="marketing-hero-actions">
              <TrialButton className="button lime">
                Crear mi gimnasio <Icon name="arrow" />
              </TrialButton>
              <a href="#funciones">Ver cómo funciona</a>
            </div>
            <p className="marketing-trial-promise">
              Dos días gratis · Sin tarjeta · Tus datos se conservan
            </p>
          </div>
          <aside
            className="marketing-hero-context"
            aria-label="Tareas que puedes gestionar"
          >
            <p>Tu jornada en Gymora</p>
            <div>
              <Icon name="members" />
              <span>Consulta socios y membresías</span>
            </div>
            <div>
              <Icon name="access" />
              <span>Comprueba quién puede ingresar</span>
            </div>
            <div>
              <Icon name="pos" />
              <span>Registra cobros y ventas</span>
            </div>
            <div>
              <Icon name="reports" />
              <span>Revisa ingresos y gastos</span>
            </div>
          </aside>
        </section>
        <section
          id="funciones"
          className="marketing-product"
          aria-labelledby="product-title"
        >
          <div className="marketing-section-heading">
            <div>
              <p className="marketing-section-label">
                Un vistazo al trabajo diario
              </p>
              <h2 id="product-title">Encuentra lo que necesitas hacer.</h2>
            </div>
            <p>
              Selecciona una función.
              <br />
              Estas vistas usan datos de ejemplo.
            </p>
          </div>
          <MarketingWalkthrough />
          <p className="marketing-product-note">
            También incluye inventario, sucursales y permisos para tu equipo.
          </p>
        </section>
        <section
          id="planes"
          className="marketing-pricing"
          aria-labelledby="pricing-title"
        >
          <div className="marketing-pricing-copy">
            <p className="marketing-section-label">
              Una suscripción para tu gimnasio
            </p>
            <h2 id="pricing-title">
              Elige el tiempo.
              <br />
              El sistema va completo.
            </h2>
            <p>
              Todos los planes incluyen las mismas herramientas. Cambia la
              duración de la suscripción, no la forma en que trabajas.
            </p>
            <ul>
              <li>
                <Icon name="check" />
                Socios, membresías y accesos QR
              </li>
              <li>
                <Icon name="check" />
                Caja, productos e inventario
              </li>
              <li>
                <Icon name="check" />
                Gastos, reportes y equipo
              </li>
            </ul>
            <small>
              Precios en USD. Estos planes son para usar Gymora y son
              independientes de las membresías que vendes a tus socios.
            </small>
          </div>
          <MarketingPlans
            plans={plans.map((plan) => ({
              id: plan.id,
              name: saasPeriodLabel(plan.durationMonths),
              months: plan.durationMonths,
              total: formatMoney(plan.price),
              monthly: formatMoney(plan.price.dividedBy(plan.durationMonths)),
            }))}
          />
        </section>
        <section
          className="marketing-questions"
          aria-labelledby="questions-title"
        >
          <h2 id="questions-title">Antes de empezar</h2>
          <div>
            <details>
              <summary>¿Cuándo empieza la prueba?</summary>
              <p>
                Primero creas tu cuenta y después configuras el gimnasio y su
                primera sucursal. Al crear la organización empiezan las 48 horas
                de prueba. No necesitas tarjeta.
              </p>
            </details>
            <details>
              <summary>¿Qué pasa con los datos al activar un plan?</summary>
              <p>
                Continúas en la misma cuenta, con tus socios, planes y
                movimientos. Si la prueba termina antes de pagar, se pausa el
                acceso operativo; tus registros se conservan y puedes entrar a
                Mi suscripción para continuar.
              </p>
            </details>
            <details>
              <summary>¿Cómo pago y renuevo?</summary>
              <p>
                Por ahora el pago se verifica manualmente; los cobros
                automáticos aún no están habilitados. Las renovaciones se
                programan para el 30, o el último día de febrero. Hay un día de
                gracia después de un período pagado.
              </p>
            </details>
          </div>
        </section>
        <section className="marketing-start" aria-labelledby="start-title">
          <div>
            <h2 id="start-title">Conoce Gymora con tu propio gimnasio.</h2>
            <p>
              Crea tu cuenta, configura una sucursal y empieza a trabajar. Al
              activar un plan, sigues desde donde te quedaste.
            </p>
          </div>
          <TrialButton className="button lime">
            Empezar mi prueba <Icon name="arrow" />
          </TrialButton>
        </section>
      </main>
      <footer className="marketing-footer">
        <Link className="wordmark dark" href="/">
          <Brand />
        </Link>
        <p>Gestión para gimnasios · Ecuador · USD</p>
        <Link href="/login">
          Entrar a mi cuenta <Icon name="arrow" />
        </Link>
      </footer>
    </TrialAccess>
  );
}
