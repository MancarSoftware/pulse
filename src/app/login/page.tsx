import { Brand } from "@/components/brand";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const search = await searchParams;
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
          {search.verified === "1" && !search.error && (
            <p role="status" className="notice success">
              Correo confirmado. Ya puedes iniciar sesión.
            </p>
          )}
          {search.error && (
            <p role="alert" className="notice warning">
              El enlace de verificación no es válido o ya caducó.{" "}
              <Link href="/verify-email">Solicita otro enlace</Link>.
            </p>
          )}
          <AuthForm />
          <p>
            <Link href="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </p>
          <p className="muted">
            ¿Administras un gimnasio?{" "}
            <Link href="/register">Crear organización</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
