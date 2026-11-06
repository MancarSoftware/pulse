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
import { accessResult, AccessFeedback } from "@/components/access-feedback";
import { CheckInForm } from "@/components/check-in-form";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("distinguishes valid, used, expired and uncertain results without a false success", () => {
  expect(
    accessResult(true, { message: "Acceso permitido", remainingDays: 5 }).state,
  ).toBe("allowed");
  expect(accessResult(true, {}).state).toBe("error");
  expect(
    accessResult(false, {
      error: { code: "DAILY_ACCESS_USED", message: "Ya ingresó hoy" },
    }).state,
  ).toBe("used");
  const expired = accessResult(false, {
    error: { reason: "EXPIRED", message: "Acceso denegado" },
  });
  render(<AccessFeedback result={expired} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Membresía vencida");
});
it("supports manual entry and keeps network failures separate from authorization", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("network"));
  vi.stubGlobal("fetch", fetch);
  render(
    <CheckInForm
      branchId="central"
      memberId="member"
      services={[{ id: "machines", name: "Máquinas" }]}
    />,
  );
  fireEvent.change(screen.getByLabelText("Servicio"), {
    target: { value: "machines" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sin confirmación de acceso",
    ),
  );
  expect(refresh).not.toHaveBeenCalled();
  fetch.mockResolvedValue(
    Response.json({ message: "Acceso permitido · Socio", remainingDays: 8 }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Registrar ingreso" }));
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("8 días"),
  );
  expect(refresh).toHaveBeenCalledOnce();
});
