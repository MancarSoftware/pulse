import { createHash, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "@/infrastructure/db";
import type { Context } from "@/modules/auth/permissions";
import { AppError } from "@/shared/errors";
import { MetaSignupApi, whatsappPlatform } from "./whatsapp-platform";
import { openWhatsApp, sealWhatsApp } from "./whatsapp-secrets";
import { whatsAppConfig, type WhatsAppConfig } from "./whatsapp-provider";
import { audit } from "@/modules/transactions/service";
import type { WhatsAppPlatform } from "./whatsapp-platform";

function owner(ctx: Context) {
  if (ctx.role !== "OWNER")
    throw new AppError(
      "FORBIDDEN",
      "Solo el propietario puede conectar WhatsApp.",
      403,
    );
}
function platformRequired() {
  const platform = whatsappPlatform();
  if (!platform)
    throw new AppError(
      "WHATSAPP_SETUP",
      "La conexión con Meta todavía debe habilitarse en el servidor.",
      409,
    );
  return platform;
}
function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function fingerprint(platform: WhatsAppPlatform) {
  return hash(
    JSON.stringify([
      platform.appId,
      platform.configId,
      platform.version,
      platform.welcomeTemplate,
      platform.renewalTemplate,
      platform.language,
    ]),
  );
}
export async function beginWhatsAppSignup(ctx: Context) {
  owner(ctx);
  platformRequired();
  const nonce = randomBytes(32).toString("base64url");
  const data = {
    userId: ctx.userId,
    nonceHash: hash(nonce),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    consumed: false,
  };
  await db.whatsAppSignup.upsert({
    where: { organizationId: ctx.organizationId },
    create: { organizationId: ctx.organizationId, ...data },
    update: data,
  });
  return { nonce };
}
const finishSchema = z.object({
  nonce: z.string().min(40).max(100),
  code: z.string().min(1).max(4096),
  wabaId: z.string().regex(/^\d+$/),
  phoneNumberId: z.string().regex(/^\d+$/),
});
const credentialsSchema = z.object({
  token: z.string().min(1),
  pin: z.string().regex(/^\d{6}$/),
});
export async function finishWhatsAppSignup(
  ctx: Context,
  input: unknown,
  api?: MetaSignupApi,
) {
  owner(ctx);
  const platform = platformRequired();
  const body = finishSchema.parse(input);
  const claimed = await db.whatsAppSignup.updateMany({
    where: {
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      nonceHash: hash(body.nonce),
      consumed: false,
      expiresAt: { gt: new Date() },
    },
    data: { consumed: true },
  });
  if (claimed.count !== 1)
    throw new AppError(
      "SIGNUP_EXPIRED",
      "La conexión venció o ya se utilizó. Inicia nuevamente.",
      409,
    );
  const meta = api ?? new MetaSignupApi(platform);
  const token = await meta.exchange(body.code);
  const displayPhone = await meta.verifyAssets(
    token,
    body.wabaId,
    body.phoneNumberId,
  );
  const credentials = sealWhatsApp(
    ctx.organizationId,
    JSON.stringify({ token, pin: String(randomInt(100000, 1000000)) }),
  );
  const data = {
    phoneNumberId: body.phoneNumberId,
    wabaId: body.wabaId,
    displayPhone,
    tokenCiphertext: credentials,
    configurationFingerprint: fingerprint(platform),
    ready: false,
    registered: false,
    setupMessage:
      "Número autorizado. Pendiente de comprobar el registro y las plantillas.",
    checkedAt: new Date(),
  };
  await db.$transaction(async (tx) => {
    await tx.whatsAppConnection.upsert({
      where: { organizationId: ctx.organizationId },
      create: { organizationId: ctx.organizationId, ...data },
      update: data,
    });
    await audit(tx, ctx, "whatsapp.connection.authorized", ctx.organizationId);
  });
  return refreshWhatsAppConnection(ctx, meta);
}
export async function refreshWhatsAppConnection(
  ctx: Context,
  api?: MetaSignupApi,
) {
  owner(ctx);
  const platform = platformRequired();
  const row = await db.whatsAppConnection.findUnique({
    where: { organizationId: ctx.organizationId },
  });
  if (!row) throw new AppError("NOT_FOUND", "Conecta primero tu número.", 404);
  if (row.configurationFingerprint !== fingerprint(platform))
    throw new AppError(
      "WHATSAPP_SETUP_CHANGED",
      "La configuración de Meta cambió. Vuelve a conectar WhatsApp.",
      409,
    );
  // Fail closed before revalidation; a revoked token cannot leave the connection ready.
  await db.whatsAppConnection.updateMany({
    where: {
      organizationId: ctx.organizationId,
      tokenCiphertext: row.tokenCiphertext,
    },
    data: { ready: false },
  });
  const meta = api ?? new MetaSignupApi(platform);
  let registered = row.registered;
  let ready = false;
  let setupMessage =
    "No se pudo verificar la conexión. Comprueba los permisos de Meta y vuelve a revisar.";
  try {
    const { token, pin } = credentialsSchema.parse(
      JSON.parse(openWhatsApp(ctx.organizationId, row.tokenCiphertext)),
    );
    await meta.verifyAssets(token, row.wabaId, row.phoneNumberId);
    if (!registered) {
      await meta.register(token, row.phoneNumberId, pin);
      registered = true;
    }
    ready = await meta.templatesReady(token, row.wabaId);
    setupMessage = ready
      ? "Número y plantillas verificados. Listo para procesar los mensajes autorizados."
      : "Número conectado. Falta aprobar las plantillas de bienvenida y renovación con QR en Meta.";
  } catch {
    /* Only a safe summary is persisted; provider responses may contain secrets. */
  }
  const saved = await db.$transaction(async (tx) => {
    const result = await tx.whatsAppConnection.updateMany({
      where: {
        organizationId: ctx.organizationId,
        tokenCiphertext: row.tokenCiphertext,
      },
      data: { ready, registered, setupMessage, checkedAt: new Date() },
    });
    if (result.count)
      await audit(tx, ctx, "whatsapp.connection.checked", ctx.organizationId, {
        ready,
        registered,
      });
    return result.count;
  });
  if (!saved)
    throw new AppError(
      "CONFLICT",
      "La conexión cambió. Actualiza la página.",
      409,
    );
  return { ready, message: setupMessage };
}
export async function resolveWhatsAppConfig(
  organizationId: string,
): Promise<WhatsAppConfig | null> {
  const row = await db.whatsAppConnection.findUnique({
    where: { organizationId },
  });
  if (row) {
    const platform = whatsappPlatform();
    if (
      !row.ready ||
      !platform ||
      row.configurationFingerprint !== fingerprint(platform)
    )
      return null;
    try {
      const { token } = credentialsSchema.parse(
        JSON.parse(openWhatsApp(organizationId, row.tokenCiphertext)),
      );
      return {
        organizationId,
        token,
        phoneNumberId: row.phoneNumberId,
        version: platform.version,
        welcomeTemplate: platform.welcomeTemplate,
        renewalTemplate: platform.renewalTemplate,
        language: platform.language,
      };
    } catch {
      return null;
    }
  }
  const legacy = whatsAppConfig();
  return legacy?.organizationId === organizationId ? legacy : null;
}
export async function whatsappPublicStatus(organizationId: string) {
  const row = await db.whatsAppConnection.findUnique({
    where: { organizationId },
    select: {
      displayPhone: true,
      ready: true,
      setupMessage: true,
      checkedAt: true,
    },
  });
  const platform = whatsappPlatform();
  const ready = row ? !!(await resolveWhatsAppConfig(organizationId)) : false;
  return {
    connection: row
      ? {
          ...row,
          checkedAt: row.checkedAt.toISOString(),
          ready,
          setupMessage:
            row.ready && !ready
              ? "La configuración cambió o las credenciales no están disponibles. Vuelve a conectar WhatsApp."
              : row.setupMessage,
        }
      : null,
    platform: platform
      ? {
          appId: platform.appId,
          configId: platform.configId,
          version: platform.version,
        }
      : null,
  };
}
