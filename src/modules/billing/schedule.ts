import { dayStart, localDate } from "@/shared/dates";

export const saasDurations = [1, 3, 6] as const;
export function saasPeriodLabel(months: number) {
  return months === 1
    ? "Mensual"
    : months === 3
      ? "Trimestral"
      : months === 6
        ? "Semestral"
        : `${months} meses (histórico)`;
}

// Always calculate from day 30, so February never moves later cycles to day 28.
function billingDate(year: number, monthIndex: number) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(year, monthIndex, Math.min(30, last)));
  return dayStart(date.toISOString().slice(0, 10));
}

export function saasRenewalWindow(
  months: number,
  paidUntil: Date | null,
  now = new Date(),
) {
  // Twelve is supported only for immutable legacy payment quotes.
  if (![...saasDurations, 12].includes(months))
    throw new Error("Duración inválida");
  const today = dayStart(localDate(now));
  // A payment during grace renews from its due date instead of drifting the cycle.
  const withinGrace =
    paidUntil && now < new Date(paidUntil.getTime() + 86400000);
  const periodStart =
    paidUntil && (paidUntil > today || withinGrace) ? paidUntil : today;
  const [year, month, day] = localDate(periodStart).split("-").map(Number);
  let periodEnd = billingDate(year, month - 1 + months);
  // Initial/late activation gets at least the whole purchased term. Days needed
  // to align to the next billing date are complimentary, never prorated silently.
  if (day > 30) periodEnd = billingDate(year, month + months);
  return { periodStart, periodEnd };
}
