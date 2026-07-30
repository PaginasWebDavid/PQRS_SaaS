import type { Role } from "@prisma/client";
import { FeatureUnavailableError } from "@/domains/commercial/entitlement.service";

export const PAYMENT_ADMIN_ROLES: Role[] = ["ADMIN"];
export const PAYMENT_READ_ROLES: Role[] = ["ADMIN", "RESIDENTE"];

export const MAX_CONCEPT_LENGTH = 120;
export const MAX_REFERENCE_LENGTH = 120;
export const MAX_REJECTION_REASON_LENGTH = 500;
export const MAX_REVERSAL_REASON_LENGTH = 500;
export const MAX_ORIGINAL_FILE_NAME_LENGTH = 180;

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;
export const MAX_RECEIPT_FILE_BYTES = 8 * 1024 * 1024;

export const MIN_AMOUNT_CENTS = 1;
export const MAX_AMOUNT_CENTS = 500_000_000; // 5.000.000 COP en centavos: tope defensivo, no de negocio.

export const RECEIPT_ALLOWED_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
export type ReceiptMimeType = (typeof RECEIPT_ALLOWED_MIME_TYPES)[number];

export type PaymentErrorCode =
  | "INVALID_INPUT"
  | "UNIT_NOT_FOUND"
  | "CHARGE_NOT_FOUND"
  | "CHARGE_CANCELLED"
  | "RECEIPT_NOT_FOUND"
  | "IMPORT_BATCH_NOT_FOUND"
  | "INVALID_PERIOD"
  | "INVALID_CONCEPT"
  | "INVALID_AMOUNT"
  | "AMOUNT_EXCEEDS_BALANCE"
  | "INVALID_DUE_DATE"
  | "INVALID_REFERENCE"
  | "INVALID_PAID_AT"
  | "INVALID_UNIT"
  | "INVALID_TRANSITION"
  | "REJECTION_REASON_REQUIRED"
  | "REVERSAL_REASON_REQUIRED"
  | "NOT_WITHDRAWABLE"
  | "NOT_REVERSIBLE"
  | "FILE_REQUIRED"
  | "FILE_EMPTY"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_EXTENSION"
  | "INVALID_FILE_TYPE"
  | "INVALID_FILE_SIGNATURE"
  | "INVALID_FILE_NAME"
  | "IMPORT_FILE_UNREADABLE"
  | "IMPORT_SHEET_EMPTY"
  | "IMPORT_HEADERS_INVALID"
  | "IMPORT_TOO_MANY_ROWS"
  | "IMPORT_NO_VALID_ROWS";

const PUBLIC_MESSAGES: Record<PaymentErrorCode, string> = {
  INVALID_INPUT: "Datos invalidos",
  UNIT_NOT_FOUND: "No se encontro la unidad indicada",
  CHARGE_NOT_FOUND: "Obligacion no encontrada",
  CHARGE_CANCELLED: "Esta obligacion esta cancelada",
  RECEIPT_NOT_FOUND: "Comprobante no encontrado",
  IMPORT_BATCH_NOT_FOUND: "Importacion no encontrada",
  INVALID_PERIOD: "El periodo no es valido (formato AAAA-MM)",
  INVALID_CONCEPT: "El concepto no es valido",
  INVALID_AMOUNT: "El monto no es valido",
  AMOUNT_EXCEEDS_BALANCE: "El monto supera el saldo pendiente de la obligacion",
  INVALID_DUE_DATE: "La fecha de vencimiento no es valida",
  INVALID_REFERENCE: "La referencia no es valida",
  INVALID_PAID_AT: "La fecha de pago no es valida",
  INVALID_UNIT: "El bloque o apartamento no es valido",
  INVALID_TRANSITION: "Este comprobante no puede cambiar a ese estado",
  REJECTION_REASON_REQUIRED: "Debes indicar un motivo de rechazo",
  REVERSAL_REASON_REQUIRED: "Debes indicar un motivo de reversion",
  NOT_WITHDRAWABLE: "Este comprobante ya no se puede retirar",
  NOT_REVERSIBLE: "Este pago ya no se puede revertir",
  FILE_REQUIRED: "Debes adjuntar un archivo",
  FILE_EMPTY: "El archivo esta vacio",
  FILE_TOO_LARGE: "El archivo pesa demasiado",
  INVALID_FILE_EXTENSION: "Extension de archivo no permitida",
  INVALID_FILE_TYPE: "Tipo de archivo no permitido",
  INVALID_FILE_SIGNATURE: "El contenido del archivo no coincide con su tipo",
  INVALID_FILE_NAME: "Nombre de archivo invalido",
  IMPORT_FILE_UNREADABLE: "No se pudo leer el archivo .xlsx",
  IMPORT_SHEET_EMPTY: "El archivo no tiene hojas con datos",
  IMPORT_HEADERS_INVALID: "Los encabezados del archivo no coinciden con la plantilla esperada",
  IMPORT_TOO_MANY_ROWS: "El archivo supera el numero maximo de filas permitido",
  IMPORT_NO_VALID_ROWS: "El archivo no tiene filas validas para importar",
};

