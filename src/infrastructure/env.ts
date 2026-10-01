import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().url().startsWith("postgresql://"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32)
    .refine((v) => !v.includes("REPLACE_")),
  BETTER_AUTH_URL: z.string().url(),
});
export function readEnvironment(input: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(input);
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
  return parsed.data;
}
