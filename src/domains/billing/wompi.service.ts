import crypto from "crypto";
import { AuditAction, BillingOutboxEventType, Prisma, WebhookEventResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createBillingOutboxIntentsForTransition } from "./billing-outbox.service";
import { BILLING_PERIOD_DAYS, computeNextPeriod } from "./period";
import { buildPaymentEffectKey, sanitizeWebhookMetadata } from "./webhook-metadata";
import { decidePaymentRowTransition, providerStatusLabel, truncateProviderStatus, type KnownPaymentStatus } from "./precedence";

const WOMPI_PROVIDER = "WOMPI";
const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";
const ALLOWED_OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
type Tx = Prisma.TransactionClient;
type Env = "sandbox" | "production";
type Config = { env: Env; publicKey: string; integrity: string; events: string };
type RecordValue = Record<string, unknown>;

export class WompiBillingError extends Error {
  constructor(message: string, readonly code = "WOMPI_BILLING_ERROR") {
    super(message);
    this.name = "WompiBillingError";
  }
}

export class WompiWebhookValidationError extends Error {
  constructor(readonly code: string) {
    super("Webhook Wompi invalido");
    this.name = "WompiWebhookValidationError";
  }
}

function wompiConfig(): Config {
  const env = process.env.WOMPI_ENV?.trim().toLowerCase();
  if (env !== "sandbox" && env !== "production") throw new WompiBillingError("La integracion Wompi no tiene un ambiente valido", "WOMPI_ENV_INVALID");
  const suffix = env === "sandbox" ? "SANDBOX" : "PRODUCTION";
  const prefix = env === "sandbox" ? "test" : "prod";
  const value = (name: string, label: string, expected: string) => {
    const current = process.env[`WOMPI_${suffix}_${name}`]?.trim() || "";
    if (!current.startsWith(expected)) throw new WompiBillingError(`Falta configurar ${label} de Wompi`, "WOMPI_NOT_CONFIGURED");
    return current;
  };
  return {
    env,
    publicKey: value("PUBLIC_KEY", "la llave publica", `pub_${prefix}_`),
    integrity: value("INTEGRITY_SECRET", "el secreto de integridad", `${prefix}_integrity_`),
    events: value("EVENTS_SECRET", "el secreto de eventos", `${prefix}_events_`),
  };
}

function appUrl() {
  const raw = process.env.NEXTAUTH_URL || process.env.APP_URL;
  if (!raw) throw new WompiBillingError("Falta NEXTAUTH_URL o APP_URL para iniciar el pago", "APP_URL_MISSING");
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new WompiBillingError("NEXTAUTH_URL o APP_URL no es una URL valida", "APP_URL_INVALID");
  }
}

export function getWompiIntegrationStatus() {
  const environment = process.env.WOMPI_ENV?.trim().toLowerCase();
  const sandbox = environment === "sandbox";
  const suffix = sandbox ? "SANDBOX" : "PRODUCTION";
  const prefix = sandbox ? "test" : "prod";
  const read = (key: string) => process.env[`WOMPI_${suffix}_${key}`]?.trim() || "";
  const publicKey = read("PUBLIC_KEY");
  const integrity = read("INTEGRITY_SECRET");
  const events = read("EVENTS_SECRET");
  const privateKey = read("PRIVATE_KEY");
  return {
    provider: WOMPI_PROVIDER,
    environment: environment === "sandbox" || environment === "production" ? environment : null,
    connected: publicKey.startsWith(`pub_${prefix}_`) && integrity.startsWith(`${prefix}_integrity_`) && events.startsWith(`${prefix}_events_`),
    privateKeyConfigured: privateKey.startsWith(`prv_${prefix}_`),
    webhookSecretConfigured: events.startsWith(`${prefix}_events_`),
    lastVerifiedAt: null,
  };
}

