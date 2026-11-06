import { headers } from "next/headers";
import { platformContext } from "@/modules/billing/platform-auth";
import { backupHealth } from "@/modules/operations/backup-health";
import { formatDateTime } from "@/shared/dates";
export async function PlatformBackupHealth() {
  await platformContext(await headers());
  const health = await backupHealth(
    process.env.BACKUP_DIRECTORY || ".local/backups",
  );
  const labels = {
    HEALTHY: "Respaldo al día",
    FAILED: "Revisar fallo de respaldo",
    STALE: "Respaldo atrasado",
    UNAVAILABLE: "Sin estado de respaldo",
  };
  return (
    <section className="panel" aria-label="Salud de respaldos">
      <div className="section-heading">
        <h2>Respaldos de la plataforma</h2>
        <a className="button secondary" href="/platform?tab=operations">
          Actualizar estado
        </a>
      </div>
      <p
        className={`notice ${health.state === "HEALTHY" ? "success" : "warning"}`}
        role="status"
      >
        <strong>{labels[health.state]}</strong>
        <br />
        {health.message}
      </p>
      <dl className="backup-health-details">
        <div>
          <dt>Último respaldo correcto</dt>
          <dd>
            {health.lastSuccessAt
              ? formatDateTime(new Date(health.lastSuccessAt))
              : "Sin confirmación"}
          </dd>
        </div>
        <div>
          <dt>Último intento</dt>
          <dd>
            {health.lastAttemptAt
              ? formatDateTime(new Date(health.lastAttemptAt))
              : "Sin registro"}
          </dd>
        </div>
      </dl>
      <p className="muted">
        Horario local configurado: diariamente a las 03:00. El equipo debe estar
        disponible, con sesión iniciada y PostgreSQL accesible. Un estado
        atrasado requiere revisión.
      </p>
      <p className="muted">
        Esta vista verifica el resultado informado por el proceso; no garantiza
        una copia externa ni una restauración reciente. Los archivos y las
        claves no se muestran ni se descargan desde el navegador.
      </p>
    </section>
  );
}
