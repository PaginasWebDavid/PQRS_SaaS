import type { Role } from "@prisma/client";
import { parseTimeOfDay, minutesOfDay, formatTimeOfDay } from "@/domains/reservations/reservation-time";

export const RESERVATION_ADMIN_ROLES: Role[] = ["ADMIN"];
export const RESERVATION_CREATE_ROLES: Role[] = ["RESIDENTE"];
export const RESERVATION_READ_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];

export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_RULES_LENGTH = 4000;
export const MAX_NOTES_LENGTH = 1000;
export const MAX_REJECTION_REASON_LENGTH = 500;
export const MAX_BLOCK_REASON_LENGTH = 300;
export const MIN_DURATION_FLOOR = 5;
export const MAX_DURATION_CEILING = 24 * 60;
export const MAX_WEEKLY_LIMIT = 50;
export const MAX_AVAILABILITY_RANGE_DAYS = 62;
export const MAX_BLOCK_RANGE_DAYS = 180;

export type ReservationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_NAME"
  | "INVALID_DESCRIPTION"
  | "INVALID_RULES"
  | "INVALID_DURATION_BOUNDS"
  | "INVALID_TIME_OF_DAY"
  | "INVALID_WEEKLY_LIMIT"
  | "INVALID_WEEKDAYS"
  | "COMMON_AREA_NOT_FOUND"
  | "COMMON_AREA_NAME_TAKEN"
  | "COMMON_AREA_INACTIVE"
  | "RESERVATION_NOT_FOUND"
  | "INVALID_TIME_WINDOW"
  | "START_NOT_IN_FUTURE"
  | "DURATION_TOO_SHORT"
  | "DURATION_TOO_LONG"
  | "OUTSIDE_OPENING_HOURS"
  | "WEEKDAY_BLOCKED"
  | "BLOCKED_WINDOW"
  | "WEEKLY_LIMIT_REACHED"
  | "SLOT_UNAVAILABLE"
  | "INVALID_NOTES"
  | "INVALID_BLOCK_REASON"
  | "INVALID_BLOCK_RANGE"
  | "BLOCK_RANGE_TOO_WIDE"
  | "BLOCK_CONFLICTS_WITH_RESERVATIONS"
  | "INVALID_TRANSITION"
  | "REJECTION_REASON_REQUIRED"
  | "NOT_CANCELLABLE"
  | "INVALID_RANGE"
  | "RANGE_TOO_WIDE";

const PUBLIC_MESSAGES: Record<ReservationErrorCode, string> = {
  INVALID_INPUT: "Datos invalidos",
  INVALID_NAME: "Nombre invalido",
  INVALID_DESCRIPTION: "Descripcion invalida",
  INVALID_RULES: "Reglas invalidas",
  INVALID_DURATION_BOUNDS: "La duracion minima y maxima no son validas",
  INVALID_TIME_OF_DAY: "El horario de apertura o cierre no es valido",
  INVALID_WEEKLY_LIMIT: "El limite semanal no es valido",
  INVALID_WEEKDAYS: "Los dias bloqueados no son validos",
  COMMON_AREA_NOT_FOUND: "Zona comun no encontrada",
  COMMON_AREA_NAME_TAKEN: "Ya existe una zona con ese nombre",
  COMMON_AREA_INACTIVE: "Esta zona no esta disponible para reservas",
  RESERVATION_NOT_FOUND: "Reserva no encontrada",
  INVALID_TIME_WINDOW: "El inicio debe ser anterior al final",
  START_NOT_IN_FUTURE: "La reserva debe iniciar en una fecha futura",
  DURATION_TOO_SHORT: "La duracion es menor a la minima permitida",
  DURATION_TOO_LONG: "La duracion supera la maxima permitida",
  OUTSIDE_OPENING_HOURS: "El horario solicitado esta fuera del horario permitido",
  WEEKDAY_BLOCKED: "Este dia de la semana no admite reservas",
  BLOCKED_WINDOW: "El horario solicitado esta bloqueado",
  WEEKLY_LIMIT_REACHED: "Alcanzaste el limite de reservas por semana para esta zona",
  SLOT_UNAVAILABLE: "Ese horario ya no esta disponible",
  INVALID_NOTES: "La nota no es valida",
  INVALID_BLOCK_REASON: "El motivo del bloqueo no es valido",
  INVALID_BLOCK_RANGE: "El rango del bloqueo no es valido",
  BLOCK_RANGE_TOO_WIDE: "El rango del bloqueo es demasiado amplio",
  BLOCK_CONFLICTS_WITH_RESERVATIONS: "Existen reservas activas en ese rango; cancelalas antes de bloquear el horario",
  INVALID_TRANSITION: "Esta reserva no puede cambiar a ese estado",
  REJECTION_REASON_REQUIRED: "Debes indicar un motivo de rechazo",
  NOT_CANCELLABLE: "Esta reserva ya no se puede cancelar",
  INVALID_RANGE: "El rango de fechas no es valido",
  RANGE_TOO_WIDE: "El rango de fechas es demasiado amplio",
};