const PUBLIC_STATUSES: Record<PaymentErrorCode, number> = {
  INVALID_INPUT: 400,
  UNIT_NOT_FOUND: 404,
  CHARGE_NOT_FOUND: 404,
  CHARGE_CANCELLED: 409,
  RECEIPT_NOT_FOUND: 404,
  IMPORT_BATCH_NOT_FOUND: 404,
  INVALID_PERIOD: 400,
  INVALID_CONCEPT: 400,
  INVALID_AMOUNT: 400,
  AMOUNT_EXCEEDS_BALANCE: 409,
  INVALID_DUE_DATE: 400,
  INVALID_REFERENCE: 400,
  INVALID_PAID_AT: 400,
  INVALID_UNIT: 400,
  INVALID_TRANSITION: 409,
  REJECTION_REASON_REQUIRED: 400,
  REVERSAL_REASON_REQUIRED: 400,
  NOT_WITHDRAWABLE: 409,
  NOT_REVERSIBLE: 409,
  FILE_REQUIRED: 400,
  FILE_EMPTY: 400,
  FILE_TOO_LARGE: 400,
  INVALID_FILE_EXTENSION: 400,
  INVALID_FILE_TYPE: 400,
  INVALID_FILE_SIGNATURE: 400,
  INVALID_FILE_NAME: 400,
  IMPORT_FILE_UNREADABLE: 400,
  IMPORT_SHEET_EMPTY: 400,
  IMPORT_HEADERS_INVALID: 400,
  IMPORT_TOO_MANY_ROWS: 400,
  IMPORT_NO_VALID_ROWS: 400,
};

export class PaymentDomainError extends Error {
  readonly code: PaymentErrorCode;
  constructor(code: PaymentErrorCode) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "PaymentDomainError";
    this.code = code;
  }
}

export function mapPaymentError(error: unknown) {
  if (error instanceof FeatureUnavailableError) return { status: 403, message: error.message, code: "FEATURE_UNAVAILABLE" as const };
  if (error instanceof PaymentDomainError) {
    return { status: PUBLIC_STATUSES[error.code], message: PUBLIC_MESSAGES[error.code], code: error.code };
  }
  return { status: 500, message: "No se pudo procesar la solicitud", code: null as null };
}

export function canReadPayments(role: Role): boolean {
  return PAYMENT_READ_ROLES.includes(role);
}
export function canAdministerPayments(role: Role): boolean {
  return PAYMENT_ADMIN_ROLES.includes(role);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertAllowedKeys(value: unknown, allowed: readonly string[]) {
  if (!isRecord(value)) throw new PaymentDomainError("INVALID_INPUT");
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new PaymentDomainError("INVALID_INPUT");
  }
}

// Deliberadamente sin regex de rango unicode: recorre codepoints y rechaza
// controles ASCII (0x00-0x1F) y DEL (0x7F). Evita cualquier ambiguedad de
// escape en el codigo fuente (ver historial de esta fase con reservas).
function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function normalizePeriod(value: unknown): string {
  if (typeof value !== "string" || !PERIOD_PATTERN.test(value)) {
    throw new PaymentDomainError("INVALID_PERIOD");
  }
  return value;
}

