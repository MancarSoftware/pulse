"use client";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
export function QrScanner({
  branchId,
  services,
}: {
  branchId: string;
  services: { id: string; name: string }[];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const controls = useRef<{ stop(): void } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [active, setActive] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const router = useRouter();
  useEffect(() => () => controls.current?.stop(), []);
  async function start() {
    if (!serviceId) {
      setMessage("Selecciona un servicio");
      setError(true);
      return;
    }
    setActive(true);
    setMessage("");
    setError(false);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      let processed = false;
      controls.current = await reader.decodeFromVideoDevice(
        undefined,
        video.current!,
        async (result) => {
          if (!result || processed) return;
          processed = true;
          controls.current?.stop();
          setActive(false);
          try {
            const response = await fetch("/api/gym/check-ins", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                branchId,
                serviceId,
                credential: result.getText(),
              }),
            });
            const body = await response.json();
            if (!response.ok)
              throw new Error(
                body.error?.message ?? "No se pudo validar el acceso",
              );
            setMessage(
              `${body.message} · ${body.remainingDays} días disponibles`,
            );
            router.refresh();
          } catch (e) {
            setError(true);
            setMessage(e instanceof Error ? e.message : "No se pudo conectar");
          }
        },
      );
    } catch {
      setActive(false);
      setError(true);
      setMessage(
        "No se pudo abrir la cámara. Autoriza el acceso o utiliza búsqueda manual.",
      );
    }
  }
  return (
    <div>
      <label>
        Servicio a validar
        <select
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          disabled={active}
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <video
        ref={video}
        muted
        playsInline
        className={active ? "scanner-video" : "hidden"}
      />
      <div className="inline" style={{ marginTop: 16 }}>
        <button className="button" onClick={start} disabled={active}>
          Escanear QR con cámara
        </button>
        {active && (
          <button
            className="button secondary"
            onClick={() => {
              controls.current?.stop();
              setActive(false);
            }}
          >
            Detener cámara
          </button>
        )}
      </div>
      {message && (
        <p
          role={error ? "alert" : "status"}
          className={`notice ${error ? "danger" : "success"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
