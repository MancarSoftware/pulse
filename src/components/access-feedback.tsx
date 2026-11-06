import { Icon } from "@/components/icon";
export type AccessResult = {
  state: "allowed" | "used" | "denied" | "error";
  title: string;
  message: string;
  remainingDays?: number;
};
export function accessResult(ok: boolean, body: unknown): AccessResult {
  const value =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (
    ok &&
    typeof value.message === "string" &&
    typeof value.remainingDays === "number"
  )
    return {
      state: "allowed",
      title: "Acceso permitido",
      message: value.message,
      remainingDays: value.remainingDays,
    };
  const error =
    value.error && typeof value.error === "object"
      ? (value.error as Record<string, unknown>)
      : {};
  const used =
    error.code === "DUPLICATE_SCAN" || error.code === "DAILY_ACCESS_USED";
  const titles: Record<string, string> = {
    EXPIRED: "Membresía vencida",
    FROZEN: "Membresía congelada",
    SCHEDULED: "Membresía aún no iniciada",
    SERVICE: "Servicio no incluido",
    NO_MEMBERSHIP: "Sin membresía vigente",
  };
  return {
    state: used ? "used" : ok ? "error" : "denied",
    title: used
      ? "Ingreso de hoy ya registrado"
      : (titles[String(error.reason)] ?? "No se pudo autorizar el ingreso"),
    message:
      typeof error.message === "string"
        ? error.message
        : "No hay confirmación del servidor. Revisa el registro antes de volver a intentar.",
  };
}
export async function submitCheckIn(
  payload: Record<string, string>,
): Promise<AccessResult> {
  try {
    const response = await fetch("/api/gym/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return accessResult(response.ok, await response.json());
  } catch {
    return {
      state: "error",
      title: "Sin confirmación de acceso",
      message:
        "No se pudo conectar. Revisa los últimos ingresos antes de volver a intentar para evitar duplicados.",
    };
  }
}
export function AccessFeedback({ result }: { result: AccessResult }) {
  return (
    <section
      className={`access-feedback ${result.state}`}
      role={result.state === "allowed" ? "status" : "alert"}
      aria-atomic="true"
    >
      <Icon
        name={
          result.state === "allowed"
            ? "check"
            : result.state === "used"
              ? "clock"
              : "close"
        }
      />
      <div>
        <h3>{result.title}</h3>
        <p>{result.message}</p>
        {result.remainingDays !== undefined && (
          <p>
            {result.remainingDays} días de acceso disponibles, incluido hoy.
          </p>
        )}
      </div>
    </section>
  );
}
