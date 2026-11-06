import { expect, it } from "vitest";
import { parseMemberCsv, encodeCsv } from "@/shared/csv";
import { cashCalculation } from "@/shared/cash-math";
it("parses quoted CSV, BOM, accents, semicolons, leading zeros and multiline notes", () => {
  const rows = parseMemberCsv(
    '\uFEFFNombres;Apellidos;Teléfono;notas\r\nAna;Ejemplo;0990000000;"Texto con ; y ""comillas""\nsegunda línea"\r\n',
  );
  expect(rows[0].values.telefono).toBe("0990000000");
  expect(rows[0].values.notas).toBe('Texto con ; y "comillas"\nsegunda línea');
  expect(() =>
    parseMemberCsv('nombres,apellidos,telefono\n"Ana,Ejemplo,099'),
  ).toThrow("comilla");
  expect(() =>
    parseMemberCsv("nombres,apellidos,telefono,telefono\nAna,Ejemplo,099,099"),
  ).toThrow("encabezados");
  expect(() =>
    parseMemberCsv(
      "nombres,apellidos,telefono,credencial\nAna,Ejemplo,099,secreto",
    ),
  ).toThrow("encabezados");
  expect(() =>
    parseMemberCsv(
      "nombres,apellidos,telefono\n" +
        Array.from({ length: 101 }, () => "Ana,Ejemplo,099").join("\n"),
    ),
  ).toThrow("100");
});
it("neutralizes spreadsheet formulas without corrupting trusted negative monetary values", () => {
  const csv = encodeCsv([
    [
      "=HYPERLINK(1)",
      " +cmd",
      'texto "citado"',
      "0990000000",
      { decimal: "-2.25" },
    ],
  ]);
  expect(csv).toContain('"\'=HYPERLINK(1)"');
  expect(csv).toContain('"\' +cmd"');
  expect(csv).toContain('"texto ""citado"""');
  expect(csv).toContain('"-2.25"');
  expect(csv).toContain('"0990000000"');
});
it("calculates cash exactly and excludes noncash methods", () => {
  expect(
    cashCalculation(
      "10",
      "20",
      [
        { id: "cash", net: "10.25" },
        { id: "card", net: "9.99" },
      ],
      ["cash"],
    ),
  ).toEqual({ expected: "20.25", difference: "-0.25" });
  expect(
    cashCalculation("0,10", "0,30", [{ id: "cash", net: "0.20" }], ["cash"]),
  ).toEqual({ expected: "0.30", difference: "0.00" });
  expect(cashCalculation("", "1", [], [])).toBeNull();
});
