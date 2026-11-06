"use client";
import { useId, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AccessFeedback,
  submitCheckIn,
  type AccessResult,
} from "./access-feedback";
export function QrScanner({
  branchId,
  services,
}: {
  branchId: string;
  services: { id: string; name: string }[];
}) {
  const video = useRef<HTMLVideoElement>(null);
  const id = useId();
  const controls = useRef<{ stop(): void } | null>(null);
  const generation = useRef(0);
  const [result, setResult] = useState<AccessResult | null>(null);
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const router = useRouter();
  useEffect(
    () => () => {
      generation.current++;
      controls.current?.stop();
    },
    [],
  );
  function stop() {
    generation.current++;
    controls.current?.stop();
    controls.current = null;
    setActive(false);
  }
  async function start() {
    if (active || pending) return;
    if (!serviceId) {
      setResult({
        state: "error",
        title: "Selecciona un servicio",
        message:
          "Configura y selecciona un servicio antes de leer la credencial.",
      });
      return;
    }
    const run = ++generation.current;
    setActive(true);
    setResult(null);
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      if (run !== generation.current) return;
      let processed = false;
      const reader = new BrowserQRCodeReader();
      const scanner = await reader.decodeFromVideoDevice(
        undefined,
        video.current!,
        async (value) => {
          if (!value || processed || run !== generation.current) return;
          processed = true;
          controls.current?.stop();
          setActive(false);
          setPending(true);
          const feedback = await submitCheckIn({
            branchId,
            serviceId,
            credential: value.getText(),
          });
          if (run !== generation.current) return;
          setResult(feedback);
          setPending(false);
          if (feedback.state === "allowed") router.refresh();
        },
      );
      if (run !== generation.current || processed) scanner.stop();
      else controls.current = scanner;
    } catch {
      if (run !== generation.current) return;
      setActive(false);
      setPending(false);
      setResult({
        state: "error",
        title: "Cámara no disponible",
        message:
          "Autoriza el acceso a la cámara o usa la búsqueda por nombre o teléfono. No se ha registrado ningún ingreso.",
      });
    }
  }
  return (
    <div>
      {!services.length && (
        <p className="notice warning">
          El gimnasio necesita al menos un servicio habilitado para registrar
          ingresos. Solicita su configuración a la administración.
        </p>
      )}
      <div className="check-in-field">
        <label htmlFor={`${id}-scanner-service`}>Servicio a validar</label>
        <select
          id={`${id}-scanner-service`}
          value={serviceId}
          onChange={(event) => setServiceId(event.target.value)}
          disabled={active || pending}
        >
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </div>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Vista de la cámara para leer QR"
        className={active ? "scanner-video" : "hidden"}
      />
      <div className="inline" style={{ marginTop: 16 }}>
        <button
          className="button"
          onClick={start}
          disabled={active || pending || !services.length}
        >
          {pending ? "Validando…" : "Escanear QR con cámara"}
        </button>
        {active && (
          <button className="button secondary" onClick={stop}>
            Detener cámara
          </button>
        )}
        <a
          href="#manual-member-search"
          onClick={() =>
            document.getElementById("manual-member-search")?.focus()
          }
        >
          Buscar socio sin cámara
        </a>
      </div>
      {result && <AccessFeedback result={result} />}
    </div>
  );
}
