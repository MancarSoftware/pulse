import { afterEach, describe, expect, it, vi } from "vitest";
import {
  openWhatsApp,
  sealWhatsApp,
} from "@/modules/notifications/whatsapp-secrets";
import {
  MetaSignupApi,
  type WhatsAppPlatform,
} from "@/modules/notifications/whatsapp-platform";
const platform: WhatsAppPlatform = {
  appId: "123",
  appSecret: "server-secret",
  configId: "456",
  version: "v24.0",
  encryptionKey: "a".repeat(64),
  welcomeTemplate: "gym_welcome",
  renewalTemplate: "gym_renewal",
  language: "es",
  siteUrl: "https://gym.example.test/",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("WhatsApp connection security", () => {
  it("encrypts secrets with tenant-bound authenticated ciphertext", () => {
    vi.stubEnv("WHATSAPP_ENCRYPTION_KEY", platform.encryptionKey);
    const first = sealWhatsApp("gym-a", "private-token");
    expect(first).not.toContain("private-token");
    expect(sealWhatsApp("gym-a", "private-token")).not.toBe(first);
    expect(openWhatsApp("gym-a", first)).toBe("private-token");
    expect(() => openWhatsApp("gym-b", first)).toThrow();
    expect(() => openWhatsApp("gym-a", first.replace("v1", "v2"))).toThrow();
    vi.stubEnv("WHATSAPP_ENCRYPTION_KEY", "b".repeat(64));
    expect(() => openWhatsApp("gym-a", first)).toThrow();
  });
  it("exchanges the code server-side and validates the phone under the authorized WABA", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ access_token: "private-token" }))
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "789",
              display_phone_number: "+593 99 000 0000",
              code_verification_status: "VERIFIED",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);
    const api = new MetaSignupApi(platform);
    expect(await api.exchange("one-time-code")).toBe("private-token");
    const [url, options] = fetch.mock.calls[0];
    expect(url).not.toContain("server-secret");
    expect(options.body.get("client_secret")).toBe("server-secret");
    expect(await api.verifyAssets("private-token", "456", "789")).toContain(
      "593",
    );
    fetch.mockResolvedValueOnce(Response.json({ data: [] }));
    await expect(
      api.verifyAssets("private-token", "456", "999"),
    ).rejects.toMatchObject({ code: "META_NUMBER" });
  });
  it("requires both approved image templates and exactly the six positional parameters", async () => {
    const template = (
      name: string,
      status = "APPROVED",
      body = "{{1}} {{2}} {{3}} {{4}} {{5}} {{6}}",
    ) => ({
      name,
      language: "es",
      status,
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: body },
      ],
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [template("gym_welcome")] }))
      .mockResolvedValueOnce(
        Response.json({ data: [template("gym_renewal")] }),
      );
    vi.stubGlobal("fetch", fetch);
    const api = new MetaSignupApi(platform);
    expect(await api.templatesReady("private-token", "456")).toBe(true);
    fetch.mockResolvedValueOnce(
      Response.json({ data: [template("gym_welcome", "PENDING")] }),
    );
    expect(await api.templatesReady("private-token", "456")).toBe(false);
    fetch.mockResolvedValueOnce(
      Response.json({
        data: [
          template(
            "gym_welcome",
            "APPROVED",
            "{{1}} {{2}} {{3}} {{4}} {{5}} {{6}} {{8}}",
          ),
        ],
      }),
    );
    expect(await api.templatesReady("private-token", "456")).toBe(false);
  });
  it("never exposes a provider error containing credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private-token server-secret")),
    );
    await expect(
      new MetaSignupApi(platform).exchange("code"),
    ).rejects.toMatchObject({ code: "META_CONNECTION" });
    try {
      await new MetaSignupApi(platform).exchange("code");
    } catch (error) {
      expect(String(error)).not.toMatch(/private-token|server-secret/);
    }
  });
});
