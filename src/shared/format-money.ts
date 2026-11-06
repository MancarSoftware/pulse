export function formatMoney(value: string | { toString(): string }) {
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
  }).format(Number(value.toString()));
}