const PUBLIC_STATUSES: Record<ReservationErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_NAME: 400,
  INVALID_DESCRIPTION: 400,
  INVALID_RULES: 400,
  INVALID_DURATION_BOUNDS: 400,
  INVALID_TIME_OF_DAY: 400,
  INVALID_WEEKLY_LIMIT: 400,
  INVALID_WEEKDAYS: 400,
  COMMON_AREA_NOT_FOUND: 404,
  COMMON_AREA_NAME_TAKEN: 409,
  COMMON_AREA_INACTIVE: 400,
  RESERVATION_NOT_FOUND: 404,
  INVALID_TIME_WINDOW: 400,
  START_NOT_IN_FUTURE: 400,
  DURATION_TOO_SHORT: 400,
  DURATION_TOO_LONG: 400,
  OUTSIDE_OPENING_HOURS: 400,
  WEEKDAY_BLOCKED: 400,
  BLOCKED_WINDOW: 409,
  WEEKLY_LIMIT_REACHED: 409,
  SLOT_UNAVAILABLE: 409,
  INVALID_NOTES: 400,
  INVALID_BLOCK_REASON: 400,
  INVALID_BLOCK_RANGE: 400,
  BLOCK_RANGE_TOO_WIDE: 400,
  BLOCK_CONFLICTS_WITH_RESERVATIONS: 409,
  INVALID_TRANSITION: 409,
  REJECTION_REASON_REQUIRED: 400,
  NOT_CANCELLABLE: 409,
  INVALID_RANGE: 400,
  RANGE_TOO_WIDE: 400,
};

export class ReservationDomainError extends Error {
  readonly code: ReservationErrorCode;
  constructor(code: ReservationErrorCode) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "ReservationDomainError";
    this.code = code;
  }
}

export function mapReservationError(error: unknown) {
  if (error instanceof ReservationDomainError) {
    return { status: PUBLIC_STATUSES[error.code], message: PUBLIC_MESSAGES[error.code], code: error.code };
  }
  return { status: 500, message: "No se pudo procesar la solicitud", code: null as null };
}

export function canReadReservations(role: Role): boolean {
  return RESERVATION_READ_ROLES.includes(role);
}
export function canCreateReservation(role: Role): boolean {
  return RESERVATION_CREATE_ROLES.includes(role);
}
export function canAdministerReservations(role: Role): boolean {
  return RESERVATION_ADMIN_ROLES.includes(role);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function assertAllowedKeys(value: unknown, allowed: readonly string[]) {
  if (!isRecord(value)) throw new ReservationDomainError("INVALID_INPUT");
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new ReservationDomainError("INVALID_INPUT");
  }
}

// Deliberadamente sin regex de rango unicode para evitar cualquier ambiguedad
// de escape: recorre los codepoints y rechaza controles ASCII (0x00-0x1F) y
// DEL (0x7F).
function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export function normalizeName(value: unknown): string {
  if (typeof value !== "string") throw new ReservationDomainError("INVALID_NAME");
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > MAX_NAME_LENGTH || hasControlCharacters(name)) {
    throw new ReservationDomainError("INVALID_NAME");
  }
  return name;
}

