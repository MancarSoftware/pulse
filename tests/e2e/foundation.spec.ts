import { test, expect } from "@playwright/test";
test("owner creates organization, opens protected data and logs out", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.getByRole("link", { name: "Crear organización" }).click();
  await page.getByLabel("Nombre completo").fill("Propietario de prueba");
  const email = `owner-${crypto.randomUUID()}@example.test`;
  const password = `Test-${crypto.randomUUID()}!`;
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Crear cuenta de propietario" })
    .click();
  await expect(page).toHaveURL(/setup/);
  await page.getByLabel("Nombre del gimnasio").fill("Gimnasio E2E");
  await page.getByLabel("Primera sucursal").fill("Sucursal central");
  await page.getByRole("button", { name: "Crear mi organización" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: "Tu jornada, en un vistazo." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const menu = page.getByRole("button", { name: "Menú", exact: true });
  await menu.click();
  await expect(
    page.getByRole("dialog", { name: "Menú principal" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Socios y membresías" })
    .click();
  await expect(page).toHaveURL(/members/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("Buscar en socios").fill("Persona inexistente");
  await page.getByRole("button", { name: "Realizar búsqueda" }).click();
  await expect(page).toHaveURL(/q=Persona/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator("#main")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/login/);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar a mi gimnasio" }).click();
  await expect(page).toHaveURL(/dashboard/);
  const csrf = await page.request.post("/api/gym/catalog", {
    headers: { origin: "https://untrusted.example" },
    data: { kind: "service", name: "CSRF attempt" },
  });
  expect(csrf.status()).toBe(403);
  await page.goto("/settings?tab=whatsapp");
  await expect(
    page.getByRole("button", { name: "Conectar WhatsApp" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/administrador del sistema debe completar/),
  ).toBeVisible();
  const blockedConnect = await page.request.post("/api/gym/whatsapp-connect", {
    headers: { origin: "https://untrusted.example" },
    data: { action: "begin" },
  });
  expect(blockedConnect.status()).toBe(403);
  const unconfigured = await page.request.post("/api/gym/whatsapp-connect", {
    headers: { origin: "http://localhost:3000" },
    data: { action: "begin" },
  });
  expect(unconfigured.status()).toBe(409);
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/login/);
  const denied = await page.request.post("/api/gym/catalog", {
    headers: { origin: "http://localhost:3000" },
    data: { kind: "service", name: "Unauthorized" },
  });
  expect(denied.status()).toBe(401);
});
