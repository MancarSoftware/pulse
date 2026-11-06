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
const decode = vi.hoisted(() => vi.fn());
vi.mock("@zxing/browser", () => ({
  BrowserQRCodeReader: class {
    decodeFromVideoDevice = decode;
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { QrScanner } from "@/components/qr-scanner";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("stops a camera that finishes opening after its component has unmounted", async () => {
  let opened!: (controls: { stop(): void }) => void;
  decode.mockImplementation(
    () =>
      new Promise((resolve) => {
        opened = resolve;
      }),
  );
  const view = render(
    <QrScanner
      branchId="central"
      services={[{ id: "machines", name: "Máquinas" }]}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Escanear QR con cámara" }),
  );
  await waitFor(() => expect(decode).toHaveBeenCalled());
  view.unmount();
  const stop = vi.fn();
  opened({ stop });
  await waitFor(() => expect(stop).toHaveBeenCalledOnce());
});
it("offers manual search and never claims an access after a camera failure", async () => {
  decode.mockRejectedValue(new Error("camera denied"));
  render(
    <>
      <input id="manual-member-search" aria-label="Buscar socio" />
      <QrScanner
        branchId="central"
        services={[{ id: "machines", name: "Máquinas" }]}
      />
    </>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Escanear QR con cámara" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Cámara no disponible"),
  );
  fireEvent.click(
    screen.getByRole("link", { name: "Buscar socio sin cámara" }),
  );
  expect(screen.getByLabelText("Buscar socio")).toHaveFocus();
});
