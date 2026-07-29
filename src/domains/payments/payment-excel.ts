import ExcelJS from "exceljs";
import {
  MAX_IMPORT_ROWS,
  PaymentDomainError,
  normalizeAmountCents,
  normalizeConcept,
  normalizePeriod,
  normalizeReference,
  normalizeUnit,
} from "@/domains/payments/payment-security";

// La plantilla esperada. El orden de columnas es fijo (mismo patron que la
// importacion masiva de invitaciones ya existente): evita depender de que el
// usuario nombre las columnas exactamente igual, pero SI exige que la
// primera fila declare estos encabezados, para detectar un archivo con la
// estructura equivocada antes de interpretar celdas.
const EXPECTED_HEADERS = ["bloque", "apto", "periodo", "concepto", "monto", "vencimiento", "referencia"] as const;
const REQUIRED_HEADER_COUNT = 6; // "referencia" (columna 7) es opcional.

export type ParsedChargeRow = {
  rowNumber: number;
  bloque: number;
  apto: number;
  period: string;
  concept: string;
  amountCents: number;
  dueDate: Date;
  reference: string | null;
};

export type InvalidChargeRow = {
  rowNumber: number;
  message: string;
};

export type ParsedImportFile = {
  totalRows: number;
  validRows: ParsedChargeRow[];
  invalidRows: InvalidChargeRow[];
};

function normalizeHeaderText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase();
}

// El ZIP (xlsx real) empieza siempre con esta firma binaria. Un archivo
// renombrado de .xls (formato binario OLE2/CFB) u otro tipo no la tendra,
// incluso si el nombre termina en ".xlsx".
export function hasXlsxSignature(buffer: Buffer): boolean {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07)
  );
}

function invalidRowMessage(code: string): string {
  const messages: Record<string, string> = {
    UNIT: "Bloque/apto invalido",
    PERIOD: "Periodo invalido (use AAAA-MM)",
    CONCEPT: "Concepto invalido",
    AMOUNT: "Monto invalido o no numerico",
    DUE_DATE: "Fecha de vencimiento invalida",
    REFERENCE: "Referencia invalida",
    FORMULA: "La celda contiene una formula; se esperaba un valor",
    EMPTY: "Fila vacia o ambigua",
  };
  return messages[code] || "Fila invalida";
}

function isFormulaCell(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && "formula" in (value as Record<string, unknown>);
}

function cellRawValue(row: ExcelJS.Row, column: number): unknown {
  const cell = row.getCell(column);
  return cell.value;
}

export async function parseChargeImportWorkbook(buffer: Buffer): Promise<ParsedImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    // Se pasa un ArrayBuffer (no un Buffer de Node) porque exceljs arrastra
    // su propia copia transitiva de @types/node (via fast-csv) con una
    // definicion de Buffer mas vieja e incompatible con la de este proyecto;
    // el mismo patron ya se usa en la importacion masiva de invitaciones.
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(arrayBuffer);
  } catch {
    throw new PaymentDomainError("IMPORT_FILE_UNREADABLE");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new PaymentDomainError("IMPORT_SHEET_EMPTY");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  for (let column = 1; column <= EXPECTED_HEADERS.length; column += 1) {
    headers.push(normalizeHeaderText(headerRow.getCell(column).text));
  }
  const headersMatch = EXPECTED_HEADERS.slice(0, REQUIRED_HEADER_COUNT).every(
    (expected, index) => headers[index] === expected
  );
  if (!headersMatch) throw new PaymentDomainError("IMPORT_HEADERS_INVALID");

  const dataRowCount = sheet.rowCount - 1;
  if (dataRowCount > MAX_IMPORT_ROWS) throw new PaymentDomainError("IMPORT_TOO_MANY_ROWS");

  const validRows: ParsedChargeRow[] = [];
  const invalidRows: InvalidChargeRow[] = [];
  let totalRows = 0;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    totalRows += 1;

    const bloqueRaw = cellRawValue(row, 1);
    const aptoRaw = cellRawValue(row, 2);
    const periodRaw = row.getCell(3).text;
    const conceptRaw = row.getCell(4).text;
    const amountRaw = cellRawValue(row, 5);
    const dueDateRaw = cellRawValue(row, 6);
    const referenceRaw = row.getCell(7).text;

    if (
      isFormulaCell(bloqueRaw) ||
      isFormulaCell(aptoRaw) ||
      isFormulaCell(amountRaw) ||
      isFormulaCell(dueDateRaw)
    ) {
      invalidRows.push({ rowNumber, message: invalidRowMessage("FORMULA") });
      return;
    }

    const allBlank =
      (bloqueRaw === null || bloqueRaw === undefined || bloqueRaw === "") &&
      (aptoRaw === null || aptoRaw === undefined || aptoRaw === "") &&
      !periodRaw &&
      !conceptRaw &&
      (amountRaw === null || amountRaw === undefined || amountRaw === "");
    if (allBlank) {
      invalidRows.push({ rowNumber, message: invalidRowMessage("EMPTY") });
      return;
    }

    let bloque: number;
    let apto: number;
    try {
      const unit = normalizeUnit(bloqueRaw, aptoRaw);
      bloque = unit.bloque;
      apto = unit.apto;
    } catch {
      invalidRows.push({ rowNumber, message: invalidRowMessage("UNIT") });
      return;
    }

    let period: string;
    try {
      period = normalizePeriod(periodRaw.trim());
    } catch {
      invalidRows.push({ rowNumber, message: invalidRowMessage("PERIOD") });
      return;
    }

    let concept: string;
    try {
      concept = normalizeConcept(conceptRaw);
    } catch {
      invalidRows.push({ rowNumber, message: invalidRowMessage("CONCEPT") });
      return;
    }

    let amountCents: number;
    if (typeof amountRaw !== "number" || !Number.isFinite(amountRaw) || amountRaw <= 0) {
      invalidRows.push({ rowNumber, message: invalidRowMessage("AMOUNT") });
      return;
    }
    try {
      // El Excel expresa el monto en pesos (puede traer decimales de
      // centavos); se redondea UNA sola vez a centavos enteros aqui, nunca
      // se vuelve a convertir a flotante despues de este punto.
      amountCents = normalizeAmountCents(Math.round(amountRaw * 100));
    } catch {
      invalidRows.push({ rowNumber, message: invalidRowMessage("AMOUNT") });
      return;
    }

    let dueDate: Date;
    if (dueDateRaw instanceof Date && !Number.isNaN(dueDateRaw.getTime())) {
      dueDate = dueDateRaw;
    } else if (typeof dueDateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw.trim())) {
      const parsed = new Date(`${dueDateRaw.trim()}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) {
        invalidRows.push({ rowNumber, message: invalidRowMessage("DUE_DATE") });
        return;
      }
      dueDate = parsed;
    } else {
      invalidRows.push({ rowNumber, message: invalidRowMessage("DUE_DATE") });
      return;
    }

    let reference: string | null;
    try {
      reference = normalizeReference(referenceRaw || null);
    } catch {
      invalidRows.push({ rowNumber, message: invalidRowMessage("REFERENCE") });
      return;
    }

    validRows.push({ rowNumber, bloque, apto, period, concept, amountCents, dueDate, reference });
  });

  return { totalRows, validRows, invalidRows };
}
