// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Pagination } from "@/components/pagination";
import { PosCart } from "@/components/pos-cart";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows the calculated page counter and preserves filters in navigation", () => {
  render(
    <Pagination
      page={1}
      total={13}
      pageSize={12}
      path="/members"
      search={{ q: "Andrea", status: "active" }}
    />,
  );
  expect(screen.getByText(/Página 1 de 2/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Siguiente →" })).toHaveAttribute(
    "href",
    "/members?q=Andrea&status=active&page=2",
  );
  expect(
    screen.queryByRole("link", { name: "← Anterior" }),
  ).not.toBeInTheDocument();
});
it("limits cart quantities to stock and submits the displayed total's quantities", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: "receipt" }) });
  vi.stubGlobal("fetch", fetch);
  render(
    <PosCart
      branchId="branch"
      methods={[{ id: "cash", name: "Efectivo" }]}
      products={[
        {
          id: "water",
          name: "Agua",
          price: "1.25",
          available: 2,
          sku: "WATER",
          category: "Bebidas",
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Agregar Agua" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Aumentar cantidad de Agua" }),
  );
  expect(
    screen.getByRole("button", { name: "Aumentar cantidad de Agua" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Agregar Agua" })).toBeDisabled();
  expect(screen.getByLabelText("Cantidad de Agua")).toHaveValue("2");
  expect(screen.getAllByText("$2.50")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  expect(JSON.parse(fetch.mock.calls[0][1].body).lines).toEqual([
    { productId: "water", quantity: 2, expectedPrice: "1.25" },
  ]);
  await screen.findByRole("status");
  expect(screen.getByRole("link", { name: "Abrir recibo →" })).toHaveAttribute(
    "href",
    "/receipts/receipt",
  );
});
