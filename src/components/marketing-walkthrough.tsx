"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/icon";

const views = [
  {
    name: "Accesos",
    icon: "access",
    title: "Una entrada, todo comprobado",
    description:
      "El QR identifica al socio. Gymora revisa su membresía, el servicio y si ya ingresó hoy.",
  },
  {
    name: "Membresías",
    icon: "members",
    title: "Cada socio, con su próximo paso",
    description:
      "Consulta el plan, la fecha de vencimiento y los servicios incluidos desde el perfil del socio.",
  },
  {
    name: "Caja",
    icon: "pos",
    title: "Una venta que también actualiza el stock",
    description:
      "Agrega productos, elige la forma de pago y confirma la venta en una sola operación.",
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
      <div className="walkthrough-heading">
        <span>CONOCE EL SISTEMA</span>
        <span className="walkthrough-example">Ejemplo de uso</span>
      </div>
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
          <div className="walkthrough-screen">
            {index === 0 && (
              <>
                <div className="walkthrough-screen-title">
                  <Icon name="access" />
                  <span>Control de acceso</span>
                  <span className="walkthrough-status">Membresía vigente</span>
                </div>
                <div className="walkthrough-member">
                  <span className="walkthrough-avatar">
                    <Icon name="members" />
                  </span>
                  <div>
                    <strong>Socio de ejemplo</strong>
                    <span>Mensual · Máquinas</span>
                  </div>
                  <Icon name="check" />
                </div>
                <ol className="walkthrough-checks">
                  <li>
                    <Icon name="check" />
                    Membresía dentro de su vigencia
                  </li>
                  <li>
                    <Icon name="check" />
                    Servicio incluido en el plan
                  </li>
                  <li>
                    <Icon name="check" />
                    Primer acceso del día
                  </li>
                </ol>
                <div className="walkthrough-result">
                  <Icon name="access" />
                  <div>
                    <strong>Listo para entrenar</strong>
                    <span>El ingreso queda registrado.</span>
                  </div>
                </div>
              </>
            )}
            {index === 1 && (
              <>
                <div className="walkthrough-screen-title">
                  <Icon name="members" />
                  <span>Perfil del socio</span>
                  <span className="walkthrough-status">Plan mensual</span>
                </div>
                <div className="walkthrough-member">
                  <span className="walkthrough-avatar">
                    <Icon name="members" />
                  </span>
                  <div>
                    <strong>Socio de ejemplo</strong>
                    <span>Su membresía, en un solo lugar</span>
                  </div>
                </div>
                <dl className="walkthrough-details">
                  <div>
                    <dt>Duración</dt>
                    <dd>1 mes calendario</dd>
                  </div>
                  <div>
                    <dt>Servicio incluido</dt>
                    <dd>Máquinas</dd>
                  </div>
                  <div>
                    <dt>Acceso</dt>
                    <dd>Una vez al día</dd>
                  </div>
                </dl>
                <div className="walkthrough-result">
                  <Icon name="clock" />
                  <div>
                    <strong>Renovar sin perder días</strong>
                    <span>
                      La renovación anticipada continúa al vencer el plan.
                    </span>
                  </div>
                </div>
              </>
            )}
            {index === 2 && (
              <>
                <div className="walkthrough-screen-title">
                  <Icon name="pos" />
                  <span>Punto de venta</span>
                  <span className="walkthrough-status">Productos</span>
                </div>
                <div className="walkthrough-sale">
                  <Icon name="inventory" />
                  <div>
                    <strong>Agua mineral 600 ml</strong>
                    <span>Producto de ejemplo</span>
                  </div>
                  <span>1 unidad</span>
                </div>
                <ol className="walkthrough-checks">
                  <li>
                    <Icon name="check" />
                    Agrega el producto al carrito
                  </li>
                  <li>
                    <Icon name="check" />
                    Selecciona la forma de pago
                  </li>
                  <li>
                    <Icon name="check" />
                    Confirma el cobro
                  </li>
                </ol>
                <div className="walkthrough-result">
                  <Icon name="check" />
                  <div>
                    <strong>Cobro y stock conectados</strong>
                    <span>
                      La venta registra el movimiento y descuenta unidades.
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="walkthrough-caption">
            <h2>{view.title}</h2>
            <p>{view.description}</p>
          </div>
        </div>
      ))}
      <small className="walkthrough-disclaimer">
        Vista ilustrativa. No muestra datos reales ni registra operaciones.
      </small>
    </div>
  );
}
