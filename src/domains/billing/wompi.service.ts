import crypto from "crypto";
import { AuditAction, BillingOutboxEventType, Prisma, WebhookEventResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createBillingOutboxIntentsForTransition } from "./billing-outbox.service";
import { BILLING_PERIOD_DAYS, computeNextPeriod } from "./period";
import { buildPaymentEffectKey, sanitizeWebhookMetadata } from "./webhook-metadata";
import { decidePaymentRowTransition, providerStatusLabel, truncateProviderStatus, type KnownPaymentStatus } from "./precedence";
import {
  ASSISTED_IMPLEMENTATION_FEE_CENTS,
  MAX_FOUNDER_CUSTOMERS,
  addCalendarMonths,
  annualTerms,
} from "@/domains/commercial/commercial-policy";

const WOMPI_PROVIDER = "WOMPI";
const WOMPI_CHECKOUT_URL = "https://checkout.wompi.co/p/";
const ALLOWED_OPERATION_ID = /^[A-Za-z0-9_-]{8,128}$/;
type Tx = Prisma.TransactionClient;
type Env = "sandbox" | "production";
type Config = { env: Env; publicKey: string; integrity: string; events: string; privateKey?: string };
type RecordValue = Record<string, unknown>;
const WOMPI_API_BY_ENV: Record<Env, string> = {
  sandbox: "https://sandbox.wompi.co/v1",
  production: "https://production.wompi.co/v1",
};

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

function wompiConfig(options: { requirePrivateKey?: boolean } = {}): Config {
  const env = process.env.WOMPI_ENV?.trim().toLowerCase();
  if (env !== "sandbox" && env !== "production") throw new WompiBillingError("La integracion Wompi no tiene un ambiente valido", "WOMPI_ENV_INVALID");
  const suffix = env === "sandbox" ? "SANDBOX" : "PRODUCTION";
  const prefix = env === "sandbox" ? "test" : "prod";
  const value = (name: string, label: string, expected: string) => {
    const current = process.env[`WOMPI_${suffix}_${name}`]?.trim() || "";
    if (!current.startsWith(expected)) throw new WompiBillingError(`Falta configurar ${label} de Wompi`, "WOMPI_NOT_CONFIGURED");
    return current;
  };
  const privateKey = process.env[`WOMPI_${suffix}_PRIVATE_KEY`]?.trim() || "";
  if (options.requirePrivateKey && !privateKey.startsWith(`prv_${prefix}_`)) {
    throw new WompiBillingError("Falta configurar la llave privada de Wompi", "WOMPI_PRIVATE_KEY_NOT_CONFIGURED");
  }
  return {
    env,
    publicKey: value("PUBLIC_KEY", "la llave publica", `pub_${prefix}_`),
    integrity: value("INTEGRITY_SECRET", "el secreto de integridad", `${prefix}_integrity_`),
    events: value("EVENTS_SECRET", "el secreto de eventos", `${prefix}_events_`),
    privateKey: privateKey || undefined,
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

type CheckoutBillingMode = "MONTHLY" | "ANNUAL";

type CommercialCheckoutSnapshot = {
  commercialStatus: string;
  billingMode: "MONTHLY" | "ANNUAL" | null;
  postPilotListPriceCents: number | null;
  pilotAccessEndsAt: Date | null;
} | null;

function parseCheckoutBillingMode(value: unknown): CheckoutBillingMode {
  if (value === undefined || value === null || value === "MONTHLY") return "MONTHLY";
  if (value === "ANNUAL") return "ANNUAL";
  throw new WompiBillingError("El plan seleccionado no es valido", "BILLING_MODE_INVALID");
}

function isPilotConversion(status: string | null | undefined) {
  return status === "PILOT_ACTIVE" || status === "PILOT_EVALUATION";
}

function annualCheckoutAllowed(commercial: CommercialCheckoutSnapshot) {
  if (!commercial) return true;
  return ["LEGACY_REVIEW", "CONVERTED_MONTHLY", "CONVERTED_ANNUAL", "PILOT_ACTIVE", "PILOT_EVALUATION"].includes(commercial.commercialStatus);
}

function monthlyCheckoutAllowed(commercial: CommercialCheckoutSnapshot) {
  return !commercial || ["LEGACY_REVIEW", "CONVERTED_MONTHLY"].includes(commercial.commercialStatus);
}

function resolveAnnualTerms(subscription: { priceCents: number; pendingPriceCents: number | null; currency: string; pendingCurrency: string | null }, commercial: CommercialCheckoutSnapshot) {
  const monthlyListPriceCents = commercial?.postPilotListPriceCents ?? subscription.pendingPriceCents ?? subscription.priceCents;
  const currency = subscription.pendingCurrency || subscription.currency;
  if (!Number.isSafeInteger(monthlyListPriceCents) || monthlyListPriceCents <= 0 || currency !== "COP") {
    throw new WompiBillingError("La licencia no tiene un valor anual valido", "ANNUAL_BILLING_TERMS_INVALID");
  }
  return { monthlyListPriceCents, currency, ...annualTerms(monthlyListPriceCents) };
}

export async function getWompiAnnualCheckoutOffer(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { subscription: true, commercialProfile: { select: { commercialStatus: true, billingMode: true, postPilotListPriceCents: true, pilotAccessEndsAt: true } } },
  });
  if (!tenant?.subscription) throw new WompiBillingError("El conjunto no tiene una licencia disponible para pago", "SUBSCRIPTION_NOT_FOUND");
  const commercial = tenant.commercialProfile;
  if (!annualCheckoutAllowed(commercial)) return { eligible: false as const };
  const terms = resolveAnnualTerms(tenant.subscription, commercial);
  return {
    eligible: true as const,
    currency: terms.currency,
    monthlyListPriceCents: terms.monthlyListPriceCents,
    listAmountCents: terms.listPriceCents,
    discountBps: terms.discountBps,
    amountCents: terms.effectivePriceCents,
    savingsCents: terms.listPriceCents - terms.effectivePriceCents,
    startsAfterCurrentPeriod: !isPilotConversion(commercial?.commercialStatus) && tenant.subscription.currentPeriodEnd > new Date(),
    isPilotConversion: isPilotConversion(commercial?.commercialStatus),
  };
}

