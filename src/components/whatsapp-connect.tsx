"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./icon";
type Platform = { appId: string; configId: string; version: string };
type Connection = {
  displayPhone: string;
  ready: boolean;
  setupMessage: string;
  checkedAt: string;
};
type FacebookSdk = {
  init(options: Record<string, unknown>): void;
  login(
    callback: (response: { authResponse?: { code?: string } }) => void,
    options: Record<string, unknown>,
  ): void;
};
declare global {
  interface Window {
    FB?: FacebookSdk;
  }
}
let sdkPromise: Promise<FacebookSdk> | undefined;
function loadSdk(platform: Platform) {
  if (!sdkPromise)
    sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
      function initialize() {
        if (!window.FB) {
          sdkPromise = undefined;
          reject(
            new Error(
              "No se pudo cargar Meta. Revisa tu conexión e inténtalo nuevamente.",
            ),
          );
          return;
        }
        window.FB.init({
          appId: platform.appId,
          version: platform.version,
          autoLogAppEvents: false,
          xfbml: false,
        });
        resolve(window.FB);
      }
      if (window.FB) {
        initialize();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/es_LA/sdk.js";
      script.async = true;
      const timer = window.setTimeout(() => {
        script.remove();
        sdkPromise = undefined;
        reject(
          new Error("Meta tardó demasiado en responder. Inténtalo nuevamente."),
        );
      }, 20000);
      script.onload = () => {
        clearTimeout(timer);
        initialize();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        sdkPromise = undefined;
        reject(new Error("No se pudo cargar Meta. Revisa tu conexión."));
      };
      document.head.appendChild(script);
    });
  return sdkPromise;
}
async function post(action: string, data: Record<string, unknown> = {}) {
  const response = await fetch("/api/gym/whatsapp-connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error?.message ?? "No se pudo completar la conexión.",
    );
  return result;
}
export function WhatsAppConnect({
  platform,
  connection,
  owner,
}: {
  platform: Platform | null;
  connection: Connection | null;
  owner: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<{
    sdk: FacebookSdk;
    nonce: string;
  } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [failed, setFailed] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  function failure(error: unknown) {
    setBusy(false);
    setPrepared(null);
    setFailed(true);
    setFeedback(
      error instanceof Error
        ? error.message
        : "No se pudo conectar. Inténtalo nuevamente.",
    );
  }
  async function prepare() {
    if (!platform) return;
    setBusy(true);
    setFailed(false);
    setFeedback("Preparando la conexión segura…");
    try {
      if (location.protocol !== "https:")
        throw new Error(
          "Abre el sistema desde su dirección HTTPS para conectar con Meta.",
        );
      const sdk = await loadSdk(platform);
      const { nonce } = await post("begin");
      setPrepared({ sdk, nonce });
      setBusy(false);
      setFeedback(
        "Todo listo. Continúa en Meta para elegir y verificar tu número.",
      );
    } catch (error) {
      failure(error);
    }
  }
  function launch() {
    if (!prepared || !platform) return;
    cleanup.current?.();
    setBusy(true);
    setFailed(false);
    setFeedback("Completa la autorización en la ventana de Meta…");
    let code: string | undefined;
    let assets: { wabaId: string; phoneNumberId: string } | undefined;
    let finished = false;
    const stop = () => {
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      cleanup.current = null;
    };
    const cancel = (message: string) => {
      stop();
      failure(new Error(message));
    };
    const finish = () => {
      if (finished || !code || !assets) return;
      stop();
      setFeedback("Verificando tu número y las plantillas…");
      void post("finish", { nonce: prepared.nonce, code, ...assets })
        .then((result) => {
          setBusy(false);
          setPrepared(null);
          setFeedback(result.message);
          router.refresh();
        })
        .catch(failure);
    };
    function receive(event: MessageEvent) {
      if (
        !["https://www.facebook.com", "https://web.facebook.com"].includes(
          event.origin,
        )
      )
        return;
      let data;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "CANCEL" || data.event === "ERROR") {
        cancel("La autorización no se completó. Puedes volver a intentarlo.");
        return;
      }
      if (
        data.event === "FINISH" &&
        typeof data.data?.waba_id === "string" &&
        /^\d+$/.test(data.data.waba_id) &&
        typeof data.data?.phone_number_id === "string" &&
        /^\d+$/.test(data.data.phone_number_id)
      ) {
        assets = {
          wabaId: data.data.waba_id,
          phoneNumberId: data.data.phone_number_id,
        };
        finish();
      }
    }
    const timer = window.setTimeout(
      () => cancel("La autorización venció. Inicia nuevamente la conexión."),
      10 * 60 * 1000,
    );
    cleanup.current = stop;
    window.addEventListener("message", receive);
    try {
      // Keep FB.login synchronous with the user's click so browsers allow the popup.
      prepared.sdk.login(
        (response) => {
          if (finished) return;
          code = response.authResponse?.code;
          if (!code)
            cancel("Conexión cancelada. Tu número no se ha conectado.");
          else finish();
        },
        {
          config_id: platform.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: { sessionInfoVersion: "3" },
        },
      );
    } catch (error) {
      stop();
      failure(error);
    }
  }
  async function refresh() {
    setBusy(true);
    setFailed(false);
    setFeedback("Comprobando la conexión y las plantillas…");
    try {
      const result = await post("refresh");
      setBusy(false);
      setFeedback(result.message);
      router.refresh();
    } catch (error) {
      failure(error);
    }
  }
  return (
    <div className="whatsapp-connect">
      <div className="whatsapp-connect-heading">
        <span className="whatsapp-connect-icon">
          <Icon name="phone" />
        </span>
        <div>
          <h3>{connection?.displayPhone ?? "El WhatsApp de tu gimnasio"}</h3>
          <span
            className={`status ${connection?.ready ? "success" : "warning"}`}
          >
            {connection?.ready
              ? "Listo para enviar"
              : connection
                ? "Conectado · requiere revisión"
                : "Sin conectar"}
          </span>
        </div>
      </div>
      <p className="muted">
        {connection?.setupMessage ??
          "Conecta tu número con Meta para enviar la bienvenida, las renovaciones y el QR desde tu gimnasio."}
      </p>
      <ol className="whatsapp-connect-steps">
        <li>
          <strong>Autoriza</strong>
          <span>Inicia sesión en Meta y elige tu negocio.</span>
        </li>
        <li>
          <strong>Verifica tu número</strong>
          <span>Meta te guiará para conectarlo a WhatsApp Business.</span>
        </li>
        <li>
          <strong>Activa los mensajes</strong>
          <span>
            Revisamos las plantillas aprobadas de bienvenida y renovación.
          </span>
        </li>
      </ol>
      {!platform && (
        <p className="notice warning">
          La conexión guiada todavía no está habilitada. El administrador del
          sistema debe completar la configuración inicial con Meta; después
          podrás conectar aquí tu número.
        </p>
      )}
      {!owner && (
        <p className="muted">
          Solo el propietario del gimnasio puede autorizar esta conexión.
        </p>
      )}
      <div className="whatsapp-connect-actions">
        <button
          className="button primary"
          disabled={!owner || !platform || busy}
          onClick={prepared ? launch : prepare}
        >
          {busy
            ? "Conectando…"
            : prepared
              ? "Continuar en Meta"
              : connection
                ? "Volver a conectar WhatsApp"
                : "Conectar WhatsApp"}
        </button>
        {connection && (
          <button
            className="button"
            disabled={!owner || !platform || busy}
            onClick={refresh}
          >
            Revisar conexión
          </button>
        )}
      </div>
      {feedback && (
        <p
          role={failed ? "alert" : "status"}
          className={`notice ${failed ? "warning" : "success"}`}
        >
          {feedback}
        </p>
      )}
      <p className="whatsapp-connect-footnote">
        Tu número se selecciona y verifica en Meta. No necesitas copiar tokens
        ni claves. Las tarifas y condiciones de WhatsApp se gestionan con Meta.
      </p>
    </div>
  );
}
