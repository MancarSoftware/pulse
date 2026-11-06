import { formatDateTime } from "@/shared/dates";
import type { subscriptionStatus } from "@/modules/billing/status";
export function SubscriptionNextStep({
  status,
  pending,
  paymentConfigured,
  lastReview,
  paidPeriod,
}: {
  status: ReturnType<typeof subscriptionStatus>;
  pending: boolean;
  paymentConfigured: boolean;
  paidPeriod: boolean;
  lastReview: { status: string; reviewNote: string | null } | null;
}) {
  const cutoff =
    status.state === "TRIAL" || !paidPeriod ? status.endAt : status.graceEndsAt;
  return (
    <section
      className="subscription-next-step"
      aria-label="Próximo paso de suscripción"
    >
      <div>
        <h3>Tu acceso al sistema</h3>
        <p>
          {status.allowed
            ? "El gimnasio puede seguir operando."
            : "El acceso operativo está suspendido. Los datos se conservan."}
        </p>
        {cutoff && (
          <p>
            {status.allowed
              ? "Sin renovación, el acceso se suspende el "
              : "El plazo de acceso terminó el "}
            <strong>{formatDateTime(cutoff)}</strong> (hora de Ecuador).
          </p>
        )}
      </div>
      <div>
        <h3>
          {pending
            ? "Pago en revisión"
            : lastReview?.status === "REJECTED"
              ? "Revisa el pago rechazado"
              : "Tu siguiente paso"}
        </h3>
        <p>
          {pending
            ? "Tu pago está pendiente de revisión. La suscripción se actualizará cuando Gymora confirme que recibió el dinero. Informar un pago no amplía el plazo de acceso."
            : !paymentConfigured
              ? "Gymora debe publicar las instrucciones de pago. Solicítalas a la administración antes de transferir dinero."
              : lastReview?.status === "REJECTED"
                ? "Revisa el motivo en Mis pagos, corrige los datos y presenta una nueva referencia para revisión."
                : "Elige un plan e informa el pago desde esta página. La activación ocurre después de su aprobación."}
        </p>
        {lastReview?.status === "REJECTED" &&
          !pending &&
          lastReview.reviewNote && <p>Motivo: {lastReview.reviewNote}</p>}
      </div>
    </section>
  );
}
