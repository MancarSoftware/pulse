function cents(value: string) {
  if (!/^-?\d{1,18}(\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  return (
    (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"))) *
    (negative ? -1n : 1n)
  );
}
function decimal(value: bigint) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function cashCalculation(
  opening: string,
  counted: string,
  methods: { id: string; net: string }[],
  selected: string[],
) {
  const start = cents(opening.replace(",", ".")),
    actual = cents(counted.replace(",", "."));
  if (start === null || actual === null) return null;
  let expected = start;
  for (const method of methods.filter((item) => selected.includes(item.id))) {
    const amount = cents(method.net);
    if (amount === null) return null;
    expected += amount;
  }
  return {
    expected: decimal(expected),
    difference: decimal(actual - expected),
  };
}
