import { afterAll, expect, it } from "vitest";
import { db } from "@/infrastructure/db";
import { createGymoraAuth } from "@/modules/auth/config";
import type { AuthEmail } from "@/modules/auth/email";

afterAll(async () => {
  await db.$disconnect();
});
it("verifies accounts, expires and consumes recovery links once, and revokes all sessions", async () => {
  const messages: AuthEmail[] = [];
  const auth = createGymoraAuth(async (message) => {
    messages.push(message);
  });
  const email = `recovery-${crypto.randomUUID()}@example.test`;
  const password = `Old-${crypto.randomUUID()}`;
  const nextPassword = `New-${crypto.randomUUID()}`;
  const headers = new Headers({ origin: "http://localhost:3000" });
  const signup = await auth.api.signUpEmail({
    body: {
      name: "Recovery Test",
      email,
      password,
      callbackURL: "/login?verified=1",
    },
    headers,
  });
  expect(signup.token).toBeNull();
  expect(messages).toHaveLength(1);
  expect(messages[0].kind).toBe("verify");
  await expect(
    auth.api.signInEmail({ body: { email, password }, headers }),
  ).rejects.toMatchObject({ status: "FORBIDDEN" });
  const verification = await auth.handler(new Request(messages[0].url));
  expect(verification.status).toBe(302);
  expect(
    (await db.user.findUniqueOrThrow({ where: { email } })).emailVerified,
  ).toBe(true);
  const login = await auth.api.signInEmail({
    body: { email, password },
    headers,
  });
  expect(login.token).toBeTruthy();
  const user = await db.user.findUniqueOrThrow({ where: { email } });
  const request = (address = email, redirectTo = "/reset-password") =>
    auth.api.requestPasswordReset({
      body: { email: address, redirectTo },
      headers,
    });
  const missing = await request(`missing-${crypto.randomUUID()}@example.test`);
  const existing = await request();
  expect(missing).toEqual(existing);
  const expired = messages.at(-1)!;
  expect(expired.kind).toBe("reset");
  const expiredToken = new URL(expired.url).pathname.split("/").pop()!;
  const stored = await db.verification.findFirstOrThrow({
    where: { value: user.id },
  });
  expect(stored.identifier).not.toContain(expiredToken);
  expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(900000);
  await db.verification.update({
    where: { id: stored.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expect(
    auth.api.resetPassword({
      body: { token: expiredToken, newPassword: nextPassword },
      headers,
    }),
  ).rejects.toBeDefined();
  const unsafeRedirect = await auth.handler(
    new Request("http://localhost:3000/api/auth/request-password-reset", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, redirectTo: "https://evil.example/reset" }),
    }),
  );
  expect(unsafeRedirect.status).toBe(403);
  await request();
  const token = new URL(messages.at(-1)!.url).pathname.split("/").pop()!;
  const results = await Promise.allSettled([
    auth.api.resetPassword({
      body: { token, newPassword: nextPassword },
      headers,
    }),
    auth.api.resetPassword({
      body: { token, newPassword: nextPassword },
      headers,
    }),
  ]);
  expect(
    results.filter((result) => result.status === "fulfilled"),
  ).toHaveLength(1);
  expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  await expect(
    auth.api.resetPassword({ body: { token, newPassword: password }, headers }),
  ).rejects.toBeDefined();
  await expect(
    auth.api.signInEmail({ body: { email, password }, headers }),
  ).rejects.toBeDefined();
  expect(
    (
      await auth.api.signInEmail({
        body: { email, password: nextPassword },
        headers,
      })
    ).token,
  ).toBeTruthy();
  const disabled = createGymoraAuth(null);
  await expect(
    disabled.api.requestPasswordReset({
      body: { email, redirectTo: "/reset-password" },
      headers,
    }),
  ).rejects.toBeDefined();
});