export async function createWompiCheckoutForTenant(input: { actorUserId: string; tenantId: string; operationId?: unknown; billingMode?: unknown }) {
  const config = wompiConfig();
  const requestOperationId = operationId(input.operationId);
  const billingMode = parseCheckoutBillingMode(input.billingMode);
  const [tenant, actor, commercial] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: input.tenantId }, include: { subscription: true } }),
    prisma.user.findUnique({ where: { id: input.actorUserId }, select: { email: true, name: true, isActive: true } }),
    prisma.tenantCommercialProfile.findUnique({ where: { tenantId: input.tenantId }, select: { commercialStatus: true, billingMode: true, postPilotListPriceCents: true, pilotAccessEndsAt: true } }),
  ]);
  if (!tenant?.subscription) throw new WompiBillingError("El conjunto no tiene una licencia disponible para pago", "SUBSCRIPTION_NOT_FOUND");
  if (!actor?.isActive || !actor.email) throw new WompiBillingError("No se pudo identificar la cuenta que realiza el pago", "ACTOR_NOT_FOUND");
  if ((billingMode === "ANNUAL" && !annualCheckoutAllowed(commercial)) || (billingMode === "MONTHLY" && !monthlyCheckoutAllowed(commercial))) {
    throw new WompiBillingError("Este conjunto debe continuar su proceso comercial antes de pagar en linea", "COMMERCIAL_PAYMENT_BLOCKED");
  }
  const subscription = tenant.subscription;
  const annual = billingMode === "ANNUAL" ? resolveAnnualTerms(subscription, commercial) : null;
  const amountCents = annual?.effectivePriceCents ?? subscription.pendingPriceCents ?? subscription.priceCents;
  const currency = annual?.currency ?? subscription.pendingCurrency ?? subscription.currency;
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== "COP") {
    throw new WompiBillingError("La licencia no tiene un valor de cobro valido", "BILLING_TERMS_INVALID");
  }
  if (subscription.status === "CANCELLED") throw new WompiBillingError("La licencia esta cancelada. Contacta a PQRS Services para reactivarla", "SUBSCRIPTION_CANCELLED");
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ tenantId: input.tenantId, subscriptionId: subscription.id, billingMode, amountCents, currency, requestOperationId })).digest("hex");
  const payment = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi-checkout:${input.tenantId}:${requestOperationId}`}, 0))`;
    const existing = await tx.payment.findUnique({ where: { tenantId_operationId: { tenantId: input.tenantId, operationId: requestOperationId } } });
    if (existing) {
      if (existing.provider !== "WOMPI" || existing.requestHash !== requestHash || !existing.externalReference) {
        throw new WompiBillingError("La operacion de pago no coincide con la solicitud original", "OPERATION_CONFLICT");
      }
      return existing;
    }
    const pendingPayment = await tx.payment.findFirst({
      where: { tenantId: input.tenantId, subscriptionId: subscription.id, provider: "WOMPI", status: "PENDING" },
      select: { id: true },
    });
    if (pendingPayment) {
      throw new WompiBillingError("Ya hay un pago Wompi en proceso. Espera su confirmacion antes de iniciar otro.", "WOMPI_PAYMENT_ALREADY_PENDING");
    }
    const now = new Date();
    const created = await tx.payment.create({ data: {
      tenantId: input.tenantId, subscriptionId: subscription.id, amountCents, currency,
      concept: billingMode === "ANNUAL" ? "SUBSCRIPTION_ANNUAL" : "SUBSCRIPTION_MONTHLY",
      listAmountCents: annual?.listPriceCents ?? null, discountBps: annual?.discountBps ?? 0,
      status: "PENDING", provider: "WOMPI", dueDate: now, periodStart: now, periodEnd: annual ? addCalendarMonths(now, 12) : now,
      operationId: requestOperationId, requestHash, recordedByUserId: input.actorUserId, rawStatus: "CHECKOUT_CREATED",
    } });
    const reference = billingMode === "ANNUAL" ? `WOMPI_ANNUAL_${created.id}` : `WOMPI_${created.id}`;
    const updated = await tx.payment.update({ where: { id: created.id }, data: { externalReference: reference } });
    await registerAuditLog({
      actorUserId: input.actorUserId, tenantId: input.tenantId, action: AuditAction.WOMPI_CHECKOUT_CREATED,
      targetType: "Payment", targetId: updated.id,
      metadata: { provider: WOMPI_PROVIDER, paymentId: updated.id, reference, billingMode, concept: updated.concept, amountCents, listAmountCents: updated.listAmountCents, discountBps: updated.discountBps, currency, operationId: requestOperationId, environment: config.env },
    }, tx);
    return updated;
  });
  return {
    paymentId: payment.id,
    reference: payment.externalReference!,
    checkoutUrl: checkoutUrl(config, payment.externalReference!, payment.amountCents, payment.currency, actor.email, actor.name),
  };
}

