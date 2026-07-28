import { createHash } from "node:crypto";

export const BILLING_OUTBOX_BATCH_LIMIT = 100;
export const BILLING_OUTBOX_MAX_ATTEMPTS = 5;
export const BILLING_OUTBOX_LEASE_MS = 10 * 60 * 1000;
const BASE_BACKOFF_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

export type BillingOutboxChannelValue = "IN_APP" | "EMAIL";
export type BillingOutboxEventValue = "BILLING_GRACE_STARTED" | "BILLING_SUSPENDED";
export type BillingFailureStatus = "FAILED_RETRYABLE" | "FAILED_FINAL" | "DELIVERY_UNKNOWN";

export interface BillingOutboxPayload {
  version: 1;
  graceDays?: number;
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

export function sanitizeBillingOutboxPayload(input: { graceDays?: number | null }): BillingOutboxPayload {
  const payload: BillingOutboxPayload = { version: 1 };
  if (Number.isSafeInteger(input.graceDays) && (input.graceDays as number) > 0) {
    payload.graceDays = Math.min(input.graceDays as number, 3650);
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
  return {
    notificationType: "LICENSE_SUSPENDED",
    title: "Tu licencia fue suspendida",
    message: "El periodo de gracia termino sin pago y el servicio quedo suspendido. Paga desde Licencias y pagos para reactivarlo.",
    emailBodyHtml: "El periodo de gracia termino sin que se registrara el pago, asi que el servicio de tu conjunto quedo suspendido. Puedes reactivarlo pagando desde Licencias y pagos en cualquier momento.",
    accent: "danger" as const,
  };
}