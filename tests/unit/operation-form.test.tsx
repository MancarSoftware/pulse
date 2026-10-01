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