export function normalizeConcept(value: unknown): string {
  if (typeof value !== "string") throw new PaymentDomainError("INVALID_CONCEPT");
  const concept = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (concept.length < 2 || concept.length > MAX_CONCEPT_LENGTH || hasControlCharacters(concept)) {
    throw new PaymentDomainError("INVALID_CONCEPT");
  }
  return concept;
}

export function normalizeAmountCents(value: unknown, errorCode: PaymentErrorCode = "INVALID_AMOUNT"): number {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < MIN_AMOUNT_CENTS || amount > MAX_AMOUNT_CENTS) {
    throw new PaymentDomainError(errorCode);
  }
  return amount;
}

export function normalizeUnit(bloqueValue: unknown, aptoValue: unknown): { bloque: number; apto: number } {
  const bloque = Number(bloqueValue);
  const apto = Number(aptoValue);
  if (!Number.isInteger(bloque) || !Number.isInteger(apto) || bloque < 0 || apto < 0 || bloque > 9999 || apto > 9999) {
    throw new PaymentDomainError("INVALID_UNIT");
  }
  return { bloque, apto };
}

export function normalizeReference(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new PaymentDomainError("INVALID_REFERENCE");
  const reference = value.normalize("NFKC").trim();
  if (reference.length > MAX_REFERENCE_LENGTH || hasControlCharacters(reference)) {
    throw new PaymentDomainError("INVALID_REFERENCE");
  }
  return reference || null;
}

export function normalizeRejectionReason(value: unknown): string {
  if (typeof value !== "string") throw new PaymentDomainError("REJECTION_REASON_REQUIRED");
  const reason = value.normalize("NFKC").trim();
  if (reason.length < 2 || reason.length > MAX_REJECTION_REASON_LENGTH || hasControlCharacters(reason)) {
    throw new PaymentDomainError("REJECTION_REASON_REQUIRED");
  }
  return reason;
}

export function normalizeReversalReason(value: unknown): string {
  if (typeof value !== "string") throw new PaymentDomainError("REVERSAL_REASON_REQUIRED");
  const reason = value.normalize("NFKC").trim();
  if (reason.length < 2 || reason.length > MAX_REVERSAL_REASON_LENGTH || hasControlCharacters(reason)) {
    throw new PaymentDomainError("REVERSAL_REASON_REQUIRED");
  }
  return reason;
}

export function parseIsoDate(value: unknown, errorCode: PaymentErrorCode): Date {
  const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== "string" || value.length > 64 || !ISO_INSTANT_PATTERN.test(value)) {
    throw new PaymentDomainError(errorCode);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new PaymentDomainError(errorCode);
  return parsed;
}

export function assertOriginalFileName(fileName: unknown): string {
  if (
    typeof fileName !== "string" ||
    fileName.length < 1 ||
    fileName.length > MAX_ORIGINAL_FILE_NAME_LENGTH ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("\0") ||
    fileName.includes("..") ||
    hasControlCharacters(fileName)
  ) {
    throw new PaymentDomainError("INVALID_FILE_NAME");
  }
  return fileName;
}

const RECEIPT_EXTENSIONS: Record<ReceiptMimeType, string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
};

export function assertReceiptMimeType(mimeType: unknown): ReceiptMimeType {
  if (typeof mimeType !== "string" || !(RECEIPT_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new PaymentDomainError("INVALID_FILE_TYPE");
  }
  return mimeType as ReceiptMimeType;
}

export function assertReceiptExtensionMatches(fileName: string, mimeType: ReceiptMimeType) {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : null;
  if (!extension || !RECEIPT_EXTENSIONS[mimeType].includes(extension)) {
    throw new PaymentDomainError("INVALID_FILE_EXTENSION");
  }
}

export function escapePaymentHtml(value: string | null | undefined) {
  return (value || "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}