type WompiAcceptanceContracts = {
  acceptanceToken: string;
  personalDataToken: string;
  termsUrl: string;
  personalDataUrl: string;
};

type WompiSourceSummary = {
  id: string;
  type: "CARD";
  status: "ACTIVE" | "REVOKED";
  brand: string | null;
  lastFour: string | null;
  expMonth: string | null;
  expYear: string | null;
  customerEmail: string;
  consentedAt: Date;
};

function wompiEnvironment(env: Env) {
  return env === "sandbox" ? "SANDBOX" as const : "PRODUCTION" as const;
}

function safeWompiErrorCode(status: number) {
  if (status === 400) return "WOMPI_REQUEST_REJECTED";
  if (status === 401 || status === 403) return "WOMPI_AUTHORIZATION_FAILED";
  if (status === 404) return "WOMPI_RESOURCE_NOT_FOUND";
  if (status === 409) return "WOMPI_CONFLICT";
  if (status >= 500) return "WOMPI_PROVIDER_UNAVAILABLE";
  return "WOMPI_REQUEST_FAILED";
}

async function wompiApiRequest(config: Config, path: string, init: RequestInit & { private?: boolean } = {}) {
  const { private: usePrivateKey, ...request } = init;
  const authorization = usePrivateKey ? config.privateKey : config.publicKey;
  if (!authorization) throw new WompiBillingError("Falta configurar la llave privada de Wompi", "WOMPI_PRIVATE_KEY_NOT_CONFIGURED");
  let response: Response;
  try {
    response = await fetch(`${WOMPI_API_BY_ENV[config.env]}${path}`, {
      ...request,
      headers: {
        Accept: "application/json",
        ...(request.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${authorization}`,
        ...request.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new WompiBillingError("No fue posible comunicarse con Wompi", "WOMPI_NETWORK_ERROR");
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    console.warn("[billing/wompi] provider request failed", { path, status: response.status });
    throw new WompiBillingError("Wompi no pudo procesar la solicitud. Intentalo de nuevo.", safeWompiErrorCode(response.status));
  }
  return payload;
}

function readString(source: RecordValue | null, key: string) {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInteger(source: RecordValue | null, key: string) {
  const value = source?.[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

async function getWompiAcceptanceContracts(config: Config): Promise<WompiAcceptanceContracts> {
  const payload = await wompiApiRequest(config, `/merchants/${encodeURIComponent(config.publicKey)}`);
  const data = asRecord(payload) ? asRecord(asRecord(payload)?.data) : null;
  const acceptance = data ? asRecord(data.presigned_acceptance) : null;
  const personal = data ? asRecord(data.presigned_personal_data_auth) : null;
  const acceptanceToken = readString(acceptance, "acceptance_token");
  const personalDataToken = readString(personal, "acceptance_token");
  const termsUrl = readString(acceptance, "permalink");
  const personalDataUrl = readString(personal, "permalink");
  if (!acceptanceToken || !personalDataToken || !termsUrl || !personalDataUrl) {
    throw new WompiBillingError("No fue posible cargar los documentos de autorizacion de Wompi", "WOMPI_ACCEPTANCE_CONTRACTS_INVALID");
  }
  return { acceptanceToken, personalDataToken, termsUrl, personalDataUrl };
}

function toWompiSourceSummary(method: {
  id: string; type: "CARD"; status: "ACTIVE" | "REVOCATION_PENDING" | "REVOKED";
  brand: string | null; lastFour: string | null; expMonth: string | null; expYear: string | null;
  customerEmail: string; consentedAt: Date;
}): WompiSourceSummary {
  return {
    ...method,
    status: method.status === "ACTIVE" ? "ACTIVE" : "REVOKED",
  };
}

export async function getWompiAutomaticPaymentState(tenantId: string) {
  const config = wompiConfig();
  const [subscription, method] = await Promise.all([
    prisma.subscription.findUnique({ where: { tenantId }, select: { autoRenew: true, status: true } }),
    prisma.wompiPaymentMethod.findFirst({
      where: { tenantId, environment: wompiEnvironment(config.env), status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, brand: true, lastFour: true, expMonth: true, expYear: true, customerEmail: true, consentedAt: true },
    }),
  ]);
  if (!subscription) throw new WompiBillingError("El conjunto no tiene una licencia disponible para pago", "SUBSCRIPTION_NOT_FOUND");
  return {
    environment: config.env,
    automaticEnabled: subscription.autoRenew && method?.status === "ACTIVE",
    method: method ? toWompiSourceSummary(method) : null,
  };
}

export async function getWompiAutomaticPaymentSetup(tenantId: string) {
  const config = wompiConfig({ requirePrivateKey: true });
  const [state, contracts] = await Promise.all([
    getWompiAutomaticPaymentState(tenantId),
    getWompiAcceptanceContracts(config),
  ]);
  return {
    ...state,
    publicKey: config.publicKey,
    agreements: { termsUrl: contracts.termsUrl, personalDataUrl: contracts.personalDataUrl },
  };
}

export async function createWompiPaymentMethodForTenant(input: {
  actorUserId: string;
  tenantId: string;
  token: unknown;
  type: unknown;
  acceptedTerms: boolean;
  acceptedPersonalData: boolean;
}) {
  const config = wompiConfig({ requirePrivateKey: true });
  const token = typeof input.token === "string" ? input.token.trim() : "";
  const type = typeof input.type === "string" ? input.type.trim().toUpperCase() : "";
  if (!token || token.length > 500 || type !== "CARD") {
    throw new WompiBillingError("No fue posible registrar el medio de pago", "WOMPI_SOURCE_TOKEN_INVALID");
  }
  if (!input.acceptedTerms || !input.acceptedPersonalData) {
    throw new WompiBillingError("Debes aceptar los documentos de Wompi para activar el cobro automatico", "WOMPI_CONSENT_REQUIRED");
  }

  const [actor, subscription, contracts] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.actorUserId }, select: { email: true, isActive: true } }),
    prisma.subscription.findUnique({ where: { tenantId: input.tenantId }, select: { id: true, status: true } }),
    getWompiAcceptanceContracts(config),
  ]);
  if (!actor?.isActive || !actor.email) throw new WompiBillingError("No se pudo identificar la cuenta que autoriza el cobro", "ACTOR_NOT_FOUND");
  if (!subscription || subscription.status === "CANCELLED") throw new WompiBillingError("La licencia no permite activar cobros automaticos", "SUBSCRIPTION_CANCELLED");

  const payload = await wompiApiRequest(config, "/payment_sources", {
    method: "POST",
    private: true,
    body: JSON.stringify({
      type: "CARD",
      token,
      customer_email: actor.email,
      acceptance_token: contracts.acceptanceToken,
      accept_personal_auth: contracts.personalDataToken,
    }),
  });
  const source = asRecord(asRecord(payload)?.data);
  const providerSourceId = readInteger(source, "id");
  const sourceStatus = readString(source, "status")?.toUpperCase();
  const publicData = source ? asRecord(source.public_data) : null;
  if (!providerSourceId || sourceStatus !== "AVAILABLE") {
    throw new WompiBillingError("Wompi no pudo dejar disponible el medio de pago", "WOMPI_SOURCE_UNAVAILABLE");
  }

  const environment = wompiEnvironment(config.env);
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi-payment-method:${input.tenantId}`}, 0))`;
      const currentSubscription = await tx.subscription.findUnique({ where: { tenantId: input.tenantId }, select: { id: true, status: true, autoRenew: true } });
      if (!currentSubscription || currentSubscription.status === "CANCELLED") throw new WompiBillingError("La licencia no permite activar cobros automaticos", "SUBSCRIPTION_CANCELLED");
      const active = await tx.wompiPaymentMethod.findFirst({
        where: { tenantId: input.tenantId, environment, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, providerSourceId: true },
      });
      if (active) await tx.wompiPaymentMethod.update({ where: { id: active.id }, data: { status: "REVOKED", revokedAt: now } });
      const method = await tx.wompiPaymentMethod.create({ data: {
        tenantId: input.tenantId,
        createdByUserId: input.actorUserId,
        environment,
        providerSourceId,
        type: "CARD",
        status: "ACTIVE",
        customerEmail: actor.email,
        brand: readString(publicData, "brand"),
        lastFour: readString(publicData, "last_four"),
        expMonth: readString(publicData, "exp_month"),
        expYear: readString(publicData, "exp_year"),
        consentedAt: now,
      } });
      await tx.subscription.update({ where: { id: currentSubscription.id }, data: { autoRenew: true } });
      await registerAuditLog({
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        action: AuditAction.WOMPI_PAYMENT_METHOD_CREATED,
        targetType: "WompiPaymentMethod",
        targetId: method.id,
        metadata: { provider: WOMPI_PROVIDER, environment: config.env, type: method.type, automaticEnabled: true },
      }, tx);
      if (!currentSubscription.autoRenew) {
        await registerAuditLog({
          actorUserId: input.actorUserId,
          tenantId: input.tenantId,
          action: AuditAction.SUBSCRIPTION_AUTO_RENEW_ENABLED,
          targetType: "Subscription",
          targetId: currentSubscription.id,
          metadata: { provider: WOMPI_PROVIDER, methodId: method.id },
        }, tx);
      }
      return { method: toWompiSourceSummary(method), replacedPreviousMethod: Boolean(active) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const initialCharge = await runWompiAutomaticRenewals(new Date(), { tenantIds: [input.tenantId] });
  return {
    method: result.method,
    automaticEnabled: true,
    replacedPreviousMethod: result.replacedPreviousMethod,
    initialChargeStarted: initialCharge.initiated > 0,
  };
}

export async function setWompiAutomaticRenewal(input: { actorUserId: string; tenantId: string; enabled: boolean }) {
  const config = wompiConfig();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi-auto-renew:${input.tenantId}`}, 0))`;
    const subscription = await tx.subscription.findUnique({ where: { tenantId: input.tenantId }, select: { id: true, status: true, autoRenew: true } });
    if (!subscription || subscription.status === "CANCELLED") throw new WompiBillingError("La licencia no permite cambiar el cobro automatico", "SUBSCRIPTION_CANCELLED");
    if (input.enabled) {
      const method = await tx.wompiPaymentMethod.findFirst({
        where: { tenantId: input.tenantId, environment: wompiEnvironment(config.env), status: "ACTIVE" },
        select: { id: true },
      });
      if (!method) throw new WompiBillingError("Registra primero un medio de pago para activar el cobro automatico", "WOMPI_SOURCE_REQUIRED");
    }
    if (subscription.autoRenew !== input.enabled) {
      await tx.subscription.update({ where: { id: subscription.id }, data: { autoRenew: input.enabled } });
      await registerAuditLog({
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        action: input.enabled ? AuditAction.SUBSCRIPTION_AUTO_RENEW_ENABLED : AuditAction.SUBSCRIPTION_AUTO_RENEW_DISABLED,
        targetType: "Subscription",
        targetId: subscription.id,
        metadata: { provider: WOMPI_PROVIDER, enabled: input.enabled },
      }, tx);
    }
    return { automaticEnabled: input.enabled };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function revokeWompiPaymentMethod(input: { actorUserId: string; tenantId: string }) {
  const config = wompiConfig();
  const environment = wompiEnvironment(config.env);
  const now = new Date();
  const target = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi-payment-method:${input.tenantId}`}, 0))`;
    const method = await tx.wompiPaymentMethod.findFirst({
      where: { tenantId: input.tenantId, environment, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    if (!method) throw new WompiBillingError("No hay un medio de pago automatico para eliminar", "WOMPI_SOURCE_NOT_FOUND");
    await tx.wompiPaymentMethod.update({ where: { id: method.id }, data: { status: "REVOKED", revokedAt: now } });
    const subscription = await tx.subscription.findUnique({ where: { tenantId: input.tenantId }, select: { id: true, autoRenew: true } });
    if (subscription?.autoRenew) {
      await tx.subscription.update({ where: { id: subscription.id }, data: { autoRenew: false } });
      await registerAuditLog({
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        action: AuditAction.SUBSCRIPTION_AUTO_RENEW_DISABLED,
        targetType: "Subscription",
        targetId: subscription.id,
        metadata: { provider: WOMPI_PROVIDER, reason: "payment-method-revocation" },
      }, tx);
    }
    await registerAuditLog({
      actorUserId: input.actorUserId,
      tenantId: input.tenantId,
      action: AuditAction.WOMPI_PAYMENT_METHOD_REVOKED,
      targetType: "WompiPaymentMethod",
      targetId: method.id,
      metadata: { provider: WOMPI_PROVIDER, environment: config.env, scope: "PQRS_SERVICES" },
    }, tx);
    return method;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { revoked: Boolean(target) };
}

type AutomaticPaymentIntent = {
  paymentId: string;
  paymentMethodId: string;
  providerSourceId: number;
  amountCents: number;
  currency: string;
  customerEmail: string;
  reference: string;
  billingMode: CheckoutBillingMode;
  concept: "SUBSCRIPTION_MONTHLY" | "SUBSCRIPTION_ANNUAL";
};

type AutomaticPaymentIntentResult =
  | { kind: "READY"; intent: AutomaticPaymentIntent }
  | { kind: "SKIPPED"; reason: string }
  | { kind: "DUPLICATE" };

function automaticOperationId(subscriptionId: string, methodId: string, currentPeriodEnd: Date) {
  return `auto_wompi_${subscriptionId}_${methodId}_${currentPeriodEnd.getTime()}`;
}

async function reserveAutomaticWompiPayment(input: { subscriptionId: string; tenantId: string; now: Date; environment: "SANDBOX" | "PRODUCTION" }): Promise<AutomaticPaymentIntentResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`wompi-auto-charge:${input.subscriptionId}`}, 0))`;
    const subscription = await tx.subscription.findFirst({
      where: { id: input.subscriptionId, tenantId: input.tenantId },
      select: { id: true, tenantId: true, status: true, autoRenew: true, currentPeriodEnd: true, priceCents: true, pendingPriceCents: true, currency: true, pendingCurrency: true },
    });
    if (!subscription || !subscription.autoRenew || subscription.status === "CANCELLED") return { kind: "SKIPPED", reason: "SUBSCRIPTION_NOT_ELIGIBLE" };
    if (subscription.status === "ACTIVE" && subscription.currentPeriodEnd > input.now) return { kind: "SKIPPED", reason: "NOT_DUE" };
    if (!["PENDING_PAYMENT", "ACTIVE", "GRACE_PERIOD", "SUSPENDED"].includes(subscription.status)) return { kind: "SKIPPED", reason: "STATUS_NOT_ELIGIBLE" };
    const method = await tx.wompiPaymentMethod.findFirst({
      where: { tenantId: subscription.tenantId, environment: input.environment, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { id: true, providerSourceId: true, customerEmail: true },
    });
    if (!method) return { kind: "SKIPPED", reason: "PAYMENT_METHOD_NOT_AVAILABLE" };
    const commercial = await tx.tenantCommercialProfile.findUnique({
      where: { tenantId: subscription.tenantId },
      select: { commercialStatus: true, billingMode: true, postPilotListPriceCents: true, pilotAccessEndsAt: true },
    });
    const annual = commercial?.billingMode === "ANNUAL" ? resolveAnnualTerms(subscription, commercial) : null;
    const billingMode: CheckoutBillingMode = annual ? "ANNUAL" : "MONTHLY";
    const concept = annual ? "SUBSCRIPTION_ANNUAL" as const : "SUBSCRIPTION_MONTHLY" as const;
    const operationId = automaticOperationId(subscription.id, method.id, subscription.currentPeriodEnd);
    const previousAttempt = await tx.payment.findUnique({ where: { tenantId_operationId: { tenantId: subscription.tenantId, operationId } }, select: { id: true } });
    if (previousAttempt) return { kind: "DUPLICATE" };
    const pendingPayment = await tx.payment.findFirst({
      where: { tenantId: subscription.tenantId, subscriptionId: subscription.id, provider: "WOMPI", status: "PENDING" },
      select: { id: true },
    });
    if (pendingPayment) return { kind: "SKIPPED", reason: "PAYMENT_ALREADY_PENDING" };
    const amountCents = annual?.effectivePriceCents ?? subscription.pendingPriceCents ?? subscription.priceCents;
    const currency = annual?.currency ?? subscription.pendingCurrency ?? subscription.currency;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || currency !== "COP") return { kind: "SKIPPED", reason: "INVALID_BILLING_TERMS" };
    const requestHash = crypto.createHash("sha256").update(JSON.stringify({ tenantId: subscription.tenantId, subscriptionId: subscription.id, methodId: method.id, billingMode, amountCents, currency, operationId })).digest("hex");
    const payment = await tx.payment.create({ data: {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      wompiPaymentMethodId: method.id,
      amountCents,
      concept,
      listAmountCents: annual?.listPriceCents ?? null,
      discountBps: annual?.discountBps ?? 0,
      currency,
      status: "PENDING",
      provider: "WOMPI",
      dueDate: input.now,
      periodStart: input.now,
      periodEnd: input.now,
      operationId,
      requestHash,
      rawStatus: "AUTOMATIC_CHARGE_CREATED",
    } });
    const reference = annual ? `WOMPI_ANNUAL_${payment.id}` : `WOMPI_${payment.id}`;
    const updated = await tx.payment.update({ where: { id: payment.id }, data: { externalReference: reference } });
    await registerAuditLog({
      actorUserId: null,
      tenantId: subscription.tenantId,
      action: AuditAction.WOMPI_AUTOMATIC_CHARGE_CREATED,
      targetType: "Payment",
      targetId: payment.id,
      metadata: { provider: WOMPI_PROVIDER, paymentId: payment.id, reference, billingMode, concept, amountCents, listAmountCents: annual?.listPriceCents ?? null, discountBps: annual?.discountBps ?? 0, currency, methodId: method.id },
    }, tx);
    return { kind: "READY", intent: { paymentId: updated.id, paymentMethodId: method.id, providerSourceId: method.providerSourceId, amountCents, currency, customerEmail: method.customerEmail, reference, billingMode, concept } };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function createWompiAutomaticTransaction(config: Config, intent: AutomaticPaymentIntent) {
  const signature = crypto.createHash("sha256").update(`${intent.reference}${intent.amountCents}${intent.currency}${config.integrity}`).digest("hex");
  const payload = await wompiApiRequest(config, "/transactions", {
    method: "POST",
    private: true,
    body: JSON.stringify({
      amount_in_cents: intent.amountCents,
      currency: intent.currency,
      customer_email: intent.customerEmail,
      payment_method: { installments: 1 },
      payment_source_id: intent.providerSourceId,
      recurrent: true,
      reference: intent.reference,
      signature,
    }),
  });
  const transaction = asRecord(asRecord(payload)?.data);
  const transactionId = readString(transaction, "id");
  const rawStatus = readString(transaction, "status");
  if (!transactionId) throw new WompiBillingError("Wompi no devolvio una transaccion valida", "WOMPI_TRANSACTION_INVALID");
  return { transactionId, rawStatus };
}