function operationId(value: unknown) {
  if (value === undefined || value === null) return `wompi_${crypto.randomUUID().replace(/-/g, "")}`;
  if (typeof value !== "string" || !ALLOWED_OPERATION_ID.test(value.trim())) {
    throw new WompiBillingError("El identificador de operacion es invalido", "OPERATION_ID_INVALID");
  }
  return value.trim();
}

function checkoutUrl(config: Config, reference: string, amountCents: number, currency: string, email: string, name: string) {
  const redirect = new URL("/admin/licencias", appUrl());
  redirect.searchParams.set("payment", "wompi");
  const signature = crypto.createHash("sha256").update(`${reference}${amountCents}${currency}${config.integrity}`).digest("hex");
  const params = new URLSearchParams({
    "public-key": config.publicKey, currency, "amount-in-cents": String(amountCents), reference,
    "signature:integrity": signature, "redirect-url": redirect.toString(),
    "customer-data:email": email, "customer-data:full-name": name,
  });
  return `${WOMPI_CHECKOUT_URL}?${params.toString()}`;
}

export async function createWompiCheckoutForTenant(input: { actorUserId: string; tenantId: string; operationId?: unknown }) {
  const config = wompiConfig();
  const requestOperationId = operationId(input.operationId);
  const [tenant, actor, commercial] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: true } }),
    prisma.user.findUnique({ where: { id: input.actorUserId }, select: { email: true, name: true, isActive: true } }),
    prisma.tenantCommercialProfile.findUnique({ where: { tenantId: input.tenantId }, select: { commercialStatus: true } }),
  ]);
  if (!tenant?.subscription) throw new WompiBillingError("El conjunto no tiene una licencia disponible para pago", "SUBSCRIPTION_NOT_FOUND");
  if (!actor?.isActive || !actor.email) throw new WompiBillingError("No se pudo identificar la cuenta que realiza el pago", "ACTOR_NOT_FOUND");
  if (commercial && !["LEGACY_REVIEW", "CONVERTED_MONTHLY"].includes(commercial.commercialStatus)) {
    throw new WompiBillingError("Este conjunto debe continuar su proceso comercial antes de pagar en linea", "COMMERCIAL_PAYMENT_BLOCKED");
  }
  const subscription = tenant.subscription;
  const amountCents = subscription.pendingPriceCents ?? subscription.priceCents;
  const currency = subscription.pendingCurrency || subscription.currency;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== "COP") {
    throw new WompiBillingError("La licencia no tiene un valor de cobro valido", "BILLING_TERMS_INVALID");
  }
  if (subscription.status === "CANCELLED") throw new WompiBillingError("La licencia esta cancelada. Contacta a PQRS Services para reactivarla", "SUBSCRIPTION_CANCELLED");
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ tenantId: input.tenantId, subscriptionId: subscription.id, amountCents, currency, requestOperationId })).digest("hex");
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi-checkout:${input.tenantId}:${requestOperationId}`}, 0))`;
    const existing = await tx.payment.findUnique({ where: { tenantId_operationId: { tenantId: input.tenantId, operationId: requestOperationId } } });
    if (existing) {
      if (existing.provider !== "WOMPI" || existing.requestHash !== requestHash || !existing.externalReference) {
        throw new WompiBillingError("La operacion de pago no coincide con la solicitud original", "OPERATION_CONFLICT");
      }
      return existing;
    }
    const now = new Date();
    const created = await tx.payment.create({ data: {
      tenantId: input.tenantId, subscriptionId: subscription.id, amountCents, currency,
      status: "PENDING", provider: "WOMPI", dueDate: now, periodStart: now, periodEnd: now,
      operationId: requestOperationId, requestHash, recordedByUserId: input.actorUserId, rawStatus: "CHECKOUT_CREATED",
    } });
    const reference = `WOMPI_${created.id}`;
    const updated = await tx.payment.update({ where: { id: created.id }, data: { externalReference: reference } });
    await registerAuditLog({
      actorUserId: input.actorUserId, tenantId: input.tenantId, action: AuditAction.WOMPI_CHECKOUT_CREATED,
      targetType: "Payment", targetId: updated.id,
      metadata: { provider: WOMPI_PROVIDER, paymentId: updated.id, reference, amountCents, currency, operationId: requestOperationId, environment: config.env },
    }, tx);
    return updated;
  });
  return {
    paymentId: payment.id,
    reference: payment.externalReference!,
    checkoutUrl: checkoutUrl(config, payment.externalReference!, payment.amountCents, payment.currency, actor.email, actor.name),
  };
}

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function signedValue(data: RecordValue, property: string): string | number | boolean | null {
  const path = property.split(".").filter(Boolean);
  if (path[0] === "data") path.shift();
  if (!path.length || path.some((part) => !/^[A-Za-z0-9_]+$/.test(part))) return null;
  let value: unknown = data;
  for (const part of path) {
    const object = asRecord(value);
    if (!object || !Object.prototype.hasOwnProperty.call(object, part)) return null;
    value = object[part];
  }
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : null;
}

