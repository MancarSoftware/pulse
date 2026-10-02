// Ecuador continental: offset fixed at UTC-05:00, no daylight saving.
export function localDate(now = new Date()): string {
  return new Date(now.getTime() - 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
export function dayStart(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Fecha inválida");
  const parsed = new Date(`${date}T05:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || localDate(parsed) !== date)
    throw new Error("Fecha inválida");
  return parsed;
}
export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}
export function renewalWindow(
  durationMonths: number,
  latestEnd: Date | null,
  now = new Date(),
) {
  if (![1, 3, 6].includes(durationMonths)) throw new Error("Duración inválida");
  const today = dayStart(localDate(now));
  const startAt = latestEnd && latestEnd > today ? latestEnd : today;
  return { startAt, endAt: addCalendarMonths(startAt, durationMonths) };
}
// The exclusive end is the same local day in the destination month. If that
// day does not exist, cover the entire destination month instead.
export function addCalendarMonths(date: Date, months: number): Date {
  const [year, month, day] = localDate(date).split("-").map(Number);
  const lastDay = new Date(
    Date.UTC(year, month - 1 + months + 1, 0),
  ).getUTCDate();
  const target = new Date(
    Date.UTC(year, month - 1 + months, Math.min(day, lastDay + 1)),
  );
  return dayStart(target.toISOString().slice(0, 10));
}
export function membershipStatus(
  m: { state: string; startAt: Date; endAt: Date },
  now = new Date(),
) {
  if (m.state === "FROZEN" || m.state === "CANCELLED") return m.state;
  if (m.endAt <= now) return "EXPIRED";
  if (m.startAt > now) return "SCHEDULED";
  return remainingDays(m.endAt, now) <= 7 ? "EXPIRING_SOON" : "ACTIVE";
}
export function remainingDays(endAt: Date, now = new Date()) {
  return Math.max(
    0,
    Math.ceil(
      (endAt.getTime() - dayStart(localDate(now)).getTime()) / 86400000,
    ),
  );
}
export function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "medium",
  }).format(new Date(value));
}
