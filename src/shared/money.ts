import { Prisma } from "@/generated/prisma/client";
export const Decimal = Prisma.Decimal;
export function money(value: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
    throw new Error("Importe inválido");
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
export function formatMoney(value: string | { toString(): string }) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(Number(value.toString()));
}
