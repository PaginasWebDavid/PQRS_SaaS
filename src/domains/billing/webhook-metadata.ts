// Utilidades PURAS para el ledger de webhooks y la clave del efecto economico.
// No importan Prisma ni tienen efectos secundarios.

// Tipo de efecto economico que un pago APPROVED aplica una sola vez.
export const PAYMENT_EFFECT_TYPE = "PERIOD_EXTENSION_APPROVED";

// Clave conceptual del efecto economico. La GARANTIA persistente de idempotencia
// vive en Payment.approvedEffectAppliedAt (update condicional); esta clave se usa
// solo para trazar/auditar de forma legible que efecto se aplico a que pago.
// Deliberadamente NO depende de x-request-id ni de data.id de la entrega HTTP.
export function buildPaymentEffectKey(provider: string, externalPaymentId: string): string {
  return `${provider}:${externalPaymentId}:${PAYMENT_EFFECT_TYPE}`;
}

// Claves que nunca deben persistirse en el ledger ni en la auditoria (case-insensitive,
// por coincidencia de subcadena para cubrir variantes como "x-signature", "accessToken").
const SENSITIVE_KEY_PATTERNS = [
  "authorization",
  "signature",
  "secret",
  "token",
  "password",
  "apikey",
  "api_key",
  "cookie",
  "card",
  "cvv",
  "cvc",
];

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

// Construye metadata segura para el ledger/auditoria: descarta claves sensibles y
// solo conserva valores primitivos (string/number/boolean/null). No guarda objetos
// anidados ni payloads completos.
export function sanitizeWebhookMetadata(input: Record<string, unknown>): Record<string, string | number | boolean | null> {
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) continue;
    if (value === null) {
      clean[key] = null;
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      clean[key] = value;
    }
    // Se ignoran objetos/arrays/undefined a proposito (evita filtrar payloads).
  }
  return clean;
}
