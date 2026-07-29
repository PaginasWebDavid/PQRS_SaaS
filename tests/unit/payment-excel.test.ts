import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { hasXlsxSignature, parseChargeImportWorkbook } from "../../src/domains/payments/payment-excel";
import { PaymentDomainError } from "../../src/domains/payments/payment-security";

const HEADERS = ["bloque", "apto", "periodo", "concepto", "monto", "vencimiento", "referencia"];

async function buildWorkbookBuffer(rows: unknown[][], headers: string[] = HEADERS): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Obligaciones");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

test("1. hasXlsxSignature detecta la firma ZIP real y rechaza otros contenidos", () => {
  assert.equal(hasXlsxSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00])), true);
  assert.equal(hasXlsxSignature(Buffer.from([0x50, 0x4b, 0x05, 0x06])), true);
  assert.equal(hasXlsxSignature(Buffer.from("no soy un zip")), false);
  assert.equal(hasXlsxSignature(Buffer.from([0xd0, 0xcf, 0x11, 0xe0])), false); // firma OLE2 de .xls binario
});

test("2. parseChargeImportWorkbook acepta un archivo valido con filas correctas", async () => {
  const buffer = await buildWorkbookBuffer([
    [3, 302, "2026-08", "Cuota de administracion", 150000, new Date("2026-08-10T00:00:00.000Z"), "REF-1"],
    [4, 101, "2026-08", "Cuota de administracion", 200000.5, "2026-08-10", ""],
  ]);
  const result = await parseChargeImportWorkbook(buffer);
  assert.equal(result.totalRows, 2);
  assert.equal(result.validRows.length, 2);
  assert.equal(result.invalidRows.length, 0);
  assert.equal(result.validRows[0].amountCents, 150000 * 100);
  assert.equal(result.validRows[1].amountCents, 20000050);
  assert.equal(result.validRows[1].reference, null);
});

test("3. parseChargeImportWorkbook rechaza encabezados desconocidos", async () => {
  const buffer = await buildWorkbookBuffer(
    [[3, 302, "2026-08", "Cuota", 150000, new Date(), ""]],
    ["block", "unit", "period", "concept", "amount", "due", "ref"]
  );
  await assert.rejects(() => parseChargeImportWorkbook(buffer), (error: unknown) => {
    assert.ok(error instanceof PaymentDomainError);
    assert.equal(error.code, "IMPORT_HEADERS_INVALID");
    return true;
  });
});

test("4. parseChargeImportWorkbook marca filas con monto no numerico como invalidas", async () => {
  const buffer = await buildWorkbookBuffer([
    [3, 302, "2026-08", "Cuota", "no-numero", new Date("2026-08-10T00:00:00.000Z"), ""],
  ]);
  const result = await parseChargeImportWorkbook(buffer);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 1);
  assert.match(result.invalidRows[0].message, /[Mm]onto/);
});

test("5. parseChargeImportWorkbook marca fecha de vencimiento invalida", async () => {
  const buffer = await buildWorkbookBuffer([[3, 302, "2026-08", "Cuota", 150000, "fecha-invalida", ""]]);
  const result = await parseChargeImportWorkbook(buffer);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 1);
  assert.match(result.invalidRows[0].message, /vencimiento/);
});

test("6. parseChargeImportWorkbook marca periodo invalido", async () => {
  const buffer = await buildWorkbookBuffer([[3, 302, "26-08", "Cuota", 150000, new Date("2026-08-10T00:00:00.000Z"), ""]]);
  const result = await parseChargeImportWorkbook(buffer);
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 1);
  assert.match(result.invalidRows[0].message, /[Pp]eriodo/);
});

test("7. parseChargeImportWorkbook rechaza formulas donde se esperan valores", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Obligaciones");
  sheet.addRow(HEADERS);
  const row = sheet.addRow([3, 302, "2026-08", "Cuota", null, new Date("2026-08-10T00:00:00.000Z"), ""]);
  row.getCell(5).value = { formula: "=1000*150", result: 150000 } as unknown as ExcelJS.CellValue;
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const result = await parseChargeImportWorkbook(Buffer.from(arrayBuffer));
  assert.equal(result.validRows.length, 0);
  assert.equal(result.invalidRows.length, 1);
  assert.match(result.invalidRows[0].message, /formula/i);
});

test("8. parseChargeImportWorkbook procesa filas validas e invalidas mezcladas (importacion parcial)", async () => {
  const buffer = await buildWorkbookBuffer([
    [3, 302, "2026-08", "Cuota valida", 150000, new Date("2026-08-10T00:00:00.000Z"), ""],
    [4, 101, "fecha-mala", "Cuota invalida", 150000, new Date("2026-08-10T00:00:00.000Z"), ""],
  ]);
  const result = await parseChargeImportWorkbook(buffer);
  assert.equal(result.totalRows, 2);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.invalidRows.length, 1);
});

test("9. parseChargeImportWorkbook falla con un archivo .xlsx corrupto/ilegible", async () => {
  const buffer = Buffer.from("esto no es un xlsx valido");
  await assert.rejects(() => parseChargeImportWorkbook(buffer), (error: unknown) => {
    assert.ok(error instanceof PaymentDomainError);
    assert.equal(error.code, "IMPORT_FILE_UNREADABLE");
    return true;
  });
});
