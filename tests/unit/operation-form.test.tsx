// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { OperationForm } from "@/components/operation-form";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("form feedback", () => {
  it("labels selects and announces server errors without hiding the form", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Stock insuficiente" } }),
      }),
    );
    render(
      <OperationForm
        endpoint="/test"
        fields={[
          {
            name: "service",
            label: "Servicio",
            type: "select",
            options: [{ value: "a", label: "Máquinas" }],
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Servicio", { exact: true }), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Stock insuficiente"),
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });
  it("reuses the payment idempotency key after a connection failure", async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Conexión interrumpida"))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ reference: "receipt" }),
      });
    vi.stubGlobal("fetch", fetch);
    render(<OperationForm endpoint="/test" fields={[]} financial />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await screen.findByRole("status");
    const first = JSON.parse(fetch.mock.calls[0][1].body);
    const second = JSON.parse(fetch.mock.calls[1][1].body);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
  });
});

it("rejects invalid numeric input and normalizes decimal money", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  render(
    <OperationForm
      endpoint="/test"
      fields={[
        { name: "quantity", label: "Cantidad", type: "number", signed: true },
        { name: "price", label: "Precio", type: "decimal" },
      ]}
    />,
  );
  const quantity = screen.getByLabelText("Cantidad", { exact: true });
  fireEvent.change(quantity, { target: { value: "-12" } });
  fireEvent.change(quantity, { target: { value: "1e3" } });
  expect(quantity).toHaveValue("-12");
  const price = screen.getByLabelText("Precio", { exact: true });
  fireEvent.change(price, { target: { value: "12,50" } });
  fireEvent.change(price, { target: { value: "12,501" } });
  fireEvent.change(price, { target: { value: "abc" } });
  expect(price).toHaveValue("12,50");
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
    quantity: "-12",
    price: "12.50",
  });
});

it("selects several services independently and prevents an empty plan selection", async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal("fetch", fetch);
  render(
    <OperationForm
      endpoint="/test"
      fields={[
        {
          name: "serviceIds",
          label: "Servicios incluidos",
          type: "multiselect",
          value: "machines",
          options: [
            { value: "machines", label: "Máquinas" },
            { value: "dance", label: "Baile" },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByRole("checkbox", { name: "Máquinas" })).toBeChecked();
  fireEvent.click(screen.getByRole("checkbox", { name: "Baile" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  expect(JSON.parse(fetch.mock.calls[0][1].body).serviceIds).toEqual([
    "machines",
    "dance",
  ]);
  fireEvent.click(screen.getByRole("checkbox", { name: "Máquinas" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Baile" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Selecciona al menos una opción",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
