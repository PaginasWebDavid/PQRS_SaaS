import type { PqrsWorkflowType } from "@prisma/client";

export const CORRECTABLE_PQRS_FIELDS = new Set([
  "operationId",
  "reason",
  "categoryId",
  "bloque",
  "apto",
  "gestionadoPorId",
  "workflowType",
  "faseTipo",
  "faseActual",
  "reopen",
]);

export class PqrsCorrectionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PqrsCorrectionValidationError";
  }
}

export function normalizeCorrectionReason(value: unknown) {
  if (typeof value !== "string") throw new PqrsCorrectionValidationError("El motivo es obligatorio");
  const reason = value.replace(/\s+/g, " ").trim();
  if (reason.length < 10 || reason.length > 500 || /[\u0000-\u001F\u007F]/.test(reason)) {
    throw new PqrsCorrectionValidationError("El motivo debe tener entre 10 y 500 caracteres");
  }
  return reason;
}

export function normalizeOperationId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new PqrsCorrectionValidationError("Identificador de operacion invalido");
  }
  return value.toLowerCase();
}

export function normalizeLocationNumber(value: unknown, label: string, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new PqrsCorrectionValidationError(`${label} invalido`);
  }
  return parsed;
}

export function normalizeCorrectionPhase(value: unknown): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || ![1, 2, 3, 4].includes(parsed)) {
    throw new PqrsCorrectionValidationError("Fase invalida");
  }
  return parsed;
}

export function normalizeCorrectionRoute(value: unknown): "INSUMOS" | "PROVEEDOR" | null {
  if (value === null) return null;
  if (value !== "INSUMOS" && value !== "PROVEEDOR") {
    throw new PqrsCorrectionValidationError("Ruta de gestion invalida");
  }
  return value;
}

export function validateWorkflowPhase(input: {
  workflowType: PqrsWorkflowType;
  faseActual: number | null;
  faseTipo: string | null;
}) {
  if (input.workflowType === "SIMPLE") {
    if (input.faseActual !== null && input.faseActual !== 1) {
      throw new PqrsCorrectionValidationError("La fase no es compatible con el workflow SIMPLE");
    }
    if (input.faseTipo !== null) {
      throw new PqrsCorrectionValidationError("La ruta de gestion solo aplica al workflow MAINTENANCE");
    }
    return;
  }
  if (input.faseActual === 2 && input.faseTipo !== "INSUMOS") {
    throw new PqrsCorrectionValidationError("La fase 2 requiere la ruta INSUMOS");
  }
  if (input.faseActual === 3 && input.faseTipo !== "PROVEEDOR") {
    throw new PqrsCorrectionValidationError("La fase 3 requiere la ruta PROVEEDOR");
  }
}