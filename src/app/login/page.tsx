import { Brand } from "@/components/brand";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default function LoginPage() {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link className="wordmark" href="/">
          <Brand />
        </Link>
        <div>
          <p className="eyebrow">TU GIMNASIO. EN ORDEN.</p>
          <h1>
            Más tiempo
            <br />
            para tus socios.
          </h1>
          <p>
            Accesos, membresías y caja.
            <br />
            Una operación conectada de principio a fin.
          </p>
        </div>
        <small>Gymora · Gestión para gimnasios</small>
      </section>
      <section className="auth-panel">
        <div>
          <p className="eyebrow">BIENVENIDO DE NUEVO</p>
          <h2>Abre tu jornada</h2>
          <p className="muted">Ingresa con tu cuenta de trabajo.</p>
          <AuthForm />
          <p className="muted">
            ¿Administras un gimnasio?{" "}
            <Link href="/register">Crear organización</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
