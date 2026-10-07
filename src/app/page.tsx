import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { AuthForm } from "@/components/auth-form";
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
        <Link className="wordmark" href="/" aria-label="Gymora, inicio">
          <Brand />
        </Link>
        <nav aria-label="Navegación del sitio">
          <a href="#funciones" className="marketing-nav-feature">
            El sistema
          </a>
          <a href="#planes">Planes</a>
          <Link href="/login">Iniciar sesión</Link>
          <a className="button lime marketing-nav-trial" href="#demo">
            Probar 2 días
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="marketing-hero" aria-labelledby="hero-title">
          <div className="marketing-hero-copy">
            <p className="eyebrow">
              EL SOFTWARE QUE SIGUE EL RITMO DE TU GIMNASIO
            </p>
            <h1 id="hero-title">
              Tu gimnasio,
              <br />
              <em>en movimiento.</em>
            </h1>
            <p className="marketing-lead">
              Socios, membresías, accesos y caja. Todo conectado para que la
              recepción fluya y tú sepas qué está pasando.
            </p>
            <a className="marketing-text-link" href="#funciones">
              Conoce cómo funciona <span aria-hidden="true">↗</span>
            </a>
            <div
              className="marketing-access-flow"
              aria-label="Cómo valida un acceso el sistema"
            >
              <p>UNA MEMBRESÍA. UN ACCESO DIARIO.</p>
              <div>
                <span>QR del socio</span>
                <b aria-hidden="true">→</b>
                <span>Vigencia y servicio</span>
                <b aria-hidden="true">→</b>
                <strong>Ingreso registrado</strong>
              </div>
              <small>
                El sistema comprueba la membresía antes de registrar el ingreso.
              </small>
            </div>
          </div>
          <section
            id="demo"
            className="marketing-signup"
            aria-labelledby="trial-title"
          >
            <div className="marketing-trial-number">
              <strong>02</strong>
              <span>
                días para conocer
                <br />
                tu nueva forma de trabajar
              </span>
            </div>
            <h2 id="trial-title">Prueba Gymora con tu gimnasio</h2>
            <p>
              Tu cuenta, tu equipo, tus datos. Sin tarjeta y sin cobro
              automático al terminar la prueba.
            </p>
            <AuthForm register />
            <small>
              Después configurarás el gimnasio y su primera sucursal. Desde ese
              momento tienes 48 horas de acceso.
            </small>
            <p className="marketing-existing">
              ¿Ya tienes una cuenta? <Link href="/login">Entra aquí</Link>
            </p>
          </section>
        </section>
        <section
          id="funciones"
          className="marketing-features"
          aria-labelledby="features-title"
        >
          <div className="marketing-section-intro">
            <p className="eyebrow">DE LA PUERTA A LA CAJA</p>
            <h2 id="features-title">
              Menos pasos.
              <br />
              Una jornada más clara.
            </h2>
            <p>
              Para gimnasios, estudios de baile y centros de entrenamiento que
              necesitan atender y administrar al mismo tiempo.
            </p>
          </div>
          <div className="marketing-feature-list">
            <article>
              <span>01</span>
              <div>
                <h3>Una recepción que sabe quién puede entrar</h3>
                <p>
                  Busca al socio o escanea su QR. Consulta su vigencia y valida
                  el servicio antes de registrar el ingreso.
                </p>
              </div>
            </article>
            <article>
              <span>02</span>
              <div>
                <h3>Membresías con fechas claras</h3>
                <p>
                  Planes de 1, 3 o 6 meses calendario, servicios incluidos,
                  renovaciones y congelaciones. Cada cambio queda asociado al
                  socio.
                </p>
              </div>
            </article>
            <article>
              <span>03</span>
              <div>
                <h3>Cobros, productos y gastos en la misma operación</h3>
                <p>
                  Registra lo recibido, vende productos con actualización de
                  stock y revisa los movimientos de caja en USD.
                </p>
              </div>
            </article>
          </div>
        </section>
        <section
          className="marketing-continuity"
          aria-labelledby="continuity-title"
        >
          <div>
            <p className="eyebrow">EMPIEZAS UNA VEZ. SIGUES CON TODO.</p>
            <h2 id="continuity-title">
              De la prueba al plan.
              <br />
              Tus datos se quedan contigo.
            </h2>
          </div>
          <div>
            <p>
              Los socios, planes y movimientos que registres durante la prueba
              pertenecen a tu gimnasio. Al confirmar el pago, se activa la
              suscripción en esa misma cuenta.
            </p>
            <p>
              Si los dos días terminan antes de pagar, se pausa el acceso
              operativo. Tus registros se conservan y puedes entrar a “Mi
              suscripción” para continuar.
            </p>
            <a href="#demo" className="marketing-text-link">
              Empieza con tus propios datos <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
        <section
          id="planes"
          className="marketing-pricing"
          aria-labelledby="pricing-title"
        >
          <div className="marketing-section-intro">
            <p className="eyebrow">PLANES PARA TU GIMNASIO</p>
            <h2 id="pricing-title">
              Elige cuánto tiempo
              <br />
              quieres avanzar.
            </h2>
            <p>
              Todos los planes incluyen el sistema de gestión. Precios en USD
              por el período completo, separados de las membresías que vendes a
              tus socios.
            </p>
            <a className="button" href="#demo">
              Probar Gymora gratis
            </a>
          </div>
          <div className="marketing-price-list">
            {plans.length ? (
              plans.map((plan) => (
                <article key={plan.id}>
                  <div>
                    <h3>{saasPeriodLabel(plan.durationMonths)}</h3>
                    <p>
                      {plan.durationMonths === 1
                        ? "1 mes"
                        : `${plan.durationMonths} meses`}{" "}
                      de acceso
                    </p>
                  </div>
                  <div>
                    <strong>{formatMoney(plan.price)}</strong>
                    <small>
                      {plan.durationMonths > 1
                        ? `${formatMoney(plan.price.dividedBy(plan.durationMonths))} por mes`
                        : "Por período mensual"}
                    </small>
                  </div>
                </article>
              ))
            ) : (
              <p>
                Los planes de pago se publicarán aquí cuando estén disponibles.
              </p>
            )}
            <p className="marketing-pricing-note">
              Renovaciones el 30; en febrero, el último día. Un día de gracia
              después de un período pagado. Actualmente el pago se verifica
              manualmente; los cobros automáticos aún no están habilitados.
            </p>
          </div>
        </section>
      </main>
      <footer className="marketing-footer">
        <Link className="wordmark dark" href="/">
          <Brand />
        </Link>
        <p>Gestión para gimnasios · Ecuador · USD</p>
        <Link href="/login">
          Acceso a mi gimnasio <span aria-hidden="true">↗</span>
        </Link>
      </footer>
    </div>
  );
}
