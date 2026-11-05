"use client";

import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icon";
import { TrialButton } from "@/components/trial-access";

const views = [
  {
    name: "Accesos",
    icon: "access",
    file: "check-in.webp",
    title: "Comprueba quién puede ingresar.",
    description:
      "Busca al socio o lee su QR. Gymora valida la membresía, el servicio contratado y el ingreso diario antes de registrar el acceso.",
    alt: "Pantalla real de control de acceso de Gymora: búsqueda de socios, lector de credenciales y pase del día, con datos ficticios.",
  },
  {
    name: "Membresías",
    icon: "members",
    file: "members.webp",
    title: "Encuentra al socio y revisa su membresía.",
    description:
      "Consulta el plan, el estado y el vencimiento. Abre su perfil para registrar un pago o renovar por 1, 3 o 6 meses calendario.",
    alt: "Directorio real de socios de Gymora: filtros, planes, vencimientos y estados de membresía, con nombres y teléfonos ficticios.",
  },
  {
    name: "Resumen",
    icon: "dashboard",
    file: "dashboard.webp",
    title: "Empieza la jornada con lo que importa.",
    description:
      "Revisa socios vigentes, ingresos del día y movimientos de caja. Desde el resumen puedes ir directamente a recepción o buscar un socio.",
    alt: "Resumen real de jornada de Gymora con accesos a recepción e indicadores de actividad de un gimnasio ficticio.",
  },
] as const;

export function MarketingWalkthrough() {
  const [active, setActive] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % views.length;
    else if (event.key === "ArrowLeft")
      next = (index + views.length - 1) % views.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = views.length - 1;
    else return;
    event.preventDefault();
    setActive(next);
    buttons.current[next]?.focus();
  }
  return (
    <div className="product-walkthrough">
      <div
        role="tablist"
        aria-label="Explorar funciones de Gymora"
        className="walkthrough-tabs"
      >
        {views.map((view, index) => (
          <button
            key={view.name}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`walkthrough-tab-${index}`}
            aria-controls={`walkthrough-panel-${index}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={(event) => navigate(event, index)}
          >
            <Icon name={view.icon} />
            {view.name}
          </button>
        ))}
      </div>
      {views.map((view, index) => (
        <div
          key={view.name}
          role="tabpanel"
          id={`walkthrough-panel-${index}`}
          aria-labelledby={`walkthrough-tab-${index}`}
          hidden={active !== index}
          tabIndex={0}
          className="walkthrough-panel"
        >
          <div className="walkthrough-caption">
            <h3>{view.title}</h3>
            <p>{view.description}</p>
            <TrialButton className="marketing-text-link">
              Probar esta función <Icon name="arrow" />
            </TrialButton>
          </div>
          <figure className="walkthrough-capture">
            <a
              href={`/previews/${view.file}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Ampliar captura de ${view.name} (abre en otra pestaña)`}
            >
              <Image
                src={`/previews/${view.file}`}
                alt={view.alt}
                width={1200}
                height={850}
                sizes="(max-width: 800px) 90vw, 60vw"
              />
              <span>
                Ampliar captura <Icon name="arrow" />
              </span>
            </a>
          </figure>
        </div>
      ))}
      <small className="walkthrough-disclaimer">
        Capturas del sistema en funcionamiento con datos ficticios. Seleccionar
        una vista no registra operaciones ni abre tu prueba.
      </small>
    </div>
  );
}
