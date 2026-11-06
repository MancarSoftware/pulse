"use client";
import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  AccessFeedback,
  submitCheckIn,
  type AccessResult,
} from "./access-feedback";
export function CheckInForm({
  branchId,
  memberId,
  services,
}: {
  branchId: string;
  memberId?: string;
  services: { id: string; name: string }[];
}) {
  const router = useRouter();
  const id = useId();
  const [result, setResult] = useState<AccessResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setResult(null);
    const feedback = await submitCheckIn({
      branchId,
      serviceId: String(data.get("serviceId")),
      ...(memberId
        ? { memberId }
        : { credential: String(data.get("credential")) }),
    });
    setResult(feedback);
    setBusy(false);
    if (feedback.state === "allowed") router.refresh();
  }
  return (
    <form className="operation-form check-in-form" onSubmit={submit}>
      {!memberId && (
        <label>
          Código de credencial
          <input
            name="credential"
            required
            maxLength={100}
            autoComplete="off"
          />
        </label>
      )}
      <div className="check-in-field">
        <label htmlFor={`${id}-service`}>Servicio</label>
        <select
          id={`${id}-service`}
          name="serviceId"
          required
          disabled={busy}
          defaultValue=""
        >
          <option value="" disabled>
            Seleccionar…
          </option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </div>
      {result && <AccessFeedback result={result} />}
      <button className="button" disabled={busy || !services.length}>
        {busy
          ? "Validando…"
          : memberId
            ? "Registrar ingreso"
            : "Validar credencial"}
      </button>
    </form>
  );
}
