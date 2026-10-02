import { setTimeout } from "node:timers/promises";
import { db } from "../src/infrastructure/db";
import { whatsAppConfig } from "../src/modules/notifications/whatsapp-provider";
import { dispatchWhatsApp } from "../src/modules/notifications/whatsapp-delivery";
import { resolveWhatsAppConfig } from "../src/modules/notifications/whatsapp-connect";
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
      const rows = await db.whatsAppConnection.findMany({
        where: { ready: true },
        select: { organizationId: true },
      });
      const legacy = whatsAppConfig();
      const ids = new Set(rows.map((r) => r.organizationId));
      if (legacy) ids.add(legacy.organizationId);
      for (const id of ids) {
        try {
          const result = await dispatchWhatsApp(
            await resolveWhatsAppConfig(id),
          );
          if (result.processed)
            console.log(`Notificaciones procesadas: ${result.processed}`);
        } catch {
          console.error("No se pudo procesar una conexión; se reintentará.");
        }
      }
    } catch {
      console.error("No se pudo procesar la cola de WhatsApp; se reintentará.");
    }
    if (process.argv.includes("--once")) break;
    await setTimeout(5000);
  } while (!stopped);
} finally {
  await db.$disconnect();
}
