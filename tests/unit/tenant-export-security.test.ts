import test from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeExportFileNamePart,
  sanitizeSpreadsheetCell,
} from "../../src/domains/platform/tenant-export.service";

test("1. neutraliza todos los prefijos de formula soportados por Excel", () => {
  const malicious = [
    '=HYPERLINK("https://example.invalid")',
    "+SUM(1,2)",
    "-2+3",
    "@SUM(1,2)",
    "\t=CMD()",
    "\r=CMD()",
  ];

  for (const value of malicious) {
    const sanitized = sanitizeSpreadsheetCell(value);
    assert.ok(sanitized.startsWith("'"), `no se neutralizo: ${JSON.stringify(value)}`);
  }
});

test("2. conserva texto normal y elimina saltos de linea", () => {
  assert.equal(sanitizeSpreadsheetCell("Texto normal"), "Texto normal");
  assert.equal(sanitizeSpreadsheetCell("Linea 1\r\nLinea 2"), "Linea 1 Linea 2");
});

test("3. el nombre del archivo queda limitado a caracteres seguros", () => {
  assert.equal(sanitizeExportFileNamePart("../Conjunto\r\nPeligroso"), "..-ConjuntoPeligroso");
  assert.equal(sanitizeExportFileNamePart("***"), "conjunto");
});