function equalChecksum(received: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(received) || received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received.toLowerCase()), Buffer.from(expected.toLowerCase()));
}

export function verifyWompiWebhookSignature(payload: unknown, eventsSecret: string): boolean {
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;
  const signature = root ? asRecord(root.signature) : null;
  const properties = signature?.properties;
  const checksum = signature?.checksum;
  const timestamp = root?.timestamp;
  if (!data || !Array.isArray(properties) || !properties.length || typeof checksum !== "string" || !Number.isSafeInteger(timestamp)) return false;
  const values: string[] = [];
  for (const property of properties) {
    if (typeof property !== "string") return false;
    const value = signedValue(data, property);
    if (value === null) return false;
    values.push(String(value));
  }
  const expected = crypto.createHash("sha256").update(`${values.join("")}${timestamp}${eventsSecret}`).digest("hex");
  return equalChecksum(checksum, expected);
}

type WompiEvent = { event: string; transactionId: string; reference: string; amountCents: number; currency: string; status: unknown; statusLabel: string };

function parseWompiEvent(payload: unknown, headers: Headers): WompiEvent {
  const config = wompiConfig();
  const root = asRecord(payload);
  const data = root ? asRecord(root.data) : null;
  const transaction = data ? asRecord(data.transaction) : null;
  if (!root || !transaction || typeof root.event !== "string") throw new WompiWebhookValidationError("MALFORMED_EVENT");
  if (root.environment !== (config.env === "sandbox" ? "test" : "prod")) throw new WompiWebhookValidationError("ENVIRONMENT_MISMATCH");
  if (!verifyWompiWebhookSignature(payload, config.events)) throw new WompiWebhookValidationError("INVALID_SIGNATURE");
  const bodyChecksum = asRecord(root.signature)?.checksum;
  const headerChecksum = headers.get("x-event-checksum");
  if (headerChecksum && (typeof bodyChecksum !== "string" || !equalChecksum(headerChecksum, bodyChecksum))) throw new WompiWebhookValidationError("CHECKSUM_MISMATCH");
  const transactionId = typeof transaction.id === "string" ? transaction.id.trim() : "";
  const reference = typeof transaction.reference === "string" ? transaction.reference.trim() : "";
  const rawAmountCents = transaction.amount_in_cents;
  const currency = typeof transaction.currency === "string" ? transaction.currency.trim().toUpperCase() : "";
  if (!transactionId || !reference || typeof rawAmountCents !== "number" || !Number.isSafeInteger(rawAmountCents) || rawAmountCents <= 0 || !currency) {
    throw new WompiWebhookValidationError("TRANSACTION_INVALID");
  }
  return { event: root.event, transactionId, reference, amountCents: rawAmountCents, currency, status: transaction.status, statusLabel: providerStatusLabel(transaction.status) };
}

