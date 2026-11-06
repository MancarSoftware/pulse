import { test, expect } from "@playwright/test";
test("account recovery clearly reports missing delivery configuration and protects action pages", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click();
  await expect(page).toHaveURL(/forgot-password/);
  await expect(
    page.getByText(/El servicio de correo todavía no está habilitado/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar enlace de recuperación" }),
  ).toHaveCount(0);
  for (const route of [
    "forgot-password",
    "reset-password?token=invalid",
    "verify-email",
  ]) {
    const response = await page.goto(`/${route}`);
    expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await page.setViewportSize({ width: 375, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Volver a iniciar sesión" }).click();
    await expect(page).toHaveURL(/login/);
  }
});
