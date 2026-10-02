import { setTimeout } from "node:timers/promises";
import { db } from "../src/infrastructure/db";
import { whatsAppConfig } from "../src/modules/notifications/whatsapp-provider";
import { dispatchWhatsApp } from "../src/modules/notifications/whatsapp-delivery";
const config = whatsAppConfig();
if (!config) {
  console.error("WhatsApp no configurado. Consulta docs/whatsapp.md.");
  process.exit(1);
}
let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
});
process.on("SIGTERM", () => {
  stopped = true;
});
console.log(
  "Procesador de WhatsApp iniciado. No se registran teléfonos, credenciales ni tokens en los logs.",
);
try {
  do {
    try {
      const result = await dispatchWhatsApp(config);
      if (result.processed)
        console.log(`Notificaciones procesadas: ${result.processed}`);
    } catch {
      console.error("No se pudo procesar la cola de WhatsApp; se reintentará.");
    }
    if (process.argv.includes("--once")) break;
    await setTimeout(5000);
  } while (!stopped);
} finally {
  await db.$disconnect();
}
