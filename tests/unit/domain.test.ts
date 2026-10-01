import { describe, expect, it } from "vitest";
import {
  addDays,
  dayStart,
  localDate,
  membershipStatus,
  remainingDays,
  renewalWindow,
} from "@/shared/dates";
import { money } from "@/shared/money";
import {
  authorize,
  authorizeBranch,
  can,
  type Context,
} from "@/modules/auth/permissions";
describe("calendar memberships in Ecuador", () => {
  it("uses local date across UTC midnight", () =>
    expect(localDate(new Date("2026-10-02T02:00:00Z"))).toBe("2026-10-01"));
  it("covers every instant of the last paid day", () => {
    const window = renewalWindow(30, null, new Date("2026-10-01T15:00:00Z"));
    expect(window.endAt.toISOString()).toBe("2026-10-31T05:00:00.000Z");
    expect(
      membershipStatus(
        { ...window, state: "VALID" },
        new Date("2026-10-31T04:59:59Z"),
      ),
    ).toBe("EXPIRING_SOON");
    expect(membershipStatus({ ...window, state: "VALID" }, window.endAt)).toBe(
      "EXPIRED",
    );
  });
  it("extends early renewal without losing purchased time", () => {
    const end = dayStart("2026-11-02");
    expect(renewalWindow(15, end, dayStart("2026-10-01")).startAt).toEqual(end);
  });
  it("restarts an expired membership today", () =>
    expect(
      renewalWindow(1, dayStart("2026-09-01"), dayStart("2026-10-01")).endAt,
    ).toEqual(dayStart("2026-10-02")));
  it("rejects invalid dates and durations", () => {
    expect(() => dayStart("2026-02-30")).toThrow();
    expect(() => renewalWindow(0, null)).toThrow();
  });
  it("handles leap day", () =>
    expect(addDays(dayStart("2028-02-28"), 2)).toEqual(dayStart("2028-03-01")));
  it("keeps frozen state and counts remaining calendar days", () => {
    expect(
      membershipStatus({
        state: "FROZEN",
        startAt: dayStart("2026-09-01"),
        endAt: dayStart("2026-09-02"),
      }),
    ).toBe("FROZEN");
    expect(
      remainingDays(dayStart("2026-10-02"), new Date("2026-10-02T04:59:00Z")),
    ).toBe(1);
  });
});
describe("money", () => {
  it("adds exact decimals", () =>
    expect(money("0.10").plus(money("0.20")).toFixed(2)).toBe("0.30"));
  it("rejects excess precision, exponent and negatives", () => {
    for (const value of ["1.001", "1e2", "-1", "NaN"])
      expect(() => money(value)).toThrow();
  });
});
describe("server permissions", () => {
  const ctx: Context = {
    role: "RECEPTIONIST",
    branchId: "a",
    organizationId: "o",
    userId: "u",
    staffId: "s",
  };
  it("blocks financial reporting and admin mutations for reception", () => {
    expect(can(ctx.role, "reports:read")).toBe(false);
    expect(() => authorize(ctx, "staff:write")).toThrow();
    expect(() => authorizeBranch(ctx, "b")).toThrow();
  });
  it("allows reception payments only in their branch", () => {
    expect(() => authorize(ctx, "payments:write")).not.toThrow();
    expect(() => authorizeBranch(ctx, "a")).not.toThrow();
  });
});