async function markAutomaticWompiChargeFailed(intent: AutomaticPaymentIntent, error: unknown) {
  const code = error instanceof WompiBillingError ? error.code : "WOMPI_AUTOMATIC_CHARGE_FAILED";
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: intent.paymentId }, select: { id: true, tenantId: true, subscriptionId: true, status: true, createdAt: true } });
    if (!payment || payment.status !== "PENDING") return;
    await tx.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", rawStatus: code } });
    await createBillingOutboxIntentsForTransition(tx, {
      tenantId: payment.tenantId,
      subscriptionId: payment.subscriptionId,
      eventType: BillingOutboxEventType.SAAS_PAYMENT_REJECTED,
      boundary: payment.createdAt,
    });
    await registerAuditLog({
      actorUserId: null,
      tenantId: payment.tenantId,
      action: AuditAction.WOMPI_AUTOMATIC_CHARGE_FAILED,
      targetType: "Payment",
      targetId: payment.id,
      metadata: { provider: WOMPI_PROVIDER, errorCode: code, failedAt: now.toISOString() },
    }, tx);
  });
}

export type WompiAutomaticRenewalSummary = {
  examined: number;
  initiated: number;
  duplicate: number;
  skipped: number;
  failed: number;
  errors: { subscriptionId: string; code: string }[];
};

