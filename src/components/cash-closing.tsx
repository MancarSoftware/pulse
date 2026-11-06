"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ClosingSnapshot } from "@/modules/cash-closing/service";
import { NumericInput } from "./numeric-input";
import { cashCalculation } from "@/shared/cash-math";
import { formatMoney } from "@/shared/format-money";
export function CashClosingForm({
  initial,
  isToday,
}: {
  initial: ClosingSnapshot;
  isToday: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [opening, setOpening] = useState(initial.latest?.opening ?? "0");
  const [counted, setCounted] = useState(initial.latest?.counted ?? "0");
  const [ids, setIds] = useState<string[]>(
    initial.latest?.cashMethodIds ??
      initial.methods
        .filter((method) => method.name.trim().toLowerCase() === "efectivo")
        .map((method) => method.id),
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const request = useRef<{ body: string; key: string } | null>(null);
  const router = useRouter();
  const calculation = cashCalculation(opening, counted, snapshot.methods, ids);
  const needsReason =
    !!snapshot.latest || (!!calculation && calculation.difference !== "0.00");
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/gym/cash-closing?${new URLSearchParams({ branchId: initial.branchId, date: initial.date })}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error?.message ?? "No se pudo actualizar.");
      setSnapshot(result);
      setConfirmed(false);
      request.current = null;
      setSuccess(
        "Movimientos actualizados. Revisa el cálculo antes de guardar.",
      );
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "No se pudo conectar.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || !calculation) return;
    setBusy(true);
    setError("");
    setSuccess("");
    const payload = {
      branchId: initial.branchId,
      date: initial.date,
      opening: opening.replace(",", "."),
      counted: counted.replace(",", "."),
      cashMethodIds: ids,
      signature: snapshot.signature,
      previousId: snapshot.latest?.id ?? null,
      reason,
    };
    const body = JSON.stringify(payload);
    if (request.current?.body !== body)
      request.current = { body, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/gym/cash-closing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, requestKey: request.current.key }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "No se pudo guardar el cierre.",
        );
      setSuccess(`Cierre guardado. Versión ${result.version}.`);
      setConfirmed(false);
      router.refresh();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo confirmar. Reintenta sin cambiar los datos para evitar duplicados.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Contar y cerrar caja">
      <div className="section-heading cash-closing-heading">
        <h2>Compara lo registrado con lo contado</h2>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          Actualizar movimientos
        </button>
      </div>
      <p>
        El fondo inicial no es ingreso. Selecciona las formas de pago que
        representan dinero físico en esta caja; las tarjetas y transferencias se
        muestran como referencia.
      </p>
      {isToday && (
        <p className="notice">
          El día sigue abierto para registrar operaciones. Este cierre es una
          instantánea; cualquier movimiento posterior requerirá revisar y
          guardar una nueva versión.
        </p>
      )}
      {snapshot.changedSinceClosing && (
        <p className="notice warning" role="status">
          Hay movimientos posteriores al último cierre. Revisa las cifras antes
          de guardar una nueva versión.
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Considerar efectivo</th>
              <th>Forma de pago</th>
              <th>Entradas USD</th>
              <th>Salidas USD</th>
              <th>Neto USD</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.methods.map((method) => (
              <tr key={method.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Efectivo: ${method.name}`}
                    checked={ids.includes(method.id)}
                    disabled={busy}
                    onChange={(event) => {
                      setIds((current) =>
                        event.target.checked
                          ? [...current, method.id]
                          : current.filter((id) => id !== method.id),
                      );
                      setConfirmed(false);
                    }}
                  />
                </td>
                <td>
                  {method.name}
                  {!method.active && " · Deshabilitado"}
                  <br />
                  <small>{method.count} movimientos</small>
                </td>
                <td>{formatMoney(method.incoming)}</td>
                <td>{formatMoney(method.outgoing)}</td>
                <td>{formatMoney(method.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={submit} className="cash-closing-form">
        <div className="form-grid">
          <label>
            Fondo inicial USD
            <NumericInput
              decimal
              required
              min="0"
              max="9999999999.99"
              value={opening}
              disabled={busy}
              onChange={(event) => {
                setOpening(event.target.value);
                setConfirmed(false);
              }}
            />
          </label>
          <label>
            Efectivo contado USD
            <NumericInput
              decimal
              required
              min="0"
              max="9999999999.99"
              value={counted}
              disabled={busy}
              onChange={(event) => {
                setCounted(event.target.value);
                setConfirmed(false);
              }}
            />
          </label>
        </div>
        <dl className="closing-comparison">
          <div>
            <dt>Efectivo esperado</dt>
            <dd>
              {calculation
                ? formatMoney(calculation.expected)
                : "Revisa el fondo inicial"}
            </dd>
          </div>
          <div>
            <dt>Diferencia: contado − esperado</dt>
            <dd>{calculation ? formatMoney(calculation.difference) : "—"}</dd>
          </div>
        </dl>
        <label>
          Motivo de diferencia o nueva versión
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required={needsReason}
            minLength={needsReason ? 5 : 0}
            maxLength={1000}
            disabled={busy}
          />
        </label>
        <p className="muted">
          Un faltante o sobrante no genera un movimiento ni cambia cobros
          anteriores. Para corregir una operación usa su reversión
          correspondiente.
        </p>
        <label className="duplicate-confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            required
            disabled={busy}
          />
          Conté el efectivo y revisé el fondo, las formas de pago y la fecha del
          cierre.
        </label>
        {error && (
          <p role="alert" className="notice danger">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="notice success">
            {success}
          </p>
        )}
        <button
          className="button"
          disabled={busy || !ids.length || !confirmed || !calculation}
        >
          {busy
            ? "Guardando…"
            : snapshot.latest
              ? "Guardar nueva versión de cierre"
              : "Guardar cierre de caja"}
        </button>
      </form>
    </section>
  );
}