export function normalizeOptionalText(
  value: unknown,
  maxLength: number,
  errorCode: ReservationErrorCode
): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ReservationDomainError(errorCode);
  const text = value.normalize("NFKC").trim();
  const withoutNewlines = text.split("\n").join("");
  if (text.length > maxLength || hasControlCharacters(withoutNewlines)) {
    throw new ReservationDomainError(errorCode);
  }
  return text || null;
}

export function normalizeDescription(value: unknown): string | null {
  return normalizeOptionalText(value, MAX_DESCRIPTION_LENGTH, "INVALID_DESCRIPTION");
}
export function normalizeRules(value: unknown): string | null {
  return normalizeOptionalText(value, MAX_RULES_LENGTH, "INVALID_RULES");
}
export function normalizeNotes(value: unknown): string | null {
  return normalizeOptionalText(value, MAX_NOTES_LENGTH, "INVALID_NOTES");
}
export function normalizeBlockReason(value: unknown): string {
  if (typeof value !== "string") throw new ReservationDomainError("INVALID_BLOCK_REASON");
  const reason = value.normalize("NFKC").trim();
  if (reason.length < 2 || reason.length > MAX_BLOCK_REASON_LENGTH || hasControlCharacters(reason)) {
    throw new ReservationDomainError("INVALID_BLOCK_REASON");
  }
  return reason;
}
export function normalizeRejectionReason(value: unknown): string {
  if (typeof value !== "string") throw new ReservationDomainError("REJECTION_REASON_REQUIRED");
  const reason = value.normalize("NFKC").trim();
  if (reason.length < 2 || reason.length > MAX_REJECTION_REASON_LENGTH || hasControlCharacters(reason)) {
    throw new ReservationDomainError("REJECTION_REASON_REQUIRED");
  }
  return reason;
}

export function normalizeDurationBounds(minValue: unknown, maxValue: unknown): { min: number; max: number } {
  const min = Number(minValue);
  const max = Number(maxValue);
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < MIN_DURATION_FLOOR ||
    max > MAX_DURATION_CEILING ||
    min > max
  ) {
    throw new ReservationDomainError("INVALID_DURATION_BOUNDS");
  }
  return { min, max };
}

export function normalizeWeeklyLimit(value: unknown): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_WEEKLY_LIMIT) {
    throw new ReservationDomainError("INVALID_WEEKLY_LIMIT");
  }
  return limit;
}

export function normalizeOpeningClosing(
  openingValue: unknown,
  closingValue: unknown
): { openingTime: string; closingTime: string } {
  const opening = parseTimeOfDay(openingValue);
  const closing = parseTimeOfDay(closingValue);
  if (!opening || !closing || minutesOfDay(opening) >= minutesOfDay(closing)) {
    throw new ReservationDomainError("INVALID_TIME_OF_DAY");
  }
  return { openingTime: formatTimeOfDay(opening), closingTime: formatTimeOfDay(closing) };
}

export function normalizeBlockedWeekdays(value: unknown): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ReservationDomainError("INVALID_WEEKDAYS");
  const weekdays = value.map((entry) => Number(entry));
  if (weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new ReservationDomainError("INVALID_WEEKDAYS");
  }
  return Array.from(new Set(weekdays)).sort((a, b) => a - b);
}

export function parseIsoInstant(value: unknown, errorCode: ReservationErrorCode = "INVALID_INPUT"): Date {
  // Un instante sin offset (por ejemplo "2026-08-01T10:00") se interpreta
  // segun la zona del proceso. Solo admitimos ISO 8601 con zona explicita para
  // que el servidor nunca convierta silenciosamente una hora civil del cliente.
  const ISO_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
  if (typeof value !== "string" || value.length > 64 || !ISO_INSTANT_PATTERN.test(value)) {
    throw new ReservationDomainError(errorCode);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ReservationDomainError(errorCode);
  return parsed;
}

export function escapeReservationHtml(value: string | null | undefined) {
  return (value || "")
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#39;");
}
