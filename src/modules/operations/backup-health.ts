import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
const statusSchema = z.object({
  state: z.enum(["RUNNING", "SUCCESS", "FAILED"]),
  lastAttemptAt: z.iso.datetime(),
  lastSuccessAt: z.iso.datetime().nullable(),
});
export type BackupStatus = z.infer<typeof statusSchema>;
async function readStatus(directory: string) {
  try {
    return statusSchema.parse(
      JSON.parse(await readFile(join(directory, "backup-status.json"), "utf8")),
    );
  } catch {
    return null;
  }
}
export async function recordBackupStatus(
  directory: string,
  state: BackupStatus["state"],
  now = new Date(),
) {
  const previous = await readStatus(directory);
  const record: BackupStatus = {
    state,
    lastAttemptAt: now.toISOString(),
    lastSuccessAt:
      state === "SUCCESS"
        ? now.toISOString()
        : (previous?.lastSuccessAt ?? null),
  };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = join(
    directory,
    `.backup-status-${crypto.randomUUID()}.tmp`,
  );
  await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
  await rename(temporary, join(directory, "backup-status.json"));
}
export async function backupHealth(directory: string, now = new Date()) {
  const record = await readStatus(directory);
  if (
    !record ||
    (record.lastSuccessAt &&
      new Date(record.lastSuccessAt).getTime() > now.getTime() + 300000)
  )
    return {
      state: "UNAVAILABLE" as const,
      lastAttemptAt: null,
      lastSuccessAt: null,
      message:
        "No hay un resultado verificable del proceso de respaldo. Revisa su configuración y ejecución.",
    };
  const age = record.lastSuccessAt
    ? now.getTime() - new Date(record.lastSuccessAt).getTime()
    : Infinity;
  const interrupted =
    record.state === "RUNNING" &&
    now.getTime() - new Date(record.lastAttemptAt).getTime() > 7200000;
  const state =
    record.state === "FAILED" || interrupted
      ? ("FAILED" as const)
      : age > 36 * 3600000
        ? ("STALE" as const)
        : ("HEALTHY" as const);
  return {
    ...record,
    state,
    message:
      state === "FAILED"
        ? "El último intento falló o quedó interrumpido. El último respaldo correcto se conserva; revisa el proceso."
        : state === "STALE"
          ? "No se ha confirmado un respaldo correcto en las últimas 36 horas. Revisa el equipo, PostgreSQL y la tarea programada."
          : record.state === "RUNNING"
            ? "Hay un respaldo en ejecución. Se muestra el último respaldo verificado."
            : "El último respaldo terminó y su cifrado fue verificado.",
  };
}
