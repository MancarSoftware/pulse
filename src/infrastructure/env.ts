import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.includes("REPLACE_")),
  BETTER_AUTH_URL: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === "/"
      );
    }),
});
// Only use operator/provider configuration, never a request Host header.
export function applicationUrl(input: NodeJS.ProcessEnv = process.env) {
  return input.BETTER_AUTH_URL || input.RENDER_EXTERNAL_URL;
}
export function readEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse({
    ...input,
    BETTER_AUTH_URL: applicationUrl(input),
  });
  if (!parsed.success)
    throw new Error(
      `Configuración inválida: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  if (
    input.NODE_ENV === "production" &&
    !parsed.data.BETTER_AUTH_URL.startsWith("https://") &&
    !["localhost", "127.0.0.1"].includes(
      new URL(parsed.data.BETTER_AUTH_URL).hostname,
    )
  )
    throw new Error("Producción requiere HTTPS");
  if (
    input.NODE_ENV === "production" &&
    input.ALLOW_DEMO_SEED === "true" &&
    !["localhost", "127.0.0.1"].includes(
      new URL(parsed.data.BETTER_AUTH_URL).hostname,
    )
  )
    throw new Error("El seed demo está prohibido en producción");
  return {
    ...parsed.data,
    BETTER_AUTH_URL: new URL(parsed.data.BETTER_AUTH_URL).origin,
  };
}
