import { z } from "zod";
import { AppError } from "@/shared/errors";
import { applicationUrl } from "@/infrastructure/env";

const platformSchema = z.object({
  appId: z.string().regex(/^\d+$/),
  appSecret: z.string().min(1),
  configId: z.string().regex(/^\d+$/),
  version: z.string().regex(/^v\d+\.\d+$/),
  encryptionKey: z.string().regex(/^[a-f0-9]{64}$/i),
  welcomeTemplate: z.string().regex(/^[a-z0-9_]+$/),
  renewalTemplate: z.string().regex(/^[a-z0-9_]+$/),
  language: z.string().regex(/^[a-z]{2}(?:_[A-Z]{2})?$/),
  siteUrl: z.url().refine((value) => new URL(value).protocol === "https:"),
});
export function whatsappPlatform() {
  const result = platformSchema.safeParse({
    appId: process.env.WHATSAPP_META_APP_ID,
    appSecret: process.env.WHATSAPP_META_APP_SECRET,
    configId: process.env.WHATSAPP_META_CONFIG_ID,
    version: process.env.WHATSAPP_GRAPH_VERSION,
    encryptionKey: process.env.WHATSAPP_ENCRYPTION_KEY,
    welcomeTemplate: process.env.WHATSAPP_WELCOME_TEMPLATE,
    renewalTemplate: process.env.WHATSAPP_RENEWAL_TEMPLATE,
    language: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "es",
    siteUrl: applicationUrl(),
  });
  return result.success ? result.data : null;
}
export type WhatsAppPlatform = NonNullable<ReturnType<typeof whatsappPlatform>>;
export class MetaSignupApi {
  constructor(private platform: WhatsAppPlatform) {}
  async request(path: string, token?: string, body?: Record<string, string>) {
    let response: Response;
    try {
      response = await fetch(
        `https://graph.facebook.com/${this.platform.version}/${path}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body
              ? { "Content-Type": "application/x-www-form-urlencoded" }
              : {}),
          },
          ...(body ? { body: new URLSearchParams(body) } : {}),
          signal: AbortSignal.timeout(20000),
          cache: "no-store",
        },
      );
      if (!response.ok) throw new Error("Meta rejected request");
      return (await response.json()) as Record<string, unknown>;
    } catch {
      throw new AppError(
        "META_CONNECTION",
        "Meta no confirmó la conexión. Revisa los permisos o vuelve a conectar tu número.",
        502,
      );
    }
  }
  async exchange(code: string) {
    const data = await this.request("oauth/access_token", undefined, {
      client_id: this.platform.appId,
      client_secret: this.platform.appSecret,
      redirect_uri: "",
      code,
    });
    return z.string().min(1).parse(data.access_token);
  }
  async verifyAssets(token: string, wabaId: string, phoneNumberId: string) {
    // Fetch the WABA's phones with the exchanged token; never trust browser asset IDs alone.
    const result = await this.request(
      `${wabaId}/phone_numbers?fields=id,display_phone_number,code_verification_status&limit=100`,
      token,
    );
    const phones = z
      .array(
        z.object({
          id: z.string(),
          display_phone_number: z.string(),
          code_verification_status: z.string(),
        }),
      )
      .parse(result.data);
    const phone = phones.find((p) => p.id === phoneNumberId);
    if (!phone || phone.code_verification_status !== "VERIFIED")
      throw new AppError(
        "META_NUMBER",
        "Elige un número verificado en Meta y autoriza su cuenta de WhatsApp.",
        422,
      );
    return phone.display_phone_number;
  }
  async register(token: string, phoneNumberId: string, pin: string) {
    const result = await this.request(`${phoneNumberId}/register`, token, {
      messaging_product: "whatsapp",
      pin,
    });
    if (result.success !== true)
      throw new AppError(
        "META_REGISTER",
        "Meta no confirmó el registro del número.",
        502,
      );
  }
  async templatesReady(token: string, wabaId: string) {
    for (const name of [
      this.platform.welcomeTemplate,
      this.platform.renewalTemplate,
    ]) {
      const result = await this.request(
        `${wabaId}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,components&limit=100`,
        token,
      );
      const templates = z
        .array(
          z.object({
            name: z.string(),
            status: z.string(),
            language: z.string(),
            components: z.array(
              z.object({
                type: z.string(),
                format: z.string().optional(),
                text: z.string().optional(),
              }),
            ),
          }),
        )
        .parse(result.data);
      const valid = templates.some((t) => {
        const body = t.components.find((c) => c.type === "BODY")?.text ?? "";
        const parameters = [...body.matchAll(/\{\{(.*?)\}\}/g)].map(
          (m) => m[1],
        );
        return (
          t.name === name &&
          t.status === "APPROVED" &&
          t.language === this.platform.language &&
          t.components.every((c) =>
            ["HEADER", "BODY", "FOOTER"].includes(c.type),
          ) &&
          t.components.some(
            (c) => c.type === "HEADER" && c.format === "IMAGE",
          ) &&
          ["1", "2", "3", "4", "5", "6"].every((n) => parameters.includes(n)) &&
          parameters.every((n) => ["1", "2", "3", "4", "5", "6"].includes(n))
        );
      });
      if (!valid) return false;
    }
    return true;
  }
}
