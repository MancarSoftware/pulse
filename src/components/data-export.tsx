"use client";
import { useState, type FormEvent } from "react";
export function DataExport({
  branches,
}: {
  branches: { id: string; name: string }[];
}) {
  const [kind, setKind] = useState("members");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setComplete(false);
    try {
      const response = await fetch("/api/gym/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          branchId: values.get("branchId") || undefined,
          from: values.get("from") || undefined,
          to: values.get("to") || undefined,
        }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.error?.message ?? "No se pudo preparar la exportación.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `gymora-${kind}.csv`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setComplete(true);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "No se pudo conectar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Exportar registros">
      <h2>Descarga tus registros</h2>
      <p>
        CSV para el propietario. Hasta 5000 registros por descarga; usa sucursal
        y fechas para dividir archivos grandes. No incluye contraseñas, tokens
        ni credenciales QR.
      </p>
      <form className="filters" onSubmit={submit}>
        <label>
          Tipo de registros
          <select
            name="kind"
            value={kind}
            disabled={busy}
            onChange={(event) => {
              setKind(event.target.value);
              setComplete(false);
            }}
          >
            <option value="members">Socios</option>
            <option value="memberships">Membresías</option>
            <option value="transactions">Movimientos</option>
          </select>
        </label>
        <label>
          Sucursal
          <select name="branchId" disabled={busy}>
            <option value="">Todas mis sucursales</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Desde
          <input
            name="from"
            type="date"
            required={kind === "transactions"}
            disabled={busy}
          />
        </label>
        <label>
          Hasta
          <input
            name="to"
            type="date"
            required={kind === "transactions"}
            disabled={busy}
          />
        </label>
        <button className="button" disabled={busy}>
          {busy ? "Preparando…" : "Descargar CSV"}
        </button>
      </form>
      <p className="muted">
        Las fechas filtran el alta del socio, el inicio de la membresía o la
        fecha del movimiento. El rango admite hasta 366 días. En socios y
        membresías puedes dejar ambas fechas vacías. Al abrir teléfonos en una
        hoja de cálculo, importa esa columna como texto para conservar el cero
        inicial.
      </p>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {complete && (
        <p className="notice success" role="status">
          Archivo preparado para descargar. Si no aparece, revisa los permisos
          de descarga del navegador.
        </p>
      )}
    </section>
  );
}
