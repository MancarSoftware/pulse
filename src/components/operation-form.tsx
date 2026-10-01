"use client";
import { useId, useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "date"
    | "textarea"
    | "select"
    | "multiselect"
    | "checkbox";
  options?: { value: string; label: string }[];
  value?: string;
  required?: boolean;
  min?: string;
  step?: string;
  hint?: string;
};
export function OperationForm({
  endpoint,
  fields,
  fixed = {},
  label = "Guardar",
  method = "POST",
  redirectTo,
  children,
  financial = false,
}: {
  endpoint: string;
  fields: Field[];
  fixed?: Record<string, unknown>;
  label?: string;
  method?: string;
  redirectTo?: string;
  children?: ReactNode;
  financial?: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [key, setKey] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload: Record<string, unknown> = { ...fixed };
    for (const f of fields)
      payload[f.name] =
        f.type === "checkbox"
          ? formData.has(f.name)
          : f.type === "multiselect"
            ? formData.getAll(f.name)
            : formData.get(f.name);
    if (financial) {
      const nextKey = key ?? crypto.randomUUID();
      setKey(nextKey);
      payload.idempotencyKey = nextKey;
    }
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = result.error?.fields
          ? Object.values(result.error.fields).flat().join(". ")
          : "";
        throw new Error(
          `${result.error?.message ?? "No se pudo guardar"}${details ? `. ${details}` : ""}`,
        );
      }
      setKey(null);
      setSuccess(
        result.message ??
          (result.reference
            ? `Registrado. Recibo ${result.reference}`
            : "Cambios guardados"),
      );
      if (redirectTo) router.push(redirectTo.replace(":id", result.id));
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo conectar. Inténtalo de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="operation-form">
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name} className={f.type === "textarea" ? "full" : ""}>
            <span id={`${formId}-${f.name}-label`}>{f.label}</span>
            {f.type === "multiselect" ? (
              <select
                aria-labelledby={`${formId}-${f.name}-label`}
                aria-describedby={
                  f.hint ? `${formId}-${f.name}-hint` : undefined
                }
                multiple
                name={f.name}
                defaultValue={f.value?.split(",") ?? []}
                required={f.required !== false}
              >
                {f.options?.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "select" ? (
              <select
                aria-labelledby={`${formId}-${f.name}-label`}
                name={f.name}
                defaultValue={f.value ?? ""}
                required={f.required !== false}
              >
                <option value="" disabled>
                  Seleccionar…
                </option>
                {f.options?.map((o) => (
                  <option value={o.value} key={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                aria-labelledby={`${formId}-${f.name}-label`}
                name={f.name}
                defaultValue={f.value}
                rows={3}
                maxLength={2000}
              />
            ) : f.type === "checkbox" ? (
              <input
                aria-labelledby={`${formId}-${f.name}-label`}
                type="checkbox"
                name={f.name}
                defaultChecked={f.value !== "false"}
              />
            ) : (
              <input
                aria-labelledby={`${formId}-${f.name}-label`}
                aria-describedby={
                  f.hint ? `${formId}-${f.name}-hint` : undefined
                }
                type={f.type ?? "text"}
                name={f.name}
                defaultValue={f.value}
                required={f.required !== false}
                min={f.min}
                step={f.step}
                maxLength={f.type === "password" ? 128 : 240}
                autoComplete={
                  f.type === "password" ? "new-password" : undefined
                }
              />
            )}
            {f.hint && <small id={`${formId}-${f.name}-hint`}>{f.hint}</small>}
          </label>
        ))}
      </div>
      {children}
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice success" role="status">
          {success}
        </p>
      )}
      <button disabled={busy} className="button" type="submit">
        {busy ? "Procesando…" : label}
      </button>
    </form>
  );
}
