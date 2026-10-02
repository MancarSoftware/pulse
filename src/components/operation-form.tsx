"use client";
import { useId, useState, type ReactNode, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { NumericInput } from "./numeric-input";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "tel"
    | "email"
    | "password"
    | "number"
    | "decimal"
    | "date"
    | "textarea"
    | "select"
    | "multiselect"
    | "checkbox";
  options?: { value: string; label: string; detail?: string }[];
  value?: string;
  required?: boolean;
  min?: string;
  max?: string;
  signed?: boolean;
  step?: string;
  hint?: string;
  maxLength?: number;
  pattern?: string;
  numericOnly?: boolean;
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
  const [selected, setSelected] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess("");
    const selections = new FormData(event.currentTarget);
    const missing = fields.find(
      (f) =>
        f.type === "multiselect" &&
        f.required !== false &&
        !selections.getAll(f.name).length,
    );
    if (missing) {
      setError(`Selecciona al menos una opción en ${missing.label}.`);
      event.currentTarget
        .querySelector<HTMLInputElement>(`input[name="${missing.name}"]`)
        ?.focus();
      return;
    }
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
            : f.type === "decimal"
              ? String(formData.get(f.name) ?? "").replace(",", ".")
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
        {fields.map((f) =>
          f.type === "multiselect" ? (
            <fieldset
              key={f.name}
              className="service-selection full"
              aria-describedby={f.hint ? `${formId}-${f.name}-hint` : undefined}
            >
              <legend>{f.label}</legend>
              <div className="service-options">
                {f.options?.map((o) => (
                  <label className="service-option" key={o.value}>
                    <input
                      type="checkbox"
                      name={f.name}
                      value={o.value}
                      defaultChecked={
                        f.value?.split(",").includes(o.value) ?? false
                      }
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              {!f.options?.length && (
                <p className="muted">
                  Agrega un servicio en Configuración antes de crear un plan.
                </p>
              )}
              {f.hint && (
                <small id={`${formId}-${f.name}-hint`}>
                  {f.hint} Marca cada servicio que quieres incluir.
                </small>
              )}
            </fieldset>
          ) : (
            <label key={f.name} className={f.type === "textarea" ? "full" : ""}>
              <span id={`${formId}-${f.name}-label`}>{f.label}</span>
              {f.type === "select" ? (
                <select
                  aria-labelledby={`${formId}-${f.name}-label`}
                  aria-describedby={
                    f.hint || f.options?.some((o) => o.detail)
                      ? `${formId}-${f.name}-hint`
                      : undefined
                  }
                  name={f.name}
                  defaultValue={f.value ?? ""}
                  onChange={(event) =>
                    setSelected((values) => ({
                      ...values,
                      [f.name]: event.target.value,
                    }))
                  }
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
                  maxLength={f.maxLength ?? 2000}
                  required={f.required === true}
                />
              ) : f.type === "checkbox" ? (
                <input
                  aria-labelledby={`${formId}-${f.name}-label`}
                  type="checkbox"
                  name={f.name}
                  defaultChecked={f.value !== "false"}
                  required={f.required === true}
                />
              ) : f.type === "number" || f.type === "decimal" ? (
                <NumericInput
                  aria-labelledby={`${formId}-${f.name}-label`}
                  aria-describedby={
                    f.hint ? `${formId}-${f.name}-hint` : undefined
                  }
                  name={f.name}
                  defaultValue={f.value}
                  decimal={f.type === "decimal"}
                  signed={f.signed}
                  required={f.required !== false}
                  min={
                    f.min ??
                    (f.type === "decimal" ? "0.01" : f.signed ? undefined : "0")
                  }
                  max={f.max}
                  maxLength={f.maxLength ?? (f.type === "decimal" ? 13 : 7)}
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
                  maxLength={f.maxLength ?? (f.type === "password" ? 128 : 240)}
                  pattern={f.pattern}
                  inputMode={f.numericOnly ? "numeric" : undefined}
                  onInput={
                    f.numericOnly
                      ? (event) => {
                          const input = event.currentTarget;
                          input.value = input.value
                            .replace(/[^0-9]/g, "")
                            .slice(0, f.maxLength ?? 240);
                        }
                      : undefined
                  }
                  autoComplete={
                    f.type === "password" ? "new-password" : undefined
                  }
                />
              )}
              {(f.hint || f.options?.some((o) => o.detail)) && (
                <small id={`${formId}-${f.name}-hint`} aria-live="polite">
                  {f.hint}{" "}
                  {
                    f.options?.find(
                      (o) => o.value === (selected[f.name] ?? f.value),
                    )?.detail
                  }
                </small>
              )}
            </label>
          ),
        )}
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