function wompiStatus(value: unknown): KnownPaymentStatus | null {
  if (typeof value !== "string") return null;
  const status = value.trim().toUpperCase();
  if (status === "APPROVED") return "APPROVED";
  if (status === "PENDING" || status === "IN_PROGRESS") return "PENDING";
  if (status === "DECLINED" || status === "VOIDED" || status === "ERROR") return "REJECTED";
  return null;
}

async function markEvent(client: Tx | typeof prisma, eventId: string, result: WebhookEventResult, details: { tenantId?: string; subscriptionId?: string; rawStatus?: string; errorCode?: string; metadata?: Record<string, unknown> } = {}) {
  await client.webhookEvent.update({ where: { id: eventId }, data: {
    result, tenantId: details.tenantId, subscriptionId: details.subscriptionId, rawStatus: details.rawStatus,
    errorCode: details.errorCode, processedAt: new Date(),
    metadata: details.metadata ? sanitizeWebhookMetadata(details.metadata) : undefined,
  } });
}

class WompiEconomicConflictError extends Error {}

async function billingTransaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const retry = error instanceof WompiEconomicConflictError || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
      if (!retry || attempt === 1) throw error;
    }
  }
  throw new WompiBillingError("No se pudo confirmar el pago en este momento", "WOMPI_TRANSACTION_FAILED");
}

async function applyApproved(tx: Tx, paymentId: string, tenantId: string, subscriptionId: string, now: Date) {
  const subscription = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  if (subscription.tenantId !== tenantId) throw new WompiBillingError("La referencia de pago no coincide con la licencia", "PAYMENT_TENANT_MISMATCH");
  const next = computeNextPeriod({ currentPeriodEnd: subscription.currentPeriodEnd, now, periodDays: BILLING_PERIOD_DAYS, pending: {
    pendingUnitsSnapshot: subscription.pendingUnitsSnapshot, pendingPriceCents: subscription.pendingPriceCents,
    pendingCurrency: subscription.pendingCurrency, fallbackCurrency: subscription.currency,
  } });
  const paymentClaim = await tx.payment.updateMany({
    where: { id: paymentId, status: "APPROVED", approvedEffectAppliedAt: null, approvedEffectReconciliationRequired: false },
    data: { approvedEffectAppliedAt: now },
  });
  if (paymentClaim.count !== 1) return { effectApplied: false as const, payment: await tx.payment.findUniqueOrThrow({ where: { id: paymentId } }) };
  await tx.payment.update({ where: { id: paymentId }, data: { periodStart: next.periodStart, periodEnd: next.periodEnd } });
  const economics = await tx.subscription.updateMany({ where: {
    id: subscription.id, tenantId: subscription.tenantId, currentPeriodStart: subscription.currentPeriodStart,
    currentPeriodEnd: subscription.currentPeriodEnd, unitsSnapshot: subscription.unitsSnapshot,
    priceCents: subscription.priceCents, currency: subscription.currency,
    pendingUnitsSnapshot: subscription.pendingUnitsSnapshot, pendingPriceCents: subscription.pendingPriceCents,
    pendingCurrency: subscription.pendingCurrency, pendingPriceEffectiveAt: subscription.pendingPriceEffectiveAt,
  }, data: {
    currentPeriodStart: next.periodStart, currentPeriodEnd: next.periodEnd,
    ...(next.effectiveTerms ? { unitsSnapshot: next.effectiveTerms.unitsSnapshot, priceCents: next.effectiveTerms.priceCents, currency: next.effectiveTerms.currency } : {}),
    ...(next.clearPending ? { pendingUnitsSnapshot: null, pendingPriceCents: null, pendingCurrency: null, pendingPriceEffectiveAt: null } : {}),
  } });
  if (economics.count !== 1) throw new WompiEconomicConflictError();
  const access = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } });
  const terminal = access.status === "SUSPENDED" || access.status === "CANCELLED";
  let accessRestored = false;
  if (!terminal) {
    const claimed = await tx.subscription.updateMany({ where: {
      id: access.id, tenantId: access.tenantId, status: access.status, currentPeriodEnd: access.currentPeriodEnd,
      graceEndsAt: access.graceEndsAt, trialEndsAt: access.trialEndsAt,
    }, data: { status: "ACTIVE", graceEndsAt: null, lastWebhookAt: now } });
    accessRestored = claimed.count === 1;
    if (accessRestored) await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE", cancelledAt: null } });
  }
  return {
    effectApplied: true as const,
    payment: await tx.payment.findUniqueOrThrow({ where: { id: paymentId } }),
    periodEnd: next.periodEnd,
    accessRestored,
    accessPreserved: terminal || !accessRestored,
  };
}

