import { expect, it } from "vitest";
import { subscriptionStatus } from "@/modules/billing/status";
import { dayStart } from "@/shared/dates";
it("requires initial payment, permits three calendar days after paid expiry, then suspends", () => {
  const subscription = {
    trialEndsAt: dayStart("2026-09-01"),
    paidUntil: dayStart("2026-10-01"),
    graceDays: 3,
  };
  expect(
    subscriptionStatus(
      { ...subscription, paidUntil: null },
      dayStart("2026-09-01"),
    ).allowed,
  ).toBe(false);
  expect(
    subscriptionStatus(subscription, new Date("2026-10-01T04:59:59Z")).state,
  ).toBe("ACTIVE");
  expect(subscriptionStatus(subscription, dayStart("2026-10-01")).state).toBe(
    "GRACE",
  );
  expect(
    subscriptionStatus(subscription, new Date("2026-10-04T04:59:59Z")).allowed,
  ).toBe(true);
  expect(subscriptionStatus(subscription, dayStart("2026-10-04")).state).toBe(
    "SUSPENDED",
  );
  expect(subscriptionStatus(null).allowed).toBe(false);
});
