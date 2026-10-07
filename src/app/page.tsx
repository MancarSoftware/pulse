import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
import { Icon } from "@/components/icon";
import { MarketingWalkthrough } from "@/components/marketing-walkthrough";
import { db } from "@/infrastructure/db";
import { formatMoney } from "@/shared/money";
import { saasPeriodLabel } from "@/modules/billing/schedule";
import "./marketing.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Gymora · Tu gimnasio, en movimiento",
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
    <div className="marketing">
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="marketing-header">
        <Link className="wordmark dark" href="/" aria-label="Gymora, inicio">
          <Brand />
        </Link>
        <nav aria-label="Navegación del sitio">
          <a href="#funciones" className="marketing-nav-feature">
            El sistema
          </a>
          <a href="#planes">Planes</a>
          <Link href="/login" className="marketing-login">
            Iniciar sesión
          </Link>
          <a className="button marketing-nav-trial" href="#demo">
            Probar 2 días <Icon name="arrow" />
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-hero-copy">
            <p className="eyebrow">
              <span aria-hidden="true" />
              GESTIÓN PARA GIMNASIOS EN ECUADOR
            </p>
            <h1 id="hero-title">
              Tu gimnasio,
              <br />
              <em>en movimiento.</em>
            </h1>
            <p className="marketing-lead">
              Que la recepción fluya.{" "}
              <br />
              Que cada cobro quede claro.{" "}
              <br />
              Que tengas tiempo para tus socios.
            </p>
            <p className="marketing-hero-description">
              Membresías, accesos QR, ventas y gastos. Una sola herramienta para
              llevar el día a día de tu gimnasio.
            </p>
            <div className="marketing-hero-actions">
              <a className="button lime" href="#demo">
                Empezar mi prueba gratis <Icon name="arrow" />
              </a>
              <a className="marketing-text-link" href="#funciones">
                Explorar el sistema
              </a>
            </div>
            <p className="marketing-hero-assurance">
              <Icon name="check" />2 días de prueba{" "}
              <span aria-hidden="true">·</span> Sin tarjeta{" "}
              <span aria-hidden="true">·</span> Tus datos se conservan
            </p>
          </div>
          <MarketingWalkthrough />
        </section>
        <div
          className="marketing-capabilities"
          aria-label="Funciones incluidas"
        >
          <span>TODO CONECTADO</span>
          <p>
            <Icon name="members" />
            Socios y membresías
          </p>
          <p>
            <Icon name="access" />
            Accesos QR
          </p>
          <p>
            <Icon name="pos" />
            Ventas e inventario
          </p>
          <p>
            <Icon name="reports" />
            Ingresos y gastos
          </p>
        </div>
        <section
          id="funciones"
          className="marketing-features"
          aria-labelledby="features-title"
        >
          <div className="marketing-section-intro">
            <p className="eyebrow">UNA JORNADA MÁS SIMPLE</p>
            <h2 id="features-title">
              Del primer ingreso
              <br />
              al último cobro.
            </h2>
            <p>
              Cada tarea tiene su lugar. Cada movimiento queda conectado con el
              socio, la membresía o la venta que lo originó.
            </p>
            <a className="marketing-text-link" href="#demo">
              Pruébalo en tu gimnasio <Icon name="arrow" />
            </a>
          </div>
          <div className="marketing-feature-list">
            <article>
              <span>01</span>
              <div>
                <h3>Recibe a tus socios con claridad</h3>
                <p>
                  Busca por nombre o escanea el QR. Revisa la vigencia, el
                  servicio y el acceso del día antes de registrar el ingreso.
                </p>
                <small>Recepción · Check-in · Historial de accesos</small>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>La próxima renovación, bajo control</h3>
                <p>
                  Planes de 1, 3 o 6 meses calendario, servicios incluidos y
                  congelaciones. El perfil del socio reúne lo que necesitas para
                  atenderlo.
                </p>
                <small>Socios · Membresías · Renovaciones</small>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Cierra el día sabiendo qué pasó</h3>
                <p>
                  Registra cobros, vende productos con actualización de stock y
                  consulta los gastos. Revisa los movimientos de caja en
                  dólares.
                </p>
                <small>Punto de venta · Inventario · Movimientos</small>
              </div>
            </article>
          </div>
        </section>
        <section
          id="planes"
          className="marketing-pricing"
          aria-labelledby="pricing-title"
        >
          <div className="marketing-pricing-heading">
            <div>
              <p className="eyebrow">UN SISTEMA. TRES DURACIONES.</p>
              <h2 id="pricing-title">Elige tu próximo período.</h2>
            </div>
            <p>
              El mismo sistema de gestión en todos los planes.
              <br />
              El precio corresponde al período completo, en USD.
            </p>
          </div>
          <div className="marketing-price-list">
            <div className="marketing-price-columns" aria-hidden="true">
              <span>Plan para tu gimnasio</span>
              <span>Precio por período</span>
              <span>Equivalente mensual</span>
              <span />
            </div>
            {plans.length ? (
              plans.map((plan) => (
                <article key={plan.id}>
                  <div className="marketing-plan-name">
                    <span>{String(plan.durationMonths).padStart(2, "0")}</span>
                    <div>
                      <h3>{saasPeriodLabel(plan.durationMonths)}</h3>
                      <p>
                        {plan.durationMonths === 1
                          ? "1 mes"
                          : `${plan.durationMonths} meses`}{" "}
                        de acceso
                      </p>
                    </div>
                  </div>
                  <div className="marketing-plan-price">
                    <small>Precio por período</small>
                    <strong>{formatMoney(plan.price)}</strong>
                  </div>
                  <div className="marketing-plan-equivalent">
                    <small>Equivalente mensual</small>
                    {formatMoney(plan.price.dividedBy(plan.durationMonths))}
                    <span> / mes</span>
                  </div>
                  <a
                    href="#demo"
                    className="marketing-plan-link"
                    aria-label={`Probar Gymora antes de contratar el plan ${saasPeriodLabel(plan.durationMonths)}`}
                  >
                    Probar primero <Icon name="arrow" />
                  </a>
                </article>
              ))
            ) : (
              <p className="marketing-empty-plans">
                Los planes de pago se publicarán aquí cuando estén disponibles.
                Puedes empezar con la prueba privada.
              </p>
            )}
          </div>
          <div className="marketing-pricing-notes">
            <p>
              <Icon name="check" />
              Socios, accesos, caja e inventario incluidos.
            </p>
            <p>
              Estos planes son para usar Gymora; son independientes de las
              membresías que vendes a tus socios.
            </p>
          </div>
          <details className="marketing-payment-details">
            <summary>¿Cómo funcionan los pagos y las renovaciones?</summary>
            <p>
              Renovaciones el 30; en febrero, el último día. Tienes un día de
              gracia después de un período pagado. Actualmente el pago se
              verifica manualmente; los cobros automáticos aún no están
              habilitados.
            </p>
          </details>
        </section>
        <section
          id="demo"
          className="marketing-trial"
          aria-labelledby="trial-title"
        >
          <div className="marketing-trial-copy">
            <p className="eyebrow">TU GIMNASIO. TU ESPACIO.</p>
            <h2 id="trial-title">
              Empieza con una prueba.
              <br />
              <em>Sigue con tus datos.</em>
            </h2>
            <p>
              Explora Gymora durante 48 horas con tu propio gimnasio. Crea
              socios, configura planes y conoce tu nueva forma de trabajar.
            </p>
            <ol className="marketing-trial-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>Crea tu cuenta</strong>
                  <p>Tu nombre, correo y una contraseña segura.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Configura tu gimnasio</strong>
                  <p>Al crear la organización empieza tu prueba de 2 días.</p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Activa un plan y continúa</strong>
                  <p>
                    Al confirmar el pago, sigues en la misma cuenta. Tus
                    registros permanecen.
                  </p>
                </div>
              </li>
            </ol>
            <div className="marketing-retention">
              <Icon name="inventory" />
              <p>
                Si la prueba termina antes de pagar, se pausa el acceso
                operativo. Tus datos se conservan y puedes activar el plan desde{" "}
                <strong>Mi suscripción</strong>.
              </p>
            </div>
          </div>
          <section className="marketing-signup" aria-labelledby="signup-title">
            <p className="marketing-form-kicker">
              <Icon name="clock" />
              PRUEBA PRIVADA DE 2 DÍAS
            </p>
            <h3 id="signup-title">Este es tu punto de partida.</h3>
            <p>Sin tarjeta. Sin cobro automático al terminar.</p>
            <AuthForm register registerLabel="Empezar mi prueba gratuita" />
            <p className="marketing-existing">
              ¿Ya tienes una cuenta?{" "}
              <Link href="/login">
                Inicia sesión <span aria-hidden="true">↗</span>
              </Link>
            </p>
          </section>
        </section>
      </main>
      <footer className="marketing-footer">
        <div>
          <Link className="wordmark dark" href="/">
            <Brand />
          </Link>
          <p>Que tu gimnasio siga en movimiento.</p>
        </div>
        <p>
          Hecho para la operación diaria.
          <br />
          Ecuador · Precios en USD
        </p>
        <Link href="/login">
          Entrar a mi gimnasio <Icon name="arrow" />
        </Link>
      </footer>
    </div>
  );
}
