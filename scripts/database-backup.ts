import {
  createDatabaseBackup,
  restoreDatabaseBackup,
  verifyDatabaseBackup,
} from "./lib/database-backup";
import { recordBackupStatus } from "../src/modules/operations/backup-health";
try {
  const [action, filename] = process.argv.slice(2);
  if (action === "verify" && filename) {
    await verifyDatabaseBackup(filename);
    console.log("Respaldo íntegro y clave válida.");
  } else if (
    action === "restore" &&
    filename &&
    process.env.RESTORE_DATABASE_URL &&
    process.env.DATABASE_URL
  ) {
    await restoreDatabaseBackup(
      filename,
      process.env.RESTORE_DATABASE_URL,
      process.env.DATABASE_URL,
    );
    console.log("Restauración completada en la base de prueba.");
  } else if (action === "create" && process.env.DATABASE_URL) {
    const directory = process.env.BACKUP_DIRECTORY || ".local/backups";
    await recordBackupStatus(directory, "RUNNING");
    try {
      await createDatabaseBackup(
        process.env.DATABASE_URL,
        process.env.BACKUP_DIRECTORY || ".local/backups",
      );
      await recordBackupStatus(directory, "SUCCESS");
    } catch (error) {
      await recordBackupStatus(directory, "FAILED");
      throw error;
    }
    console.log("Respaldo cifrado creado y verificado.");
  } else
    throw new Error(
      "Usa create, verify ARCHIVO o restore ARCHIVO con RESTORE_DATABASE_URL terminada en _restore_test.",
    );
} catch {
  console.error(
    "La operación de respaldo falló. Comprueba configuración, clave, PostgreSQL y destino vacío. No se muestran secretos.",
  );
  process.exitCode = 1;
}