async function processEvent(eventId: string, incoming: WompiEvent) {
  return billingTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi:${incoming.reference}`}, 0))`;
    if (incoming.event !== "transaction.updated") {
      await markEvent(tx, eventId, WebhookEventResult.UNSUPPORTED_TOPIC, { rawStatus: incoming.statusLabel || undefined });
      return { processed: false, reason: "unsupported-event" };
    }
    const payment = await tx.payment.findFirst({ where: { provider: "WOMPI", externalReference: incoming.reference }, orderBy: { createdAt: "asc" } });
    if (!payment) {
      await markEvent(tx, eventId, WebhookEventResult.ENTITY_NOT_FOUND, { rawStatus: incoming.statusLabel || undefined });
      return { processed: false, reason: "payment-not-found" };
    }
    const bound = await tx.payment.findUnique({ where: { wompiTransactionId: incoming.transactionId } });
    if (bound && bound.id !== payment.id) {
      await markEvent(tx, eventId, WebhookEventResult.IGNORED, {
        tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, rawStatus: incoming.statusLabel || undefined,
        metadata: { provider: WOMPI_PROVIDER, reason: "transaction-bound-elsewhere", transactionId: incoming.transactionId },
      });
      return { processed: false, reason: "transaction-bound-elsewhere" };
    }
    if (payment.amountCents !== incoming.amountCents || payment.currency !== incoming.currency) {
      await markEvent(tx, eventId, WebhookEventResult.IGNORED, {
        tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, rawStatus: incoming.statusLabel || undefined,
        metadata: { provider: WOMPI_PROVIDER, reason: "payment-terms-mismatch", transactionId: incoming.transactionId },
      });
      return { processed: false, reason: "payment-terms-mismatch" };
    }
    const incomingStatus = wompiStatus(incoming.status);
    if (!incomingStatus) {
      await tx.payment.update({ where: { id: payment.id }, data: { wompiTransactionId: payment.wompiTransactionId ?? incoming.transactionId, rawStatus: incoming.statusLabel || null } });
      await markEvent(tx, eventId, WebhookEventResult.IGNORED, {
        tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, rawStatus: incoming.statusLabel || undefined,
        metadata: { provider: WOMPI_PROVIDER, reason: "unknown-transaction-status", transactionId: incoming.transactionId },
      });
      return { processed: false, reason: "unknown-transaction-status" };
    }
    const decision = decidePaymentRowTransition({
      incoming: incomingStatus,
      current: { status: payment.status as KnownPaymentStatus, approvedEffectAppliedAt: payment.approvedEffectAppliedAt },
    });
    const now = new Date();
    const persisted = await tx.payment.update({ where: { id: payment.id }, data: {
      status: decision.nextPaymentStatus,
      wompiTransactionId: payment.wompiTransactionId ?? incoming.transactionId,
      rawStatus: truncateProviderStatus(incoming.statusLabel) || null,
      paidAt: decision.nextPaymentStatus === "APPROVED" ? payment.paidAt ?? now : null,
    } });
    if (incomingStatus === "APPROVED") {
      const outcome = await applyApproved(tx, payment.id, payment.tenantId, payment.subscriptionId, now);
      const result = outcome.effectApplied ? WebhookEventResult.PROCESSED : WebhookEventResult.DUPLICATE;
      const metadata = {
        provider: WOMPI_PROVIDER, transactionId: incoming.transactionId, reference: incoming.reference,
        rawStatus: incoming.statusLabel || null, effectKey: buildPaymentEffectKey(WOMPI_PROVIDER, incoming.transactionId),
        effectApplied: outcome.effectApplied, accessRestored: outcome.effectApplied ? outcome.accessRestored : false,
        accessPreserved: outcome.effectApplied ? outcome.accessPreserved : false,
      };
      if (outcome.effectApplied) await createBillingOutboxIntentsForTransition(tx, {
        tenantId: payment.tenantId, subscriptionId: payment.subscriptionId,
        eventType: BillingOutboxEventType.SAAS_PAYMENT_APPROVED, boundary: outcome.payment.createdAt, periodEndsAt: outcome.periodEnd,
      });
      await registerAuditLog({ actorUserId: null, tenantId: payment.tenantId, action: AuditAction.WOMPI_WEBHOOK_PROCESSED, targetType: "Payment", targetId: payment.id, metadata }, tx);
      await markEvent(tx, eventId, result, { tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, rawStatus: incoming.statusLabel || undefined, metadata });
      return { processed: outcome.effectApplied, paymentId: payment.id, result };
    }
    const rejected = incomingStatus === "REJECTED" && persisted.status === "REJECTED" && payment.status !== "REJECTED";
    const metadata = {
      provider: WOMPI_PROVIDER, transactionId: incoming.transactionId, reference: incoming.reference,
      rawStatus: incoming.statusLabel || null, previousPaymentStatus: payment.status,
      persistedPaymentStatus: persisted.status, effectApplied: false,
    };
    if (rejected) await createBillingOutboxIntentsForTransition(tx, {
      tenantId: payment.tenantId, subscriptionId: payment.subscriptionId,
      eventType: BillingOutboxEventType.SAAS_PAYMENT_REJECTED, boundary: persisted.createdAt,
    });
    await registerAuditLog({ actorUserId: null, tenantId: payment.tenantId, action: AuditAction.WOMPI_WEBHOOK_PROCESSED, targetType: "Payment", targetId: payment.id, metadata }, tx);
    await markEvent(tx, eventId, WebhookEventResult.PROCESSED, { tenantId: payment.tenantId, subscriptionId: payment.subscriptionId, rawStatus: incoming.statusLabel || undefined, metadata });
    return { processed: true, paymentId: payment.id, result: WebhookEventResult.PROCESSED };
  });
}

function errorCode(error: unknown) {
  if (error instanceof WompiBillingError || error instanceof WompiWebhookValidationError) return error.code;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `PRISMA_${error.code}`;
  return "PROCESSING_FAILED";
}

export async function processWompiWebhook(payload: unknown, headers: Headers) {
  const incoming = parseWompiEvent(payload, headers);
  const ledger = await prisma.webhookEvent.create({ data: {
    provider: WOMPI_PROVIDER, topic: incoming.event, dataId: incoming.transactionId,
    rawStatus: incoming.statusLabel || null, result: WebhookEventResult.RECEIVED,
    metadata: sanitizeWebhookMetadata({ provider: WOMPI_PROVIDER, transactionId: incoming.transactionId, reference: incoming.reference, amountCents: incoming.amountCents, currency: incoming.currency }),
  } });
  try {
    return { ...(await processEvent(ledger.id, incoming)), event: incoming.event, transactionId: incoming.transactionId };
  } catch (error) {
    await markEvent(prisma, ledger.id, WebhookEventResult.FAILED, { errorCode: errorCode(error) }).catch(() => undefined);
    throw error;
  }
}
