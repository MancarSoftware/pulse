import { readEnvironment } from "../src/infrastructure/env";
try {
  const env = readEnvironment({ ...process.env, NODE_ENV: "production" });
  const url = new URL(env.BETTER_AUTH_URL);
  if (
    url.protocol !== "https:" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  )
    throw new Error("El despliegue público requiere un origen HTTPS público.");
  console.log(
    "Configuración de despliegue válida. No se muestran secretos ni se modifica la base de datos.",
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Configuración de despliegue inválida.",
  );
  process.exitCode = 1;
}
