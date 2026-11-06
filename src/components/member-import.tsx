"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import type { MemberImportPreview } from "@/modules/members/import";
import { encodeCsv, memberImportHeaders } from "@/shared/csv";
function download(csv: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MemberImport({
  branches,
}: {
  branches: { id: string; name: string }[];
}) {
  const [branch, setBranch] = useState(branches[0]?.id ?? "");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<MemberImportPreview | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<number | null>(null);
  const requestKey = useRef(crypto.randomUUID());
  const fileVersion = useRef(0);
  function reset() {
    setPreview(null);
    setSelected([]);
    setConfirmed(false);
    setSaved(null);
    setError("");
    requestKey.current = crypto.randomUUID();
  }
  async function upload(file?: File) {
    const version = ++fileVersion.current;
    reset();
    setCsv("");
    if (!file) return;
    if (file.size > 262144) {
      setError(
        "El archivo supera 256 KB. Divide la importación en lotes de hasta 100 socios.",
      );
      return;
    }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (version === fileVersion.current) setCsv(text);
    } catch {
      if (version === fileVersion.current)
        setError(
          "No se pudo leer el archivo como UTF-8. Guarda nuevamente el CSV con esa codificación.",
        );
    }
  }
  async function request(action: "preview" | "confirm") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/gym/member-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          csv,
          branchId: branch,
          ...(action === "confirm"
            ? {
                selectedRows: selected,
                previewToken: preview?.previewToken,
                requestKey: requestKey.current,
                confirmHistorical: confirmed,
              }
            : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "No se pudo procesar el archivo.",
        );
      if (action === "preview") {
        setPreview(result);
        setSelected(
          result.rows
            .filter((row: { status: string }) => row.status === "READY")
            .map((row: { row: number }) => row.row),
        );
        setConfirmed(false);
      } else {
        setSaved(result.count);
        setPreview(null);
      }
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "No se pudo conectar. Inténtalo nuevamente con la misma selección.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Importar socios y membresías">
      <h2>Trae tus socios a Gymora</h2>
      <p>
        Hasta 100 socios por archivo CSV UTF-8. Cada fila puede incluir un
        contrato anterior con sus fechas originales. Se conserva como migrado,
        sin registrar un cobro ni enviar WhatsApp.
      </p>
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          download(
            encodeCsv([
              [...memberImportHeaders],
              [
                "Ana",
                "Ejemplo",
                "0990000000",
                "ana@example.test",
                "",
                "",
                "",
                "",
                "",
                "",
              ],
            ]),
            "gymora-plantilla-socios.csv",
          )
        }
      >
        Descargar plantilla CSV
      </button>
      <details className="import-instructions">
        <summary>Cómo preparar las membresías existentes</summary>
        <p>
          Primero configura los planes y servicios del gimnasio. En plan escribe
          su nombre exacto; inicio y ultimo_dia usan AAAA-MM-DD; importe es el
          monto original declarado (puede ser 0). Se copiarán los servicios
          actuales de ese plan. congelada_desde es opcional y conserva la pausa
          desde esa fecha. Una fila sin estos datos crea únicamente el perfil.
        </p>
        <p>
          No se importan credenciales QR antiguas ni autorizaciones de WhatsApp.
          Cada perfil recibe una credencial de Gymora. Revisa las coincidencias
          en el directorio; los contactos compartidos se registran con revisión
          manual.
        </p>
      </details>
      <div className="filters import-controls">
        <label>
          Sucursal de destino
          <select
            value={branch}
            disabled={busy}
            onChange={(event) => {
              setBranch(event.target.value);
              reset();
            }}
          >
            {branches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Archivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(event) => {
              void upload(event.target.files?.[0]);
            }}
          />
        </label>
        <button
          className="button"
          disabled={busy || !csv || !branch}
          onClick={() => void request("preview")}
        >
          {busy ? "Procesando…" : "Revisar archivo"}
        </button>
      </div>
      {error && (
        <p className="notice danger" role="alert">
          {error}
        </p>
      )}
      {saved !== null && (
        <p className="notice success" role="status">
          Importación completada: {saved} socios. Los contratos migrados no se
          contabilizaron como ingresos.{" "}
          <Link href="/members">Abrir directorio</Link>
        </p>
      )}
      {preview && (
        <>
          <p className="notice">
            {preview.rows.filter((row) => row.status === "READY").length} listos
            · {preview.rows.filter((row) => row.status === "INVALID").length}{" "}
            con errores ·{" "}
            {preview.rows.filter((row) => row.status === "DUPLICATE").length}{" "}
            con coincidencias. Se guardarán únicamente las filas seleccionadas.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Seleccionar</th>
                  <th>Socio / contacto</th>
                  <th>Contrato original</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row}>
                    <td>
                      <label>
                        <input
                          type="checkbox"
                          aria-label={`Importar fila ${row.row}`}
                          checked={selected.includes(row.row)}
                          disabled={row.status !== "READY" || busy}
                          onChange={(event) => {
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, row.row]
                                : current.filter(
                                    (number) => number !== row.row,
                                  ),
                            );
                            setConfirmed(false);
                          }}
                        />
                        Fila {row.row}
                      </label>
                    </td>
                    <td>
                      {row.firstName} {row.lastName}
                      <br />
                      <small>
                        {row.phone} · {row.email || "Sin email"}
                      </small>
                    </td>
                    <td>
                      {row.plan ? (
                        <>
                          {row.plan}
                          <br />
                          <small>
                            {row.start} → {row.lastDay} · USD {row.amount}
                            <br />
                            Servicios: {row.services.join(", ")}
                            {row.frozen
                              ? ` · Congelada desde ${row.frozen}`
                              : ""}
                          </small>
                        </>
                      ) : (
                        "Sin membresía"
                      )}
                    </td>
                    <td>
                      {row.status === "READY"
                        ? "Listo para importar"
                        : row.issues.join(" ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="duplicate-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            Revisé las filas, las fechas y los importes declarados. Entiendo que
            los contratos migrados habilitan acceso según sus fechas, pero no
            generan ingresos en Gymora.
          </label>
          <button
            className="button"
            disabled={busy || !selected.length || !confirmed}
            onClick={() => void request("confirm")}
          >
            Confirmar importación de {selected.length} socios
          </button>
        </>
      )}
    </section>
  );
}
