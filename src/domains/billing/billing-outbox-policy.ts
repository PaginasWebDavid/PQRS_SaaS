import { createHash } from "node:crypto";

export const BILLING_OUTBOX_BATCH_LIMIT = 100;
export const BILLING_OUTBOX_MAX_ATTEMPTS = 5;
export const BILLING_OUTBOX_LEASE_MS = 10 * 60 * 1000;
const BASE_BACKOFF_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

export type BillingOutboxChannelValue = "IN_APP" | "EMAIL";
export type BillingOutboxEventValue =
  | "BILLING_GRACE_STARTED"
  | "BILLING_SUSPENDED"
  | "ANNUAL_RENEWAL_REMINDER"
  | "SAAS_PAYMENT_APPROVED"
  | "SAAS_PAYMENT_REJECTED"
  | "COURTESY_EXTENSION_GRANTED";
export type BillingFailureStatus = "FAILED_RETRYABLE" | "FAILED_FINAL" | "DELIVERY_UNKNOWN";

export interface BillingOutboxPayload {
  version: 1;
  graceDays?: number;
  // Para pagos aprobados o cortesias: fecha (ISO) hasta la que queda cubierto el
  // periodo tras este pago. Nunca se incluye para SAAS_PAYMENT_REJECTED: un pago
  // rechazado no confirma ninguna fecha.
  periodEndsAt?: string;
}

export function buildBillingOutboxDedupeKey(input: {
  subscriptionId: string;
  eventType: BillingOutboxEventValue;
  boundary: Date;
  recipientUserId: string;
  channel: BillingOutboxChannelValue;
}): string {
  if (!(input.boundary instanceof Date) || Number.isNaN(input.boundary.getTime())) {
    throw new TypeError("boundary must be a valid Date");
  }
  const stableInput = [
    "billing-outbox-v1",
    input.subscriptionId,
    input.eventType,
    input.boundary.toISOString(),
    input.recipientUserId,
    input.channel,
  ].join("|");
  const digest = createHash("sha256").update(stableInput).digest("hex");
  return `billing:v1:${input.eventType.toLowerCase()}:${digest}`;
}

export function sanitizeBillingOutboxPayload(input: {
  graceDays?: number | null;
  periodEndsAt?: Date | null;
}): BillingOutboxPayload {
  const payload: BillingOutboxPayload = { version: 1 };
  if (Number.isSafeInteger(input.graceDays) && (input.graceDays as number) > 0) {
    payload.graceDays = Math.min(input.graceDays as number, 3650);
  }
  if (input.periodEndsAt instanceof Date && !Number.isNaN(input.periodEndsAt.getTime())) {
    payload.periodEndsAt = input.periodEndsAt.toISOString();
  }
  return payload;
}

export function sanitizeOutboxErrorCode(value: unknown, fallback = "UNCLASSIFIED_ERROR"): string {
  const raw = typeof value === "string" ? value : fallback;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_").slice(0, 120);
  return clean || fallback;
}

export function classifyProviderHttpStatus(statusCode: number): "COMPLETED" | BillingFailureStatus {
  if (statusCode >= 200 && statusCode < 300) return "COMPLETED";
  if (statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500) {
    return "FAILED_RETRYABLE";
  }
  return "FAILED_FINAL";
}

export function classifyLocalOutboxError(input: {
  code?: string;
  providerAttemptStarted: boolean;
}): BillingFailureStatus {
  if (input.providerAttemptStarted) return "DELIVERY_UNKNOWN";
  const code = sanitizeOutboxErrorCode(input.code);
  if (
    code === "RESEND_API_KEY_MISSING" ||
    code === "TRANSACTIONAL_EMAIL_DISABLED" ||
    code === "INVALID_RECIPIENT" ||
    code === "RECIPIENT_UNAVAILABLE"
  ) {
    return "FAILED_FINAL";
  }
  return "FAILED_RETRYABLE";
}

export function hasBillingOutboxAttemptsRemaining(attemptCount: number): boolean {
  return Number.isSafeInteger(attemptCount) && attemptCount < BILLING_OUTBOX_MAX_ATTEMPTS;
}

export function computeBillingOutboxNextAttemptAt(now: Date, attemptCount: number): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new TypeError("now must be a valid Date");
  if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
    throw new RangeError("attemptCount must be a positive integer");
  }
  const delay = Math.min(BASE_BACKOFF_MS * 2 ** (attemptCount - 1), MAX_BACKOFF_MS);
  return new Date(now.getTime() + delay);
}

