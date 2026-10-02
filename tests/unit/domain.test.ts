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
import { phoneNumber, memberEmail } from "@/shared/schemas";
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
    const window = renewalWindow(1, null, new Date("2026-10-01T15:00:00Z"));
    expect(window.endAt.toISOString()).toBe("2026-11-01T05:00:00.000Z");
    expect(
      membershipStatus(
        { ...window, state: "VALID" },
        new Date("2026-11-01T04:59:59Z"),
      ),
    ).toBe("EXPIRING_SOON");
    expect(membershipStatus({ ...window, state: "VALID" }, window.endAt)).toBe(
      "EXPIRED",
    );
  });
  it("extends early renewal without losing purchased time", () => {
    const end = dayStart("2026-11-02");
    expect(renewalWindow(3, end, dayStart("2026-10-01")).startAt).toEqual(end);
    expect(renewalWindow(3, end, dayStart("2026-10-01")).endAt).toEqual(
      dayStart("2027-02-02"),
    );
  });
  it("restarts an expired membership today", () =>
    expect(
      renewalWindow(1, dayStart("2026-09-01"), dayStart("2026-10-01")).endAt,
    ).toEqual(dayStart("2026-11-01")));
  it.each([
    [1, "2026-11-01"],
    [3, "2027-01-01"],
    [6, "2027-04-01"],
  ])("covers %i calendar months from October 1", (months, end) => {
    expect(renewalWindow(months, null, dayStart("2026-10-01")).endAt).toEqual(
      dayStart(end),
    );
  });
  it.each([
    ["2027-01-31", "2027-03-01"],
    ["2028-01-31", "2028-03-01"],
    ["2028-01-29", "2028-02-29"],
    ["2026-12-15", "2027-01-15"],
  ])("handles month ends and year boundaries from %s", (start, end) => {
    expect(renewalWindow(1, null, dayStart(start)).endAt).toEqual(
      dayStart(end),
    );
  });
  it("rejects invalid dates and durations", () => {
    expect(() => dayStart("2026-02-30")).toThrow();
    expect(() => renewalWindow(0, null)).toThrow();
    for (const duration of [2, 12, 1.5, NaN])
      expect(() => renewalWindow(duration, null)).toThrow();
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
describe("member contact validation", () => {
  it("keeps leading zeroes and accepts at most ten ASCII digits", () => {
    expect(phoneNumber.parse("0991234567")).toBe("0991234567");
    for (const phone of [
      "",
      "09912345678",
      "+593991234567",
      "099 1234567",
      "abc123",
      "１２３４",
    ])
      expect(phoneNumber.safeParse(phone).success).toBe(false);
  });
  it("allows an omitted email but requires a valid address when provided", () => {
    expect(memberEmail.safeParse(undefined).success).toBe(true);
    expect(memberEmail.safeParse("").success).toBe(true);
    expect(memberEmail.safeParse("socio@example.com").success).toBe(true);
    for (const email of [
      "socio.example.com",
      "@example.com",
      "socio@",
      "socio@example.com@other.com",
    ])
      expect(memberEmail.safeParse(email).success).toBe(false);
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
