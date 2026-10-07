"use client";
import { useState, type FormEvent } from "react";
import { createAuthClient } from "better-auth/react";
import { useRouter } from "next/navigation";
const client = createAuthClient();
export function AuthForm({ register = false }: { register?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const values = {
        email: String(data.get("email")),
        password: String(data.get("password")),
      };
      const result = register
        ? await client.signUp.email({
            ...values,
            name: String(data.get("name")),
          })
        : await client.signIn.email(values);
      if (result.error)
        throw new Error(
          register
            ? "No se pudo crear la cuenta. Revisa los datos o intenta iniciar sesión."
            : "No se pudo iniciar sesión. Revisa tus credenciales o inténtalo más tarde.",
        );
      router.push(register ? "/setup" : "/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} className="auth-form">
      {register && (
        <label>
          Nombre completo
          <input
            name="name"
            required
            autoComplete="name"
            minLength={2}
            maxLength={100}
          />
        </label>
      )}
      <label>
        Correo electrónico
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          maxLength={240}
        />
      </label>
      <div>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          type="password"
          name="password"
          required
          minLength={register ? 12 : 1}
          maxLength={128}
          autoComplete={register ? "new-password" : "current-password"}
          aria-describedby={register ? "password-help" : undefined}
        />
        {register && <small id="password-help">Al menos 12 caracteres.</small>}
      </div>
      {error && (
        <p role="alert" className="notice danger">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy
          ? "Procesando…"
          : register
            ? "Crear cuenta de propietario"
            : "Entrar a mi gimnasio"}
      </button>
    </form>
  );
}
export function Logout() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <>
      <button
        className="logout"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const result = await client.signOut();
            if (result.error) throw new Error();
            router.push("/login");
            router.refresh();
          } catch {
            setError(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        Cerrar sesión
      </button>
      {error && <span role="alert">No se pudo cerrar sesión</span>}
    </>
  );
}
