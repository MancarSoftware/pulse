// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SubscriptionNextStep } from "@/components/subscription-next-step";
import { subscriptionStatus } from "@/modules/billing/status";
import { formatDateTime } from "@/shared/dates";
afterEach(cleanup);
it("does not grant grace to a trial or imply a pending payment has restored access", () => {
  const expiry = new Date("2026-11-05T12:00:00Z");
  const status = subscriptionStatus(
    { trialEndsAt: expiry, paidUntil: null, graceDays: 1 },
    new Date("2026-11-05T13:00:00Z"),
  );
  render(
    <SubscriptionNextStep
      status={status}
      pending
      paidPeriod={false}
      paymentConfigured
      lastReview={null}
    />,
  );
  const section = screen.getByRole("region", {
    name: "Próximo paso de suscripción",
  });
  expect(section).toHaveTextContent("suspendido");
  expect(section).toHaveTextContent(formatDateTime(expiry).replace(/\s/g, " "));
  expect(section).toHaveTextContent("Informar un pago no amplía");
  expect(section).not.toHaveTextContent(
    formatDateTime(status.graceEndsAt!).replace(/\s/g, " "),
  );
});
it("shows rejection reasons and an actionable next step", () => {
  render(
    <SubscriptionNextStep
      status={subscriptionStatus(null)}
      pending={false}
      paidPeriod={false}
      paymentConfigured
      lastReview={{
        status: "REJECTED",
        reviewNote: "Referencia no encontrada",
      }}
    />,
  );
  expect(screen.getByText(/Motivo: Referencia no encontrada/)).toBeVisible();
  expect(screen.getByText(/presenta una nueva referencia/)).toBeVisible();
});
