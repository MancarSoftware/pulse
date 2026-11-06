import { afterEach, expect, it, vi } from "vitest";
import {
  authEmailConfig,
  authEmailContent,
  configuredAuthEmailSender,
} from "@/modules/auth/email";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("stays disabled until a complete valid sender is configured", () => {
  expect(authEmailConfig({ NODE_ENV: "test" })).toBeNull();
  expect(() =>
    authEmailConfig({ NODE_ENV: "test", RESEND_API_KEY: "a-long-secret-key" }),
  ).toThrow();
  expect(() =>
    authEmailConfig({
      NODE_ENV: "test",
      AUTH_EMAIL_FROM: "bad-address",
      RESEND_API_KEY: "a-long-secret-key",
    }),
  ).toThrow();
});
it("rejects untrusted action URLs and escapes query values", () => {
  expect(() =>
    authEmailContent(
      {
        kind: "reset",
        to: "owner@example.test",
        url: "https://evil.example/api/auth/reset",
      },
      "https://gym.example.test",
    ),
  ).toThrow();
  const content = authEmailContent(
    {
      kind: "verify",
      to: "owner@example.test",
      url: 'https://gym.example.test/api/auth/verify-email?token=abc&callbackURL="bad"',
    },
    "https://gym.example.test",
  );
  expect(content.html).toContain("&amp;callbackURL=&quot;bad&quot;");
  expect(content.subject).toContain("Confirma");
});
it("sends through Resend with a stable idempotency key and hides provider errors", async () => {
  vi.stubEnv("RESEND_API_KEY", "a-test-secret-key");
  vi.stubEnv("AUTH_EMAIL_FROM", "accounts@example.test");
  vi.stubEnv("BETTER_AUTH_URL", "https://gym.example.test");
  vi.stubEnv("BETTER_AUTH_SECRET", "a".repeat(40));
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost/test");
  const fetch = vi
    .fn()
    .mockImplementation(async () => Response.json({ id: "message-id" }));
  vi.stubGlobal("fetch", fetch);
  const send = configuredAuthEmailSender()!;
  const message = {
    kind: "reset" as const,
    to: "owner@example.test",
    url: "https://gym.example.test/api/auth/reset-password/private-token",
  };
  await send(message);
  await send(message);
  expect(fetch.mock.calls[0][0]).toBe("https://api.resend.com/emails");
  expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(
    fetch.mock.calls[1][1].headers["Idempotency-Key"],
  );
  fetch.mockResolvedValue(
    Response.json({ error: "SECRET-provider-body" }, { status: 500 }),
  );
  await expect(send(message)).rejects.toThrow(
    "El servicio de correo no confirmó",
  );
});
