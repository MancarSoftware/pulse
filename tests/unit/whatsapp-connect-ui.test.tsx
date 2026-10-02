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
import { WhatsAppConnect } from "@/components/whatsapp-connect";
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.FB;
  vi.clearAllMocks();
});
const platform = { appId: "123", configId: "456", version: "v24.0" };
it("explains missing platform setup without loading Meta or asking for tokens", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<WhatsAppConnect platform={null} connection={null} owner />);
  expect(
    screen.getByRole("button", { name: "Conectar WhatsApp" }),
  ).toBeDisabled();
  expect(
    screen.getByText(/administrador del sistema debe completar/),
  ).toBeVisible();
  expect(document.querySelector('script[src*="facebook"]')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it("prevents an administrator from connecting the owner's number", () => {
  render(
    <WhatsAppConnect platform={platform} connection={null} owner={false} />,
  );
  expect(
    screen.getByRole("button", { name: "Conectar WhatsApp" }),
  ).toBeDisabled();
});
it("keeps popup launch on a user click and ignores spoofed or duplicated signup events", async () => {
  vi.stubGlobal("location", { protocol: "https:" });
  const login = vi.fn(
    (callback: (value: { authResponse: { code: string } }) => void) =>
      callback({ authResponse: { code: "one-time-code" } }),
  );
  window.FB = { init: vi.fn(), login };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ nonce: "a".repeat(43) }))
    .mockResolvedValueOnce(
      Response.json({ ready: true, message: "Conexión verificada" }),
    );
  vi.stubGlobal("fetch", fetch);
  render(<WhatsAppConnect platform={platform} connection={null} owner />);
  fireEvent.click(screen.getByRole("button", { name: "Conectar WhatsApp" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continuar en Meta" }),
    ).toBeEnabled(),
  );
  expect(login).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continuar en Meta" }));
  expect(login).toHaveBeenCalledTimes(1);
  const data = JSON.stringify({
    type: "WA_EMBEDDED_SIGNUP",
    event: "FINISH",
    data: { waba_id: "456", phone_number_id: "789" },
  });
  fireEvent(
    window,
    new MessageEvent("message", {
      origin: "https://attackerfacebook.com",
      data,
    }),
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent(
    window,
    new MessageEvent("message", { origin: "https://www.facebook.com", data }),
  );
  fireEvent(
    window,
    new MessageEvent("message", { origin: "https://www.facebook.com", data }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("Conexión verificada"),
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    action: "finish",
    code: "one-time-code",
    wabaId: "456",
    phoneNumberId: "789",
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});
