import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/infrastructure/db";
import { setupOrganization } from "@/modules/organizations/service";
import type { Context } from "@/modules/auth/permissions";
import {
  beginWhatsAppSignup,
  finishWhatsAppSignup,
  refreshWhatsAppConnection,
  resolveWhatsAppConfig,
  whatsappPublicStatus,
} from "@/modules/notifications/whatsapp-connect";
import {
  MetaSignupApi,
  whatsappPlatform,
} from "@/modules/notifications/whatsapp-platform";
async function fixture(): Promise<Context> {
  const userId = crypto.randomUUID();
  await db.user.create({
    data: {
      id: userId,
      name: "Connection owner",
      email: `${userId}@example.test`,
    },
  });
  await setupOrganization(userId, {
    name: `Connect ${userId}`,
    branchName: "Central",
  });
  const staff = await db.staff.findUniqueOrThrow({ where: { userId } });
  return {
    userId,
    staffId: staff.id,
    organizationId: staff.organizationId,
    branchId: staff.branchId,
    role: "OWNER",
  };
}
beforeEach(() => {
  const env = {
    WHATSAPP_META_APP_ID: "123",
    WHATSAPP_META_APP_SECRET: "server-secret",
    WHATSAPP_META_CONFIG_ID: "456",
    WHATSAPP_GRAPH_VERSION: "v24.0",
    WHATSAPP_ENCRYPTION_KEY: "a".repeat(64),
    WHATSAPP_WELCOME_TEMPLATE: "gym_welcome",
    WHATSAPP_RENEWAL_TEMPLATE: "gym_renewal",
    WHATSAPP_TEMPLATE_LANGUAGE: "es",
    BETTER_AUTH_URL: "https://gym.example.test/",
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await db.$disconnect();
});
function fakeApi(ready = true) {
  const api = new MetaSignupApi(whatsappPlatform()!);
  vi.spyOn(api, "exchange").mockResolvedValue("private-token");
  vi.spyOn(api, "verifyAssets").mockResolvedValue("+593 99 000 0000");
  vi.spyOn(api, "register").mockResolvedValue(undefined);
  vi.spyOn(api, "templatesReady").mockResolvedValue(ready);
  return api;
}
function input(nonce: string) {
  return {
    nonce,
    code: "one-time-code",
    wabaId: "456",
    phoneNumberId:
      String(Date.now()) + String(Math.floor(Math.random() * 10000)),
  };
}
it("restricts connection to owners and requires platform setup", async () => {
  const ctx = await fixture();
  await expect(
    beginWhatsAppSignup({ ...ctx, role: "ADMIN" }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  vi.stubEnv("WHATSAPP_META_APP_SECRET", "");
  await expect(beginWhatsAppSignup(ctx)).rejects.toMatchObject({
    code: "WHATSAPP_SETUP",
  });
});
it("consumes signup once, isolates tenants, encrypts credentials and returns only public status", async () => {
  const a = await fixture(),
    b = await fixture(),
    api = fakeApi();
  const { nonce } = await beginWhatsAppSignup(a);
  const body = input(nonce);
  await expect(finishWhatsAppSignup(b, body, api)).rejects.toMatchObject({
    code: "SIGNUP_EXPIRED",
  });
  const results = await Promise.allSettled([
    finishWhatsAppSignup(a, body, api),
    finishWhatsAppSignup(a, body, api),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(api.exchange).toHaveBeenCalledTimes(1);
  const row = await db.whatsAppConnection.findUniqueOrThrow({
    where: { organizationId: a.organizationId },
  });
  expect(row.ready).toBe(true);
  expect(row.tokenCiphertext).not.toContain("private-token");
  expect((await resolveWhatsAppConfig(a.organizationId))?.token).toBe(
    "private-token",
  );
  expect(await resolveWhatsAppConfig(b.organizationId)).toBeNull();
  expect(
    JSON.stringify(await whatsappPublicStatus(a.organizationId)),
  ).not.toMatch(/private-token|server-secret|tokenCiphertext/);
  const other = await beginWhatsAppSignup(b);
  await expect(
    finishWhatsAppSignup(b, { ...body, nonce: other.nonce }, api),
  ).rejects.toMatchObject({ code: "P2002" });
  expect(
    await db.whatsAppConnection.findUnique({
      where: { organizationId: b.organizationId },
    }),
  ).toBeNull();
});
it("keeps messages disabled until approved templates and fails closed on revoked permissions", async () => {
  const ctx = await fixture(),
    api = fakeApi(false);
  const { nonce } = await beginWhatsAppSignup(ctx);
  expect((await finishWhatsAppSignup(ctx, input(nonce), api)).ready).toBe(
    false,
  );
  expect(await resolveWhatsAppConfig(ctx.organizationId)).toBeNull();
  vi.mocked(api.templatesReady).mockResolvedValue(true);
  expect((await refreshWhatsAppConnection(ctx, api)).ready).toBe(true);
  expect(api.register).toHaveBeenCalledTimes(1);
  vi.mocked(api.verifyAssets).mockRejectedValue(
    new Error("revoked private-token"),
  );
  expect((await refreshWhatsAppConnection(ctx, api)).ready).toBe(false);
  expect(await resolveWhatsAppConfig(ctx.organizationId)).toBeNull();
  expect(
    JSON.stringify(await whatsappPublicStatus(ctx.organizationId)),
  ).not.toContain("private-token");
});
it("rejects expired attempts and unverified assets without saving a connection", async () => {
  const ctx = await fixture(),
    api = fakeApi();
  const first = await beginWhatsAppSignup(ctx);
  await db.whatsAppSignup.update({
    where: { organizationId: ctx.organizationId },
    data: { expiresAt: new Date(0) },
  });
  await expect(
    finishWhatsAppSignup(ctx, input(first.nonce), api),
  ).rejects.toMatchObject({ code: "SIGNUP_EXPIRED" });
  expect(api.exchange).not.toHaveBeenCalled();
  const second = await beginWhatsAppSignup(ctx);
  vi.mocked(api.verifyAssets).mockRejectedValue(new Error("unverified"));
  await expect(
    finishWhatsAppSignup(ctx, input(second.nonce), api),
  ).rejects.toThrow();
  expect(
    await db.whatsAppConnection.findUnique({
      where: { organizationId: ctx.organizationId },
    }),
  ).toBeNull();
});
it("disables sending when platform configuration or encryption keys change", async () => {
  const ctx = await fixture(),
    api = fakeApi();
  const { nonce } = await beginWhatsAppSignup(ctx);
  await finishWhatsAppSignup(ctx, input(nonce), api);
  vi.stubEnv("WHATSAPP_ENCRYPTION_KEY", "b".repeat(64));
  expect(await resolveWhatsAppConfig(ctx.organizationId)).toBeNull();
  vi.stubEnv("WHATSAPP_ENCRYPTION_KEY", "a".repeat(64));
  vi.stubEnv("WHATSAPP_WELCOME_TEMPLATE", "another_template");
  expect(await resolveWhatsAppConfig(ctx.organizationId)).toBeNull();
  expect(
    (await whatsappPublicStatus(ctx.organizationId)).connection?.ready,
  ).toBe(false);
});
