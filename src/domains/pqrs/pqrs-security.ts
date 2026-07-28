import type { Prisma, Role } from "@prisma/client";
import { dataUrlToBuffer, matchesDeclaredType } from "@/lib/storage";

export const PQRS_READ_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];
export const PQRS_CREATE_ROLES: Role[] = ["ADMIN", "RESIDENTE"];
export const PQRS_ADMIN_WRITE_ROLES: Role[] = ["ADMIN"];

const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export class PqrsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PqrsValidationError";
  }
}

export function canReadPqrs(role: Role) {
  return PQRS_READ_ROLES.includes(role);
}

export function canCreatePqrs(role: Role) {
  return PQRS_CREATE_ROLES.includes(role);
}

export function canAdministerPqrs(role: Role) {
  return PQRS_ADMIN_WRITE_ROLES.includes(role);
}

export function pqrsResourceScopeForUser({
  id,
  tenantId,
  userId,
  role,
}: {
  id: string;
  tenantId: string;
  userId: string;
  role: Role;
}): Prisma.PqrsWhereInput {
  if (!canReadPqrs(role)) {
    throw new PqrsValidationError("Rol no autorizado para consultar PQRS");
  }
  return role === "RESIDENTE"
    ? { id, tenantId, creadoPorId: userId }
    : { id, tenantId };
}

export function residentDescriptionPatch(body: unknown) {
  if (!isRecord(body)) {
    throw new PqrsValidationError("Cuerpo invalido");
  }
  if (typeof body.descripcion !== "string") {
    throw new PqrsValidationError("La descripcion es obligatoria");
  }
  const descripcion = body.descripcion.trim();
  if (!descripcion) {
    throw new PqrsValidationError("La descripcion es obligatoria");
  }
  if (descripcion.length > 6000 || descripcion.split(/\s+/).length > 300) {
    throw new PqrsValidationError("La descripcion no puede superar 300 palabras ni 6000 caracteres");
  }
  return { descripcion };
}

export function optionalBoundedText(
  value: unknown,
  fieldName: string,
  maxLength: number
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new PqrsValidationError(`${fieldName} invalido`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new PqrsValidationError(`${fieldName} supera el limite permitido`);
  }
  return normalized;
}

export function validatePqrsFile({
  dataUrl,
  fileName,
  allowedTypes,
  maxBytes,
}: {
  dataUrl: unknown;
  fileName: unknown;
  allowedTypes: ReadonlySet<string>;
  maxBytes: number;
}) {
  if (typeof dataUrl !== "string" || typeof fileName !== "string") {
    throw new PqrsValidationError("Datos de archivo incompletos");
  }
  const { contentType, buffer } = dataUrlToBuffer(dataUrl);
  if (!allowedTypes.has(contentType)) {
    throw new PqrsValidationError("Tipo de archivo no permitido");
  }
  const normalizedName = normalizeUploadFileName(fileName, contentType);
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new PqrsValidationError(`El archivo no puede superar ${formatMegabytes(maxBytes)}`);
  }
  if (!matchesDeclaredType(buffer, contentType)) {
    throw new PqrsValidationError("El archivo no coincide con el tipo declarado");
  }
  return { contentType, buffer, fileName: normalizedName };
}

export function normalizeUploadFileName(fileName: string, contentType: string) {
  const trimmed = fileName.trim();
  if (
    !trimmed ||
    trimmed.length > 180 ||
    trimmed.includes("\0") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed === "." ||
    trimmed === ".." ||
    /^[a-zA-Z]:/.test(trimmed)
  ) {
    throw new PqrsValidationError("Nombre de archivo invalido");
  }

  const allowedExtensions = MIME_EXTENSIONS[contentType];
  if (!allowedExtensions) {
    throw new PqrsValidationError("Tipo de archivo no permitido");
  }
  const lowerName = trimmed.toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");
  if (dotIndex < 0) {
    return `${trimmed}${allowedExtensions[0]}`;
  }
  if (!allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
    throw new PqrsValidationError("La extension no coincide con el tipo de archivo");
  }
  return trimmed;
}

export function safeDownloadFileName(fileName: string | null | undefined, fallback: string) {
  const value = (fileName || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value.slice(0, 180) || fallback;
}

export function escapePqrsHtml(value: string | null | undefined) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pqrsPublicError(_error: unknown, message: string) {
  return { error: message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatMegabytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)}MB`;
}
