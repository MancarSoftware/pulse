import { test, expect, type Page } from "@playwright/test";
import { db } from "@/infrastructure/db";
import { addDays, dayStart, localDate } from "@/shared/dates";
test.afterAll(async () => {
  await db.$disconnect();
});
async function saveDialog(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("Cambios guardados");
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
}
test("real gym acceptance: configure, enroll, check in, sell, expense, renew and tenant boundary", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/register");
  const email = `acceptance-${crypto.randomUUID()}@example.test`;
  const password = `Test-${crypto.randomUUID()}!`;
  await page.getByLabel("Nombre completo").fill("Lucía Administradora");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Crear cuenta de propietario" })
    .click();
  await expect(page).toHaveURL(/setup/);
  await page.getByLabel("Nombre del gimnasio").fill("MANCAR Fitness Test");
  await page.getByLabel("Primera sucursal").fill("Quito Centro");
  await page.getByRole("button", { name: "Crear mi organización" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/settings");
  for (const name of ["Machines", "CrossFit", "Dance"]) {
    await page.getByRole("button", { name: "Agregar", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Nombre", { exact: true })
      .fill(name);
    await saveDialog(page);
  }
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill("Unused service");
  await saveDialog(page);
  await page
    .getByRole("button", { name: "Eliminar Unused service", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Eliminar Unused service", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Eliminar Unused service", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar eliminación" }).click();
  await expect(
    page.getByRole("button", { name: "Eliminar Unused service", exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings?tab=plans");
  await page.getByRole("button", { name: "Nuevo plan" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Machines mensual");
  await dialog.getByLabel("Precio USD").fill("25.00");
  await dialog.getByLabel("Duración de la membresía").selectOption("1");
  await dialog.getByRole("checkbox", { name: "Machines", exact: true }).check();
  await saveDialog(page);
  await page.goto("/settings?tab=staff");
  await page.getByRole("button", { name: "Nuevo empleado" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Recepcionista Uno");
  const employeeEmail = `reception-${crypto.randomUUID()}@example.test`;
  await dialog.getByLabel("Email de trabajo").fill(employeeEmail);
  await dialog.getByLabel(/Contraseña inicial/).fill(password);
  await dialog
    .getByLabel("Sucursal", { exact: true })
    .selectOption({ label: "Quito Centro" });
  await dialog.getByLabel("Rol", { exact: true }).selectOption("RECEPTIONIST");
  await saveDialog(page);
  await page.goto("/members");
  await page.getByRole("button", { name: "Nuevo socio" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombres", { exact: true }).fill("Andrea");
  await dialog.getByLabel("Apellidos").fill("López");
  await dialog.getByLabel("Teléfono", { exact: true }).fill("09a9");
  await expect(dialog.getByLabel("Teléfono", { exact: true })).toHaveValue(
    "099",
  );
  await expect(dialog.getByLabel("Teléfono", { exact: true })).toHaveAttribute(
    "maxlength",
    "10",
  );
  await dialog
    .getByLabel("Email", { exact: true })
    .fill("sin-arroba.example.com");
  expect(
    await dialog
      .getByLabel("Email", { exact: true })
      .evaluate((el) => (el as HTMLInputElement).checkValidity()),
  ).toBe(false);
  await dialog.getByLabel("Email", { exact: true }).fill("andrea@example.test");
  await dialog.getByLabel("Teléfono").fill("0990000011");
  await dialog.getByRole("button", { name: "Registrar socio" }).click();
  await expect(page).toHaveURL(/members\//);
  const memberUrl = page.url();
  const memberId = memberUrl.split("/").pop()!;
  await page.getByLabel("Plan", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel(/Confirma el importe USD/).fill("25.00");
  await page
    .getByLabel("Forma de pago", { exact: true })
    .selectOption({ label: "Efectivo" });
  await page
    .getByRole("button", { name: "Confirmar cobro y membresía" })
    .click();
  await expect(page.getByRole("status")).toContainText("Recibo");
  await expect(
    page.getByRole("img", { name: "Credencial QR de Andrea" }),
  ).toBeVisible();
  await page.goto("/check-in?q=Andrea");
  const result = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Resultado de búsqueda" }),
  });
  await result
    .getByLabel("Servicio", { exact: true })
    .selectOption({ label: "Machines" });
  await result.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(result.getByRole("status")).toContainText("Acceso permitido");
  await result
    .getByLabel("Servicio", { exact: true })
    .selectOption({ label: "CrossFit" });
  await result.getByRole("button", { name: "Registrar ingreso" }).click();
  await expect(result.getByRole("alert")).toContainText("Acceso denegado");
  await page.getByLabel("Servicio del pase").selectOption({ label: "Dance" });
  await page.getByLabel("Importe USD", { exact: true }).fill("3.50");
  await page
    .getByLabel("Método de pago", { exact: true })
    .selectOption({ label: "Efectivo" });
  await page.getByRole("button", { name: "Cobrar pase del día" }).click();
  await expect(page.getByRole("status").last()).toContainText("Recibo");
  await page.goto("/inventory");
  await page.getByRole("button", { name: "Nuevo producto" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nombre", { exact: true }).fill("Agua 600ml");
  await dialog.getByLabel("SKU", { exact: true }).fill("WATER-600");
  await dialog.getByLabel("Precio USD").fill("1.25");
  await saveDialog(page);
  await page.getByRole("button", { name: "Mover stock" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Tipo", { exact: true }).selectOption("PURCHASE");
  await dialog.getByLabel(/Cantidad con signo/).fill("10");
  await dialog.getByLabel("Motivo", { exact: true }).fill("Compra inicial");
  await dialog.getByRole("button", { name: "Registrar movimiento" }).click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.goto("/pos");
  await page.getByRole("button", { name: "Agregar Agua 600ml" }).click();
  await page.getByRole("button", { name: "Confirmar venta" }).click();
  await expect(page.getByRole("status")).toContainText("Venta registrada");
  await page.getByRole("link", { name: "Abrir recibo" }).click();
  await expect(
    page.getByText("Comprobante interno de registro.", { exact: false }),
  ).toBeVisible();
  await page.goto("/inventory");
  await expect(page.getByText("9 unidades", { exact: true })).toBeVisible();
  await page.goto("/settings?tab=categories");
  await page.getByRole("button", { name: "Agregar", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Nombre", { exact: true })
    .fill("Limpieza");
  await saveDialog(page);
  await page.goto("/expenses");
  await page.getByLabel("Descripción del gasto").fill("Insumos de limpieza");
  await page.getByLabel("Importe USD").fill("2.00");
  await page
    .getByLabel("Categoría", { exact: true })
    .selectOption({ label: "Limpieza" });
  await page
    .getByLabel("Método de pago", { exact: true })
    .selectOption({ label: "Efectivo" });
  await page.getByRole("button", { name: "Registrar gasto y salida" }).click();
  await expect(page.getByRole("status")).toContainText("Recibo");
  await page.goto(memberUrl);
  await page.getByLabel("Plan", { exact: true }).selectOption({ index: 1 });
  await page.getByLabel(/Confirma el importe USD/).fill("25.00");
  await page
    .getByLabel("Forma de pago", { exact: true })
    .selectOption({ label: "Efectivo" });
  await page
    .getByRole("button", { name: "Confirmar cobro y membresía" })
    .click();
  await expect(page.getByRole("status")).toContainText("Recibo");
  await expect(page.getByText("Programada", { exact: true })).toBeVisible();
  await page.goto("/reports");
  await expect(page.getByText(/52[,.]75/).first()).toBeVisible();
  for (const width of [375, 768, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/reports-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({
    path: "test-results/acceptance-reports.png",
    fullPage: true,
  });
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/register");
  await otherPage.getByLabel("Nombre completo").fill("Otro propietario");
  await otherPage
    .getByLabel("Correo electrónico")
    .fill(`other-${crypto.randomUUID()}@example.test`);
  await otherPage.getByLabel("Contraseña", { exact: true }).fill(password);
  await otherPage
    .getByRole("button", { name: "Crear cuenta de propietario" })
    .click();
  await expect(otherPage).toHaveURL(/setup/);
  await otherPage.getByLabel("Nombre del gimnasio").fill("Otro gimnasio");
  await otherPage.getByLabel("Primera sucursal").fill("Otra sede");
  await otherPage
    .getByRole("button", { name: "Crear mi organización" })
    .click();
  await expect(otherPage).toHaveURL(/dashboard/);
  const otherBranch = await otherPage
    .locator('select[name="branch"] option')
    .nth(1)
    .getAttribute("value");
  const crossTenant = await otherPage.request.patch(
    `/api/gym/members/${memberId}`,
    {
      headers: { origin: "http://localhost:3000" },
      data: {
        firstName: "Attack",
        lastName: "Attempt",
        phone: "0990000000",
        branchId: otherBranch,
      },
    },
  );
  expect(crossTenant.status()).toBe(404);
  await otherPage.goto(memberUrl);
  await expect(
    otherPage.getByRole("heading", { name: "Andrea López" }),
  ).toHaveCount(0);
  await other.close();
  await db.membership.updateMany({
    where: { memberId },
    data: {
      startAt: addDays(dayStart(localDate()), -40),
      endAt: addDays(dayStart(localDate()), -1),
    },
  });
  await page.goto("/check-in?q=Andrea");
  const expiredResult = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Resultado de búsqueda" }),
  });
  await expiredResult
    .getByLabel("Servicio", { exact: true })
    .selectOption({ label: "Machines" });
  await expiredResult
    .getByRole("button", { name: "Registrar ingreso" })
    .click();
  await expect(expiredResult.getByRole("alert")).toContainText(
    "Acceso denegado",
  );
  const employee = await browser.newContext();
  const employeePage = await employee.newPage();
  await employeePage.goto("/login");
  await employeePage.getByLabel("Correo electrónico").fill(employeeEmail);
  await employeePage.getByLabel("Contraseña", { exact: true }).fill(password);
  await employeePage
    .getByRole("button", { name: "Entrar a mi gimnasio" })
    .click();
  await expect(employeePage).toHaveURL(/dashboard/);
  await expect(
    employeePage.getByRole("link", { name: "Reportes y caja" }),
  ).toHaveCount(0);
  const denied = await employeePage.request.post("/api/gym/catalog", {
    headers: { origin: "http://localhost:3000" },
    data: { kind: "service", name: "Forbidden" },
  });
  expect(denied.status()).toBe(403);
  await employee.close();
  expect(errors).toEqual([]);
});
