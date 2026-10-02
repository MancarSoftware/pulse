import { expect, it } from "vitest";
import { subscriptionStatus } from "@/modules/billing/status";
import { saasRenewalWindow } from "@/modules/billing/schedule";
import { dayStart } from "@/shared/dates";
it("requires initial payment, permits exactly one local calendar day of grace, then suspends", () => {
  const subscription = {
    trialEndsAt: dayStart("2026-09-01"),
    paidUntil: dayStart("2026-10-30"),
    graceDays: 1,
  };
  expect(
    subscriptionStatus(
      { ...subscription, paidUntil: null },
      dayStart("2026-09-01"),
    ).allowed,
  ).toBe(false);
  expect(
    subscriptionStatus(subscription, new Date("2026-10-30T04:59:59Z")).state,
  ).toBe("ACTIVE");
  expect(subscriptionStatus(subscription, dayStart("2026-10-30")).state).toBe(
    "GRACE",
  );
  expect(
    subscriptionStatus(subscription, new Date("2026-10-31T04:59:59Z")).allowed,
  ).toBe(true);
  expect(subscriptionStatus(subscription, dayStart("2026-10-31")).state).toBe(
    "SUSPENDED",
  );
  expect(subscriptionStatus(null).allowed).toBe(false);
});
it.each([
  [1, "2026-11-30"],
  [3, "2027-01-30"],
  [6, "2027-04-30"],
])(
  "aligns a first %i-month payment without shortening its term",
  (months, end) => {
    const period = saasRenewalWindow(months, null, dayStart("2026-10-02"));
    expect(period.periodStart).toEqual(dayStart("2026-10-02"));
    expect(period.periodEnd).toEqual(dayStart(end));
  },
);
it("uses February's last day but restores day 30 for the next cycle", () => {
  const feb = saasRenewalWindow(
    1,
    dayStart("2027-01-30"),
    dayStart("2027-01-01"),
  );
  expect(feb.periodEnd).toEqual(dayStart("2027-02-28"));
  expect(
    saasRenewalWindow(1, feb.periodEnd, dayStart("2027-02-01")).periodEnd,
  ).toEqual(dayStart("2027-03-30"));
  expect(
    saasRenewalWindow(1, dayStart("2028-01-30"), dayStart("2028-01-01"))
      .periodEnd,
  ).toEqual(dayStart("2028-02-29"));
});
it("keeps a grace payment on its due date and starts a suspended account on payment day", () => {
  const due = dayStart("2026-10-30");
  expect(saasRenewalWindow(3, due, new Date("2026-10-31T04:59:59Z"))).toEqual({
    periodStart: due,
    periodEnd: dayStart("2027-01-30"),
  });
  expect(saasRenewalWindow(1, due, dayStart("2026-10-31"))).toEqual({
    periodStart: dayStart("2026-10-31"),
    periodEnd: dayStart("2026-12-30"),
  });
});
it("does not shorten a first activation on the 31st and rejects unsupported periods", () => {
  expect(saasRenewalWindow(1, null, dayStart("2026-10-31")).periodEnd).toEqual(
    dayStart("2026-12-30"),
  );
  expect(() => saasRenewalWindow(2, null)).toThrow("Duración inválida");
});
