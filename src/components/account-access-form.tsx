"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
const client = createAuthClient();

export function AccountAccessForm({
  mode,
  enabled,
  token,
}: {
  mode: "forgot" | "reset" | "verify";
  enabled: boolean;
  token?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError("");
    if (mode === "reset" && form.get("password") !== form.get("confirmation")) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "reset"
          ? await client.resetPassword({
              token,
              newPassword: String(form.get("password")),
            })
          : mode === "forgot"
            ? await client.requestPasswordReset({
                email: String(form.get("email")),
                redirectTo: "/reset-password",
              })
            : await client.sendVerificationEmail({
                email: String(form.get("email")),
                callbackURL: "/login?verified=1",
              });
      if (result.error) {
        if (result.error.status === 429)
          throw new Error(
            "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
          );
        throw new Error(
          mode === "reset"
            ? "El enlace no es válido o ya caducó. Solicita uno nuevo."
            : "No se pudo procesar la solicitud. Inténtalo más tarde.",
        );
      }
      setSent(true);
      if (mode === "reset")
        window.history.replaceState(null, "", "/reset-password");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo conectar. Inténtalo más tarde.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!enabled)
    return (
      <p className="notice warning">
        El servicio de correo todavía no está habilitado en Gymora. Contacta a
        la administración del sistema para recuperar o verificar tu cuenta.
      </p>
    );
  if (mode === "reset" && !token)
    return (
      <p className="notice warning">
        El enlace no es válido o ya caducó.{" "}
        <Link href="/forgot-password">Solicita otro enlace</Link>.
      </p>
    );
  if (sent)
    return (
      <div role="status" className="notice success">
        {mode === "reset" ? (
          <>
            Contraseña actualizada. Se cerraron las sesiones anteriores.{" "}
            <Link href="/login">Inicia sesión con tu nueva contraseña</Link>.
          </>
        ) : (
          "Si el correo corresponde a una cuenta que necesita esta acción, recibirás un enlace. Revisa también la carpeta de spam."
        )}
      </div>
    );
  return (
    <form method="post" onSubmit={submit} className="auth-form">
      {mode !== "reset" ? (
        <label>
          Correo electrónico
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={240}
          />
        </label>
      ) : (
        <>
          <label>
            Nueva contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              aria-describedby="reset-help"
            />
          </label>
          <small id="reset-help">Usa al menos 12 caracteres.</small>
          <label>
            Confirmar nueva contraseña
            <input
              name="confirmation"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="notice danger">
          {error}{" "}
          {mode === "reset" && (
            <Link href="/forgot-password">Solicitar otro enlace</Link>
          )}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy
          ? "Procesando…"
          : mode === "reset"
            ? "Guardar nueva contraseña"
            : mode === "forgot"
              ? "Enviar enlace de recuperación"
              : "Enviar enlace de verificación"}
      </button>
    </form>
  );
}
