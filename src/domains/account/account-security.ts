import crypto from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_BCRYPT_PASSWORD_BYTES = 72;
export const MAX_ACCOUNT_EMAIL_LENGTH = 320;

export type AccountSecurityErrorCode =
  | "INVALID_INPUT"
  | "INVALID_NAME"
  | "INVALID_PHONE"
  | "INVALID_PASSWORD"
  | "CURRENT_PASSWORD_INVALID"
  | "PASSWORD_REUSED"
  | "RESET_TOKEN_INVALID"
  | "ACCOUNT_UNAVAILABLE"
  | "PROFILE_CONFLICT";

const PUBLIC_MESSAGES: Record<AccountSecurityErrorCode, string> = {
  INVALID_INPUT: "Datos invalidos",
  INVALID_NAME: "Nombre invalido",
  INVALID_PHONE: "Telefono invalido",
  INVALID_PASSWORD: "La contrasena no cumple los requisitos",
  CURRENT_PASSWORD_INVALID: "La contrasena actual es incorrecta",
  PASSWORD_REUSED: "La nueva contrasena debe ser diferente de la actual",
  RESET_TOKEN_INVALID: "El enlace no es valido, expiro o ya fue utilizado",
  ACCOUNT_UNAVAILABLE: "No autorizado",
  PROFILE_CONFLICT: "El perfil cambio durante la operacion. Intenta nuevamente",
};

const PUBLIC_STATUSES: Record<AccountSecurityErrorCode, number> = {
  INVALID_INPUT: 400,
  INVALID_NAME: 400,
  INVALID_PHONE: 400,
  INVALID_PASSWORD: 400,
  CURRENT_PASSWORD_INVALID: 400,
  PASSWORD_REUSED: 400,
  RESET_TOKEN_INVALID: 400,
  ACCOUNT_UNAVAILABLE: 403,
  PROFILE_CONFLICT: 409,
};

export class AccountSecurityError extends Error {
  constructor(public readonly code: AccountSecurityErrorCode) {
    super(PUBLIC_MESSAGES[code]);
    this.name = "AccountSecurityError";
  }
}

export function getAccountSecurityErrorResponse(error: unknown) {
  if (!(error instanceof AccountSecurityError)) return null;
  return {
    status: PUBLIC_STATUSES[error.code],
    body: { error: PUBLIC_MESSAGES[error.code], code: error.code },
  };
}

export function normalizeAccountEmail(value: unknown): string | null {
  if (typeof value !== "string" || value.length > MAX_ACCOUNT_EMAIL_LENGTH) return null;
  const email = value.normalize("NFKC").trim().toLowerCase();
  if (!email || email.length > MAX_ACCOUNT_EMAIL_LENGTH) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeGlobalName(value: unknown): string {
  if (typeof value !== "string") throw new AccountSecurityError("INVALID_NAME");
  const name = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new AccountSecurityError("INVALID_NAME");
  }
  return name;
}

export function normalizeGlobalPhone(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new AccountSecurityError("INVALID_PHONE");
  const phone = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!/^[+0-9 ()-]{7,25}$/.test(phone)) throw new AccountSecurityError("INVALID_PHONE");
  return phone;
}

export function parseGlobalProfilePatch(value: unknown): { name?: string; phone?: string | null } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountSecurityError("INVALID_INPUT");
  }
  const record = value as Record<string, unknown>;
  const patch: { name?: string; phone?: string | null } = {};
  if (Object.prototype.hasOwnProperty.call(record, "name")) patch.name = normalizeGlobalName(record.name);
  if (Object.prototype.hasOwnProperty.call(record, "phone")) patch.phone = normalizeGlobalPhone(record.phone);
  return patch;
}

export function assertAllowedAccountPatchKeys(value: unknown, extraAllowed: readonly string[] = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AccountSecurityError("INVALID_INPUT");
  }
  const allowed = new Set(["name", "phone", ...extraAllowed]);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!allowed.has(key)) throw new AccountSecurityError("INVALID_INPUT");
  }
}

export function validateNewPassword(password: unknown, confirmation: unknown): string {
  if (typeof password !== "string" || typeof confirmation !== "string") {
    throw new AccountSecurityError("INVALID_PASSWORD");
  }
  if (
    password.length < MIN_PASSWORD_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH ||
    Buffer.byteLength(password, "utf8") > MAX_BCRYPT_PASSWORD_BYTES ||
    password !== confirmation
  ) {
    throw new AccountSecurityError("INVALID_PASSWORD");
  }
  return password;
}

export function validateCurrentPassword(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PASSWORD_LENGTH) {
    throw new AccountSecurityError("CURRENT_PASSWORD_INVALID");
  }
  return value;
}

export function generatePasswordResetToken() {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: unknown): string {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw new AccountSecurityError("RESET_TOKEN_INVALID");
  }
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

export function isSessionVersionCurrent(tokenVersion: unknown, currentVersion: number) {
  return typeof tokenVersion === "number" && Number.isSafeInteger(tokenVersion) && tokenVersion === currentVersion;
}

export function getConfiguredApplicationOrigin() {
  const configured = process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (!configured) throw new Error("ACCOUNT_APP_ORIGIN_MISSING");
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("ACCOUNT_APP_ORIGIN_INVALID");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && process.env.NODE_ENV !== "production")) {
    throw new Error("ACCOUNT_APP_ORIGIN_INSECURE");
  }
  return url.origin;
}

export function escapeAccountEmailHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}