export async function runWompiAutomaticRenewals(
  now = new Date(),
  options: { tenantIds?: string[] } = {}
): Promise<WompiAutomaticRenewalSummary> {
  const summary: WompiAutomaticRenewalSummary = { examined: 0, initiated: 0, duplicate: 0, skipped: 0, failed: 0, errors: [] };
  let config: Config;
  try {
    config = wompiConfig({ requirePrivateKey: true });
  } catch (error) {
    summary.failed = 1;
    summary.errors.push({ subscriptionId: "configuration", code: error instanceof WompiBillingError ? error.code : "WOMPI_CONFIGURATION_FAILED" });
    return summary;
  }
  let candidates: { id: string; tenantId: string }[];
  try {
    candidates = await prisma.subscription.findMany({
      where: {
        autoRenew: true,
        status: { in: ["PENDING_PAYMENT", "ACTIVE", "GRACE_PERIOD", "SUSPENDED"] },
        tenant: { status: { not: "CANCELLED" } },
        ...(options.tenantIds?.length ? { tenantId: { in: Array.from(new Set(options.tenantIds)) } } : {}),
      },
      select: { id: true, tenantId: true },
      orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
      take: 100,
    });
  } catch {
    summary.failed = 1;
    summary.errors.push({ subscriptionId: "selection", code: "AUTO_RENEW_SELECTION_FAILED" });
    return summary;
  }
  for (const candidate of candidates) {
    summary.examined += 1;
    let reserved: AutomaticPaymentIntentResult;
    try {
      reserved = await reserveAutomaticWompiPayment({ subscriptionId: candidate.id, tenantId: candidate.tenantId, now, environment: wompiEnvironment(config.env) });
    } catch (error) {
      summary.failed += 1;
      summary.errors.push({ subscriptionId: candidate.id, code: error instanceof WompiBillingError ? error.code : "AUTO_RENEW_RESERVATION_FAILED" });
      continue;
    }
    if (reserved.kind === "DUPLICATE") {
      summary.duplicate += 1;
      continue;
    }
    if (reserved.kind === "SKIPPED") {
      summary.skipped += 1;
      continue;
    }
    try {
      const transaction = await createWompiAutomaticTransaction(config, reserved.intent);
      await prisma.payment.updateMany({
        where: { id: reserved.intent.paymentId, status: "PENDING", wompiTransactionId: null },
        data: { wompiTransactionId: transaction.transactionId, rawStatus: transaction.rawStatus || "AUTOMATIC_CHARGE_PENDING" },
      });
      summary.initiated += 1;
    } catch (error) {
      await markAutomaticWompiChargeFailed(reserved.intent, error).catch(() => undefined);
      summary.failed += 1;
      summary.errors.push({ subscriptionId: candidate.id, code: error instanceof WompiBillingError ? error.code : "AUTO_RENEW_PROVIDER_FAILED" });
    }
  }
  return summary;
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

async function applyAnnualApproved(tx: Tx, paymentId: string, tenantId: string, subscriptionId: string, now: Date) {
  const [payment, subscription, commercial] = await Promise.all([
    tx.payment.findUniqueOrThrow({ where: { id: paymentId } }),
    tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId } }),
    tx.tenantCommercialProfile.findUnique({ where: { tenantId } }),
  ]);
  if (payment.tenantId !== tenantId || payment.subscriptionId !== subscriptionId || subscription.tenantId !== tenantId) {
    throw new WompiBillingError("La referencia de pago no coincide con la licencia", "PAYMENT_TENANT_MISMATCH");
  }
  if (payment.concept !== "SUBSCRIPTION_ANNUAL") throw new WompiBillingError("El pago no corresponde a una anualidad", "ANNUAL_PAYMENT_CONCEPT_INVALID");
  const checkoutProfile: CommercialCheckoutSnapshot = commercial ? {
    commercialStatus: commercial.commercialStatus,
    billingMode: commercial.billingMode,
    postPilotListPriceCents: commercial.postPilotListPriceCents,
    pilotAccessEndsAt: commercial.pilotAccessEndsAt,
  } : null;
  if (!annualCheckoutAllowed(checkoutProfile)) {
    throw new WompiBillingError("La anualidad ya no coincide con el estado comercial del conjunto", "ANNUAL_COMMERCIAL_STATE_CHANGED");
  }
  const terms = resolveAnnualTerms(subscription, checkoutProfile);
  if (payment.amountCents !== terms.effectivePriceCents || payment.listAmountCents !== terms.listPriceCents || payment.discountBps !== terms.discountBps || payment.currency !== terms.currency) {
    throw new WompiBillingError("Los terminos de la anualidad no coinciden con la cotizacion original", "ANNUAL_PAYMENT_TERMS_MISMATCH");
  }
  const paymentClaim = await tx.payment.updateMany({
    where: { id: paymentId, status: "APPROVED", approvedEffectAppliedAt: null, approvedEffectReconciliationRequired: false },
    data: { approvedEffectAppliedAt: now },
  });
  if (paymentClaim.count !== 1) return { effectApplied: false as const, payment };

  const periodStart = isPilotConversion(commercial?.commercialStatus) && commercial?.pilotAccessEndsAt && commercial.pilotAccessEndsAt > now
    ? commercial.pilotAccessEndsAt
    : subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const periodEnd = addCalendarMonths(periodStart, 12);
  const economics = await tx.subscription.updateMany({
    where: {
      id: subscription.id, tenantId: subscription.tenantId, status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart, currentPeriodEnd: subscription.currentPeriodEnd,
      unitsSnapshot: subscription.unitsSnapshot, priceCents: subscription.priceCents, currency: subscription.currency,
      pendingUnitsSnapshot: subscription.pendingUnitsSnapshot, pendingPriceCents: subscription.pendingPriceCents,
      pendingCurrency: subscription.pendingCurrency, pendingPriceEffectiveAt: subscription.pendingPriceEffectiveAt,
    },
    data: {
      status: subscription.status === "CANCELLED" ? "CANCELLED" : "ACTIVE",
      currentPeriodStart: periodStart, currentPeriodEnd: periodEnd,
      priceCents: terms.monthlyListPriceCents, currency: terms.currency,
      pendingUnitsSnapshot: null, pendingPriceCents: null, pendingCurrency: null, pendingPriceEffectiveAt: null,
      graceEndsAt: null, trialEndsAt: null, lastWebhookAt: now,
    },
  });
  if (economics.count !== 1) throw new WompiEconomicConflictError();
  await tx.payment.update({ where: { id: payment.id }, data: { periodStart, periodEnd } });

  if (commercial && isPilotConversion(commercial.commercialStatus)) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('commercial:founder-slots', 0))`;
    let founderNumber = commercial.founderNumber;
    let founderGrantedAt = commercial.founderGrantedAt;
    let isFounderCustomer = commercial.isFounderCustomer;
    if (!isFounderCustomer) {
      const assigned = await tx.tenantCommercialProfile.count({ where: { isFounderCustomer: true } });
      if (assigned < MAX_FOUNDER_CUSTOMERS) {
        isFounderCustomer = true;
        founderNumber = assigned + 1;
        founderGrantedAt = now;
      }
    }
    const founderData = isFounderCustomer ? {
      isFounderCustomer: true, founderNumber, founderGrantedAt,
      priceProtectedUntil: commercial.priceProtectedUntil || addCalendarMonths(founderGrantedAt || now, 12),
      implementationType: "FOUNDER_WAIVED" as const, implementationFeeWaived: true,
      implementationListFeeCents: commercial.implementationListFeeCents || ASSISTED_IMPLEMENTATION_FEE_CENTS,
      implementationEffectiveFeeCents: 0, implementationStatus: "WAIVED" as const,
    } : {};
    const referralStatus = commercial.referralAgreementType === "NONE" ? "NOT_APPLICABLE" : "MANUAL_REVIEW";
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: {
      commercialStatus: "CONVERTED_ANNUAL", billingMode: "ANNUAL", convertedAt: now, contractedPeriodEndsAt: periodEnd,
      postPilotContractPriceCents: commercial.postPilotListPriceCents,
      discountBps: terms.discountBps, discountListPriceCents: terms.listPriceCents, discountEffectivePriceCents: terms.effectivePriceCents,
      discountReason: "Descuento anual del 10 %", discountStartsAt: periodStart, discountEndsAt: periodEnd,
      discountApprovedById: payment.recordedByUserId, commissionStatus: referralStatus,
      nextAction: "Acompanhar adopcion y renovacion", nextActionDueAt: periodEnd, ...founderData,
    } });
    await registerAuditLog({
      actorUserId: payment.recordedByUserId, tenantId, action: AuditAction.PILOT_CONVERTED,
      targetType: "TenantCommercialProfile", targetId: updated.id,
      metadata: { paymentId: payment.id, billingMode: "ANNUAL", provider: WOMPI_PROVIDER, listAmountCents: terms.listPriceCents, effectiveAmountCents: terms.effectivePriceCents, discountBps: terms.discountBps, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), founderNumber: updated.founderNumber },
    }, tx);
  } else if (commercial) {
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: {
      commercialStatus: ["CONVERTED_MONTHLY", "LEGACY_REVIEW"].includes(commercial.commercialStatus) ? "CONVERTED_ANNUAL" : commercial.commercialStatus,
      billingMode: "ANNUAL", convertedAt: commercial.convertedAt || now, contractedPeriodEndsAt: periodEnd,
      postPilotContractPriceCents: commercial.postPilotListPriceCents || terms.monthlyListPriceCents,
      discountBps: terms.discountBps, discountListPriceCents: terms.listPriceCents, discountEffectivePriceCents: terms.effectivePriceCents,
      discountReason: "Descuento anual del 10 %", discountStartsAt: periodStart, discountEndsAt: periodEnd,
      discountApprovedById: payment.recordedByUserId,
      nextAction: "Renovacion anual autogestionada", nextActionDueAt: periodEnd,
    } });
    await registerAuditLog({
      actorUserId: payment.recordedByUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED,
      targetType: "TenantCommercialProfile", targetId: updated.id,
      metadata: { paymentId: payment.id, billingMode: "ANNUAL", provider: WOMPI_PROVIDER, periodEnd: periodEnd.toISOString() },
    }, tx);
  } else {
    const created = await tx.tenantCommercialProfile.create({ data: {
      tenantId, commercialStatus: "CONVERTED_ANNUAL", billingMode: "ANNUAL", convertedAt: now, contractedPeriodEndsAt: periodEnd,
      postPilotListPriceCents: terms.monthlyListPriceCents, postPilotContractPriceCents: terms.monthlyListPriceCents,
      currency: terms.currency, discountBps: terms.discountBps, discountListPriceCents: terms.listPriceCents,
      discountEffectivePriceCents: terms.effectivePriceCents, discountReason: "Descuento anual del 10 %",
      discountStartsAt: periodStart, discountEndsAt: periodEnd, discountApprovedById: payment.recordedByUserId,
      nextAction: "Renovacion anual autogestionada", nextActionDueAt: periodEnd,
    } });
    await registerAuditLog({
      actorUserId: payment.recordedByUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED,
      targetType: "TenantCommercialProfile", targetId: created.id,
      metadata: { paymentId: payment.id, billingMode: "ANNUAL", provider: WOMPI_PROVIDER, profileCreated: true, periodEnd: periodEnd.toISOString() },
    }, tx);
  }
  const accessRestored = subscription.status !== "CANCELLED";
  if (accessRestored) await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE", cancelledAt: null } });
  return {
    effectApplied: true as const,
    payment: await tx.payment.findUniqueOrThrow({ where: { id: paymentId } }),
    periodEnd,
    accessRestored,
    accessPreserved: !accessRestored,
  };
}

async function applyApproved(tx: Tx, paymentId: string, tenantId: string, subscriptionId: string, now: Date) {
  const sourcePayment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, select: { concept: true } });
  if (sourcePayment.concept === "SUBSCRIPTION_ANNUAL") {
    return applyAnnualApproved(tx, paymentId, tenantId, subscriptionId, now);
  }
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
  const terminal = access.status === "CANCELLED";
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
