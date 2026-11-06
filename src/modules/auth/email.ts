import { createHash } from "node:crypto";
import { z } from "zod";
import { readEnvironment } from "@/infrastructure/env";

export type AuthEmail = { kind: "verify" | "reset"; to: string; url: string };
export type AuthEmailSender = (message: AuthEmail) => Promise<void>;

export function authEmailConfig(input: NodeJS.ProcessEnv = process.env) {
  if (!input.RESEND_API_KEY && !input.AUTH_EMAIL_FROM) return null;
  const result = z
    .object({ key: z.string().min(10), from: z.email() })
    .safeParse({
      key: input.RESEND_API_KEY,
      from: input.AUTH_EMAIL_FROM,
    });
  if (!result.success)
    throw new Error(
      "Configura RESEND_API_KEY y AUTH_EMAIL_FROM con un remitente verificado.",
    );
  return result.data;
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
export function authEmailContent(message: AuthEmail, origin: string) {
  const url = new URL(message.url);
  if (
    url.origin !== new URL(origin).origin ||
    !url.pathname.startsWith("/api/auth/")
  )
    throw new Error("Enlace de cuenta no autorizado.");
  const reset = message.kind === "reset";
  const subject = reset
    ? "Restablece tu contraseña de Gymora"
    : "Confirma tu correo de Gymora";
  const instruction = reset
    ? "Usa este enlace para elegir una nueva contraseña. Caduca en 15 minutos y solo puede usarse una vez."
    : "Confirma tu correo para acceder a Gymora. Este enlace caduca en una hora.";
  const action = reset ? "Cambiar contraseña" : "Confirmar correo";
  return {
    subject,
    text: `${subject}\n\n${instruction}\n\n${message.url}\n\nSi no solicitaste esta acción, ignora este correo. Nunca compartas este enlace.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.7;color:#192a32"><h1 style="font-size:24px">${subject}</h1><p>${instruction}</p><p><a style="display:inline-block;padding:12px 20px;background:#087f72;color:white;border-radius:8px" href="${escapeHtml(message.url)}">${action}</a></p><p>Si no solicitaste esta acción, ignora este correo. Nunca compartas este enlace.</p><small>Gymora · Gestión para gimnasios</small></div>`,
  };
}
export function configuredAuthEmailSender(): AuthEmailSender | null {
  const config = authEmailConfig();
  if (!config) return null;
  const origin = readEnvironment().BETTER_AUTH_URL;
  return async (message) => {
    const content = authEmailContent(message, origin);
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": createHash("sha256")
            .update(JSON.stringify(message))
            .digest("hex"),
        },
        body: JSON.stringify({
          from: `Gymora <${config.from}>`,
          to: [message.to],
          ...content,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (
        !response.ok ||
        !z.object({ id: z.string().min(1) }).safeParse(await response.json())
          .success
      )
        throw new Error();
    } catch {
      // Provider bodies, recipients and action links must never reach logs or clients.
      throw new Error(
        "El servicio de correo no confirmó el envío. Inténtalo más tarde.",
      );
    }
  };
}
