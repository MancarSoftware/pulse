export const membershipLabels: Record<string, string> = {
  ACTIVE: "Vigente",
  EXPIRING_SOON: "Por vencer",
  EXPIRED: "Vencida",
  FROZEN: "Congelada",
  CANCELLED: "Cancelada",
  SCHEDULED: "Programada",
};
export function durationLabel(months: number) {
  return (
    (
      {
        1: "Mensual · 1 mes",
        3: "Trimestral · 3 meses",
        6: "Semestral · 6 meses",
      } as Record<number, string>
    )[months] ?? "Duración pendiente"
  );
}
