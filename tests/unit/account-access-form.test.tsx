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
const { reset, request, verification } = vi.hoisted(() => ({
  reset: vi.fn(),
  request: vi.fn(),
  verification: vi.fn(),
}));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    resetPassword: reset,
    requestPasswordReset: request,
    sendVerificationEmail: verification,
  }),
}));
import { AccountAccessForm } from "@/components/account-access-form";
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it("explains unavailable mail without pretending a message was sent", () => {
  render(<AccountAccessForm mode="forgot" enabled={false} />);
  expect(screen.getByText(/todavía no está habilitado/)).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
it("offers a new link when the recovery token is absent", () => {
  render(<AccountAccessForm mode="reset" enabled />);
  expect(
    screen.getByRole("link", { name: "Solicita otro enlace" }),
  ).toHaveAttribute("href", "/forgot-password");
  expect(screen.queryByLabelText("Nueva contraseña")).not.toBeInTheDocument();
});
it("blocks mismatched passwords and only succeeds after the server accepts the reset", async () => {
  render(<AccountAccessForm mode="reset" token={"a".repeat(24)} enabled />);
  fireEvent.change(screen.getByLabelText("Nueva contraseña", { exact: true }), {
    target: { value: "Long-password-123" },
  });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
    target: { value: "Other-password-123" },
  });
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("alert")).toHaveTextContent("no coinciden");
  expect(reset).not.toHaveBeenCalled();
  reset.mockResolvedValue({ data: { status: true } });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
    target: { value: "Long-password-123" },
  });
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Contraseña actualizada",
    ),
  );
});
it("shows generic request confirmation and handles rate limits", async () => {
  request
    .mockResolvedValueOnce({ error: { status: 429 } })
    .mockResolvedValueOnce({ data: { status: true } });
  render(<AccountAccessForm mode="forgot" enabled />);
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "owner@example.test" },
  });
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent("Espera unos minutos"),
  );
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "Si el correo corresponde",
    ),
  );
});
