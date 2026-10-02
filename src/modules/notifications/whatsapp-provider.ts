import { z } from "zod";
import QRCode from "qrcode";
const configSchema = z.object({
  organizationId: z.string().min(1),
  token: z.string().min(1),
  phoneNumberId: z.string().regex(/^\d+$/),
  version: z.string().regex(/^v\d+\.\d+$/),
  welcomeTemplate: z.string().regex(/^[a-z0-9_]+$/),
  renewalTemplate: z.string().regex(/^[a-z0-9_]+$/),
  language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
});
export type WhatsAppConfig = z.infer<typeof configSchema>;
export function whatsAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): WhatsAppConfig | null {
  const result = configSchema.safeParse({
    organizationId: env.WHATSAPP_ORGANIZATION_ID,
    token: env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    version: env.WHATSAPP_GRAPH_VERSION,
    welcomeTemplate: env.WHATSAPP_WELCOME_TEMPLATE,
    renewalTemplate: env.WHATSAPP_RENEWAL_TEMPLATE,
    language: env.WHATSAPP_TEMPLATE_LANGUAGE ?? "es",
  });
  return result.success ? result.data : null;
}
export class WhatsAppFailure extends Error {
  constructor(
    public disposition: "retry" | "failed" | "review",
    message: string,
  ) {
    super(message);
  }
}
export interface WhatsAppProvider {
  uploadQr(credential: string): Promise<string>;
  sendTemplate(input: {
    recipient: string;
    kind: string;
    mediaId: string;
    parameters: string[];
  }): Promise<string>;
}
export class MetaWhatsAppProvider implements WhatsAppProvider {
  constructor(private config: WhatsAppConfig) {}
  private async request(
    path: string,
    body: FormData | string,
    sending: boolean,
  ) {
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${this.config.version}/${this.config.phoneNumberId}/${path}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.token}`,
            ...(typeof body === "string"
              ? { "Content-Type": "application/json" }
              : {}),
          },
          body,
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch {
      throw new WhatsAppFailure(
        sending ? "review" : "retry",
        sending
          ? "Envío sin confirmación. Revisa WhatsApp antes de reenviar."
          : "No se pudo cargar el QR. Se reintentará.",
      );
    }
    if (!response.ok) {
      const disposition =
        response.status === 429
          ? "retry"
          : response.status >= 500
            ? sending
              ? "review"
              : "retry"
            : "failed";
      throw new WhatsAppFailure(
        disposition,
        `Meta respondió HTTP ${response.status}. Revisa la configuración de WhatsApp.`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new WhatsAppFailure(
        sending ? "review" : "retry",
        "Respuesta de Meta sin confirmación válida.",
      );
    }
  }
  async uploadQr(credential: string) {
    const png = await QRCode.toBuffer(credential, {
      width: 512,
      margin: 3,
      errorCorrectionLevel: "M",
    });
    const body = new FormData();
    body.set("messaging_product", "whatsapp");
    body.set("type", "image/png");
    body.set(
      "file",
      new Blob([new Uint8Array(png)], { type: "image/png" }),
      "credencial.png",
    );
    const response = await this.request("media", body, false);
    if (typeof response.id !== "string")
      throw new WhatsAppFailure("retry", "Meta no confirmó la carga del QR.");
    return response.id;
  }
  async sendTemplate(input: {
    recipient: string;
    kind: string;
    mediaId: string;
    parameters: string[];
  }) {
    const response = await this.request(
      "messages",
      JSON.stringify({
        messaging_product: "whatsapp",
        to: input.recipient,
        type: "template",
        template: {
          name:
            input.kind === "WELCOME"
              ? this.config.welcomeTemplate
              : this.config.renewalTemplate,
          language: { code: this.config.language },
          components: [
            {
              type: "header",
              parameters: [{ type: "image", image: { id: input.mediaId } }],
            },
            {
              type: "body",
              parameters: input.parameters.map((text) => ({
                type: "text",
                text,
              })),
            },
          ],
        },
      }),
      true,
    );
    const id = response.messages?.[0]?.id;
    if (typeof id !== "string")
      throw new WhatsAppFailure(
        "review",
        "Meta no confirmó el mensaje. Revisa antes de reenviar.",
      );
    return id;
  }
}
