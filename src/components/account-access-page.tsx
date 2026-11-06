import Link from "next/link";
import { Brand } from "@/components/brand";
import { AccountAccessForm } from "@/components/account-access-form";
import { authEmailConfig } from "@/modules/auth/email";

export function AccountAccessPage({
  mode,
  token,
}: {
  mode: "forgot" | "reset" | "verify";
  token?: string;
}) {
  return (
    <main className="standalone">
      <Link className="wordmark dark" href="/">
        <Brand />
      </Link>
      <section className="panel narrow">
        <h1>
          {mode === "forgot"
            ? "Recupera tu cuenta"
            : mode === "reset"
              ? "Elige una nueva contraseña"
              : "Confirma tu correo"}
        </h1>
        <p className="muted">
          {mode === "forgot"
            ? "Te enviaremos un enlace privado. Caduca en 15 minutos y solo puede usarse una vez."
            : mode === "reset"
              ? "Al cambiarla se cerrarán las sesiones abiertas en otros dispositivos."
              : "Revisa tu correo para confirmar tu cuenta antes de entrar. Si necesitas otro enlace, solicítalo aquí."}
        </p>
        <AccountAccessForm
          mode={mode}
          enabled={!!authEmailConfig()}
          token={token}
        />
        <p>
          <Link href="/login">Volver a iniciar sesión</Link>
        </p>
      </section>
    </main>
  );
}