export function decideAbandonedBillingOutbox(input: {
  channel: BillingOutboxChannelValue;
  providerAttemptStartedAt: Date | null;
}): "RECOVERABLE" | "DELIVERY_UNKNOWN" {
  if (input.channel === "EMAIL" && input.providerAttemptStartedAt instanceof Date) {
    return "DELIVERY_UNKNOWN";
  }
  return "RECOVERABLE";
}

export function getBillingOutboxContent(eventType: BillingOutboxEventValue, payload: BillingOutboxPayload) {
  if (eventType === "BILLING_GRACE_STARTED") {
    const graceDays = payload.graceDays ?? 5;
    return {
      notificationType: "LICENSE_EXPIRING",
      title: "Tu licencia entro en periodo de gracia",
      message: `Tu conjunto tiene ${graceDays} dia(s) para regularizar el pago antes de que el servicio se suspenda.`,
      emailBodyHtml: `El pago de tu conjunto no se proceso a tiempo. Tienes <strong>${graceDays} dia(s)</strong> para ponerte al dia desde Licencias y pagos antes de que el servicio se suspenda.`,
      accent: "warning" as const,
    };
  }
  if (eventType === "BILLING_SUSPENDED") {
    return {
      notificationType: "LICENSE_SUSPENDED",
      title: "Tu licencia fue suspendida",
      message: "El periodo de gracia termino sin pago y el servicio quedo suspendido. Paga desde Licencias y pagos para reactivarlo.",
      emailBodyHtml: "El periodo de gracia termino sin que se registrara el pago, asi que el servicio de tu conjunto quedo suspendido. Puedes reactivarlo pagando desde Licencias y pagos en cualquier momento.",
      accent: "danger" as const,
    };
  }
  if (eventType === "ANNUAL_RENEWAL_REMINDER") {
    const coverage = payload.periodEndsAt
      ? ` Tu periodo anual actual termina el ${new Date(payload.periodEndsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}.`
      : "";
    return {
      notificationType: "LICENSE_EXPIRING",
      title: "Tu renovacion anual se acerca",
      message: `Faltan 30 dias para la renovacion anual de la licencia de tu conjunto.${coverage} Revisa el plan y el medio de pago desde Licencias y pagos.`,
      emailBodyHtml: `Faltan <strong>30 dias</strong> para la renovacion anual de la licencia de tu conjunto.${coverage} Puedes revisar el plan, renovar manualmente o activar el cobro automatico desde Licencias y pagos.`,
      accent: "warning" as const,
    };
  }
  if (eventType === "SAAS_PAYMENT_APPROVED") {
    // Nunca se afirma mas de lo que el proveedor confirmo: solo "aprobado" y,
    // si esta disponible, la fecha hasta la que queda cubierto el periodo.
    const coverage = payload.periodEndsAt
      ? ` Tu licencia queda cubierta hasta el ${new Date(payload.periodEndsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}.`
      : "";
    return {
      notificationType: "SAAS_PAYMENT_APPROVED",
      title: "Confirmamos tu pago",
      message: `El pago de la licencia de tu conjunto fue aprobado.${coverage}`,
      emailBodyHtml: `El pago de la licencia de tu conjunto fue <strong>aprobado</strong>.${coverage} Puedes ver el detalle en Licencias y pagos.`,
      accent: "success" as const,
    };
  }
  if (eventType === "COURTESY_EXTENSION_GRANTED") {
    const coverage = payload.periodEndsAt
      ? ` El acceso queda extendido hasta el ${new Date(payload.periodEndsAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}.`
      : "";
    return {
      notificationType: "COURTESY_EXTENSION_GRANTED",
      title: "Extension de cortesia aplicada",
      message: `PQRS Services otorgo una extension de cortesia sin cobro.${coverage}`,
      emailBodyHtml: `PQRS Services otorgo una <strong>extension de cortesia sin cobro</strong>.${coverage} Puedes consultar el estado actual en Licencias y pagos.`,
      accent: "navy" as const,
    };
  }
  // SAAS_PAYMENT_REJECTED: nunca se expone el mensaje crudo del proveedor; solo
  // se explica de forma generica que revisar y a donde ir.
  return {
    notificationType: "SAAS_PAYMENT_REJECTED",
    title: "No pudimos confirmar tu pago",
    message: "El pago de la licencia de tu conjunto no pudo confirmarse. Revisa tu medio de pago o contacta a la administracion comercial.",
    emailBodyHtml: "El pago de la licencia de tu conjunto no pudo confirmarse. Revisa tu medio de pago o contacta a la administracion comercial. Consulta el estado actual de tu acceso en Licencias y pagos.",
    accent: "danger" as const,
  };
}
