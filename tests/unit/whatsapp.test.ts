import { describe, expect, it, afterEach, vi } from "vitest";
import {
  ecuadorWhatsAppPhone,
  membershipMessage,
} from "@/modules/notifications/whatsapp-content";
import {
  MetaWhatsAppProvider,
  WhatsAppFailure,
  type WhatsAppConfig,
} from "@/modules/notifications/whatsapp-provider";
import { dayStart } from "@/shared/dates";
const config: WhatsAppConfig = {
  organizationId: "org",
  token: "test-token",
  phoneNumberId: "1234",
  version: "v99.0",
  welcomeTemplate: "welcome",
  renewalTemplate: "renewal",
  language: "es",
};
afterEach(() => vi.unstubAllGlobals());
it("normalizes only Ecuador mobile numbers and includes the final calendar day", () => {
  expect(ecuadorWhatsAppPhone("0991234567")).toBe("593991234567");
  for (const phone of ["021234567", "abc", "593991234567", "123"])
    expect(ecuadorWhatsAppPhone(phone)).toBeNull();
  const message = membershipMessage({
    kind: "WELCOME",
    firstName: "Ana",
    organizationName: "Gym",
    planName: "Mensual",
    startAt: dayStart("2026-10-01"),
    endAt: dayStart("2026-11-01"),
    services: ["Bailoterapia"],
  });
  expect(message.parameters[4]).toContain("31 oct 2026");
  expect(message.text).toContain("un ingreso por día");
});
describe("Meta adapter", () => {
  it("uploads a private QR image and sends the approved renewal template with six parameters", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "media" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: "wamid" }] }),
      });
    vi.stubGlobal("fetch", fetch);
    const provider = new MetaWhatsAppProvider(config);
    expect(await provider.uploadQr(crypto.randomUUID())).toBe("media");
    const form = fetch.mock.calls[0][1].body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect((form.get("file") as Blob).type).toBe("image/png");
    const id = await provider.sendTemplate({
      recipient: "593991234567",
      kind: "RENEWAL",
      mediaId: "media",
      parameters: ["Ana", "Gym", "Mensual", "1 oct", "31 oct", "Bailoterapia"],
    });
    expect(id).toBe("wamid");
    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.template.name).toBe("renewal");
    expect(body.template.components[0].parameters[0].image).toEqual({
      id: "media",
    });
    expect(body.template.components[1].parameters).toHaveLength(6);
  });
  it("does not mark an ambiguous send as failed or safely retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const provider = new MetaWhatsAppProvider(config);
    await expect(
      provider.sendTemplate({
        recipient: "593991234567",
        kind: "WELCOME",
        mediaId: "media",
        parameters: [],
      }),
    ).rejects.toMatchObject({ disposition: "review" });
    await expect(provider.uploadQr(crypto.randomUUID())).rejects.toMatchObject({
      disposition: "retry",
    });
  });
  it("classifies a rate limit separately from a rejected template", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetch);
    const provider = new MetaWhatsAppProvider(config);
    await expect(
      provider.sendTemplate({
        recipient: "593991234567",
        kind: "WELCOME",
        mediaId: "media",
        parameters: [],
      }),
    ).rejects.toMatchObject({ disposition: "retry" });
    await expect(
      provider.sendTemplate({
        recipient: "593991234567",
        kind: "WELCOME",
        mediaId: "media",
        parameters: [],
      }),
    ).rejects.toBeInstanceOf(WhatsAppFailure);
  });
});
