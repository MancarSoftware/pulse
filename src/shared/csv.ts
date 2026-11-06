export const memberImportHeaders = [
  "nombres",
  "apellidos",
  "telefono",
  "email",
  "notas",
  "plan",
  "inicio",
  "ultimo_dia",
  "importe",
  "congelada_desde",
] as const;
export function parseMemberCsv(input: string) {
  if (new TextEncoder().encode(input).length > 262144 || input.includes("\0"))
    throw new Error("El CSV debe ser texto UTF-8 y pesar como máximo 256 KB.");
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delimiter = first.includes(";") && !first.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let endedQuote = false;
  function pushCell() {
    row.push(cell);
    cell = "";
    endedQuote = false;
  }
  function pushRow() {
    pushCell();
    if (row.some((value) => value.trim())) rows.push(row);
    row = [];
    if (rows.length > 101)
      throw new Error("Importa hasta 100 socios por archivo.");
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          endedQuote = true;
        }
      } else cell += c;
    } else if (c === delimiter) pushCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      pushRow();
    } else if (endedQuote) {
      if (!/[ \t]/.test(c))
        throw new Error(
          "CSV inválido: hay texto después de cerrar una comilla.",
        );
    } else if (c === '"') {
      if (cell) throw new Error("CSV inválido: revisa las comillas.");
      quoted = true;
    } else cell += c;
    if (cell.length > 4000 || row.length > 12)
      throw new Error("Hay una celda o una fila demasiado larga.");
  }
  if (quoted) throw new Error("CSV inválido: falta cerrar una comilla.");
  if (cell || row.length || endedQuote) pushRow();
  if (rows.length < 2)
    throw new Error("Incluye los encabezados y al menos un socio.");
  const headers = rows.shift()!.map((value) =>
    value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );
  if (
    new Set(headers).size !== headers.length ||
    headers.some(
      (header) =>
        !memberImportHeaders.includes(
          header as (typeof memberImportHeaders)[number],
        ),
    ) ||
    ["nombres", "apellidos", "telefono"].some(
      (header) => !headers.includes(header),
    )
  )
    throw new Error(
      "Usa los encabezados de la plantilla, sin columnas repetidas o desconocidas.",
    );
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(
        `La fila ${index + 2} no tiene el mismo número de columnas que el encabezado.`,
      );
    return {
      row: index + 2,
      values: Object.fromEntries(
        headers.map((header, position) => [header, values[position].trim()]),
      ) as Record<string, string>,
    };
  });
}
export type CsvCell = string | number | { decimal: string };
export function encodeCsv(rows: CsvCell[][]) {
  const cell = (value: CsvCell) => {
    let text: string;
    if (typeof value === "object") {
      if (!/^-?\d+(?:\.\d+)?$/.test(value.decimal))
        throw new Error("Número CSV inválido");
      text = value.decimal;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new Error("Número CSV inválido");
      text = String(value);
    } else {
      text = value;
      if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
        text = `'${text}`;
    }
    return `"${text.replaceAll('"', '""')}"`;
  };
  return (
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n"
  );
}
