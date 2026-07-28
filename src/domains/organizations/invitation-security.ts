import type { Role } from "@prisma/client";
import { domainToASCII } from "node:url";

export const INVITABLE_TENANT_ROLES: readonly Role[] = [
  "ADMIN",
  "CONSEJO",
  "RESIDENTE",
];
export const MAX_BULK_INVITATIONS = 100;

export type InvitationErrorCode =
  | "INVALID_EMAIL"
  | "INVALID_ROLE"
  | "INVALID_TOKEN"
  | "INVALID_PASSWORD"
  | "INVALID_NAME"
  | "INVALID_LOCATION"
  | "LEGAL_REQUIRED"
  | "TENANT_NOT_FOUND"
  | "INVITATION_CONFLICT"
  | "INVITATION_NOT_FOUND"
  | "INVITATION_UNAVAILABLE"
  | "INVITATION_EXPIRED"
  | "INVITATION_CANCELLED"
  | "INVITATION_USED";

const PUBLIC_INVITATION_ERRORS: Record<
  InvitationErrorCode,
  { status: number; message: string }
> = {
  INVALID_EMAIL: { status: 400, message: "El correo no es valido" },
  INVALID_ROLE: { status: 400, message: "Rol no permitido para invitacion" },
  INVALID_TOKEN: {
    status: 400,
    message: "La invitacion no es valida o ya no esta disponible",
  },
  INVALID_PASSWORD: {
    status: 400,
    message:
      "La contrasena debe tener entre 8 y 72 bytes, una letra y un numero",
  },
  INVALID_NAME: { status: 400, message: "El nombre no es valido" },
  INVALID_LOCATION: {
    status: 400,
    message: "Bloque o apartamento invalido",
  },
  LEGAL_REQUIRED: {
    status: 400,
    message:
      "Debes aceptar los terminos y la politica de tratamiento de datos",
  },
  TENANT_NOT_FOUND: { status: 404, message: "Conjunto no encontrado" },
  INVITATION_CONFLICT: {
    status: 409,
    message: "No se pudo crear la invitacion para ese correo",
  },
  INVITATION_NOT_FOUND: {
    status: 404,
    message: "Invitacion no encontrada",
  },
  INVITATION_UNAVAILABLE: {
    status: 409,
    message: "La invitacion ya no esta disponible",
  },
  INVITATION_EXPIRED: {
    status: 410,
    message: "Esta invitacion esta vencida",
  },
  INVITATION_CANCELLED: {
    status: 410,
    message: "Esta invitacion fue cancelada",
  },
  INVITATION_USED: {
    status: 409,
    message: "Esta invitacion ya fue utilizada",
  },
};

export class InvitationDomainError extends Error {
  readonly code: InvitationErrorCode;

  constructor(code: InvitationErrorCode) {
    super(PUBLIC_INVITATION_ERRORS[code].message);
    this.name = "InvitationDomainError";
    this.code = code;
  }
}

export function mapInvitationError(error: unknown) {
  if (error instanceof InvitationDomainError) {
    return PUBLIC_INVITATION_ERRORS[error.code];
  }
  return {
    status: 500,
    message: "No se pudo procesar la invitacion",
  };
}

export function normalizeInvitationEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new InvitationDomainError("INVALID_EMAIL");
  }

  const normalized = value.trim().normalize("NFKC").toLowerCase();
  const firstAt = normalized.indexOf("@");
  const lastAt = normalized.lastIndexOf("@");
  if (firstAt <= 0 || firstAt !== lastAt) {
    throw new InvitationDomainError("INVALID_EMAIL");
  }

  const local = normalized.slice(0, firstAt);
  const rawDomain = normalized.slice(firstAt + 1);
  const domain = domainToASCII(rawDomain);
  const email = `${local}@${domain}`;

  if (
    !domain ||
    email.length > 320 ||
    local.length > 64 ||
    !/^[\x21-\x7e]+$/.test(local) ||
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(domain) ||
    !domain.includes(".") ||
    domain.includes("..") ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  ) {
    throw new InvitationDomainError("INVALID_EMAIL");
  }

  return email;
}

export function ensureInvitableRole(value: unknown): Role {
  const role =
    typeof value === "string" ? value.trim().toUpperCase() : String(value);
  if (!INVITABLE_TENANT_ROLES.includes(role as Role)) {
    throw new InvitationDomainError("INVALID_ROLE");
  }
  return role as Role;
}

export function validateInvitationAcceptance({
  token,
  password,
  name,
  role,
  bloque,
  apto,
  acceptedLegal,
}: {
  token: unknown;
  password: unknown;
  name: unknown;
  role: Role;
  bloque?: unknown;
  apto?: unknown;
  acceptedLegal: unknown;
}) {
  ensureInvitableRole(role);
  if (typeof token !== "string" || token.length < 20 || token.length > 256) {
    throw new InvitationDomainError("INVALID_TOKEN");
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72 ||
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new InvitationDomainError("INVALID_PASSWORD");
  }
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120) {
    throw new InvitationDomainError("INVALID_NAME");
  }
  if (acceptedLegal !== true) {
    throw new InvitationDomainError("LEGAL_REQUIRED");
  }

  const normalizedBloque = normalizeLocation(bloque, 999);
  const normalizedApto = normalizeLocation(apto, 9999);
  if (
    role === "RESIDENTE" &&
    (normalizedBloque === null || normalizedApto === null)
  ) {
    throw new InvitationDomainError("INVALID_LOCATION");
  }

  return {
    token,
    password,
    name: name.trim(),
    bloque: role === "RESIDENTE" ? normalizedBloque : null,
    apto: role === "RESIDENTE" ? normalizedApto : null,
    acceptedLegal: true as const,
  };
}

export function prepareBulkInvitationEmails(
  values: unknown[],
  maxRows = MAX_BULK_INVITATIONS
) {
  const normalized: string[] = [];
  const invalidRows: number[] = [];
  let nonEmptyRows = 0;

  values.forEach((value, index) => {
    const raw = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (!raw) return;
    if (
      nonEmptyRows === 0 &&
      ["email", "e-mail", "correo", "correo electronico"].includes(
        raw.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      )
    ) {
      nonEmptyRows += 1;
      return;
    }

    nonEmptyRows += 1;
    try {
      normalized.push(normalizeInvitationEmail(raw));
    } catch {
      invalidRows.push(index + 1);
    }
  });

  if (invalidRows.length > 0) {
    throw new Error(
      `Hay correos invalidos en ${invalidRows.length} fila(s): ${invalidRows
        .slice(0, 10)
        .join(", ")}`
    );
  }

  const emails = Array.from(new Set(normalized));
  if (emails.length === 0) {
    throw new Error("No se encontraron correos validos en la primera columna");
  }
  if (emails.length > maxRows) {
    throw new Error(`El archivo supera el maximo de ${maxRows} correos`);
  }
  return emails;
}

export function escapeInvitationHtml(value: string | null | undefined) {
  return (value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function publicInvitationEmailResult(result: {
  ok: boolean;
  providerMessageId?: string | null;
  errorMessage?: string | null;
}) {
  return { sent: result.ok };
}

function normalizeLocation(value: unknown, max: number) {
  if (value === undefined || value === null || value === "") return null;
  const normalized =
    typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > max) {
    throw new InvitationDomainError("INVALID_LOCATION");
  }
  return normalized;
}
