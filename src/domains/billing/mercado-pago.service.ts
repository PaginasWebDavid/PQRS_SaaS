import crypto from "crypto";
import { AuditAction, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePriceForUnits } from "./billing.service";
import { registerAuditLog } from "@/domains/platform/audit.service";

const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";
const GRACE_PERIOD_DAYS = 5;
const BILLING_PERIOD_DAYS = 30;

type MercadoPagoPreapproval = {
  id: string;
  status?: string;
  init_point?: string;
  sandbox_init_point?: string;
  external_reference?: string;
};

type MercadoPagoAuthorizedPayment = {
  id: string | number;
  preapproval_id?: string;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_created?: string;
  payment?: { id?: string | number };
};

type MercadoPagoPayment = {
  id: string | number;
  status?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_approved?: string;
  date_created?: string;
  external_reference?: string;
};

type WebhookPayload = {
  type?: string;
  topic?: string;
  action?: string;
  data?: { id?: string | number };
  id?: string | number;
};

export async function createMercadoPagoSubscriptionForTenant({
  actorUserId,
  tenantId,
  backUrl,
}: {
  actorUserId: string;
  tenantId: string;
  backUrl?: string;
}) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      subscription: true,
      users: {
        where: { role: "ADMIN" },
        select: { email: true, name: true },
        take: 1,
      },
    },
  });

  if (!tenant?.subscription) {
    throw new Error("El tenant no tiene suscripción local");
  }

  const admin = tenant.users[0];
  if (!admin?.email) {
    throw new Error("El tenant no tiene ADMIN con correo para Mercado Pago");
  }

  const price = tenant.subscription.pendingPriceCents !== null && tenant.subscription.pendingUnitsSnapshot !== null
    ? {
        units: tenant.subscription.pendingUnitsSnapshot,
        priceCents: tenant.subscription.pendingPriceCents,
        currency: tenant.subscription.pendingCurrency || tenant.subscription.currency,
      }
    : await calculatePriceForUnits(tenant.units);
  const appUrl = getAppUrl();
  const notificationUrl = `${appUrl}/api/billing/mercado-pago/webhook`;

  const preapproval = await mercadoPagoRequest<MercadoPagoPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `Licencia PQRS Services - ${tenant.name}`.slice(0, 60),
      external_reference: tenant.subscription.id,
      payer_email: process.env.MERCADO_PAGO_TEST_PAYER_EMAIL?.trim() || admin.email,
      back_url: resolveBackUrl(backUrl || ("/super-admin?tenantId=" + tenant.id), appUrl),
      notification_url: notificationUrl,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: price.priceCents / 100,
        currency_id: price.currency,
      },
    }),
  });

  const updated = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: {
      ...(tenant.subscription.pendingPriceCents === null
        ? { unitsSnapshot: price.units, priceCents: price.priceCents, currency: price.currency }
        : {}),
      autoRenew: true,
      mercadoPagoPreapprovalId: preapproval.id,
      mercadoPagoInitPoint: preapproval.init_point || preapproval.sandbox_init_point || null,
      mercadoPagoStatus: preapproval.status || null,
    },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.MERCADO_PAGO_SUBSCRIPTION_CREATED,
    targetType: "Subscription",
    targetId: updated.id,
    metadata: {
      tenantId,
      mercadoPagoPreapprovalId: preapproval.id,
      mercadoPagoStatus: preapproval.status,
    },
  });

  return updated;
}

export async function processMercadoPagoWebhook({
  payload,
  headers,
  dataIdFromQuery,
}: {
  payload: WebhookPayload;
  headers: Headers;
  dataIdFromQuery?: string | null;
}) {
  const dataId = String(payload.data?.id || payload.id || dataIdFromQuery || "");
  const topic = payload.type || payload.topic || "";

  if (!dataId) {
    return { processed: false, reason: "missing-data-id" };
  }

  validateWebhookSignatureIfConfigured({ headers, dataId });

  if (topic === "subscription_preapproval") {
    const preapproval = await getMercadoPagoPreapproval(dataId);
    const subscription = await updateSubscriptionFromPreapproval(preapproval);
    return { processed: Boolean(subscription), topic, dataId };
  }

  if (topic === "subscription_authorized_payment") {
    const authorizedPayment = await getMercadoPagoAuthorizedPayment(dataId);
    const payment = await registerAuthorizedPayment(authorizedPayment);
    return { processed: Boolean(payment), topic, dataId };
  }

  if (topic === "payment") {
    const payment = await getMercadoPagoPayment(dataId);
    const stored = await registerPayment(payment);
    return { processed: Boolean(stored), topic, dataId };
  }

  return { processed: false, topic, dataId, reason: "unsupported-topic" };
}

export async function disableAutoRenewForTenant({
  actorUserId,
  tenantId,
}: {
  actorUserId: string;
  tenantId: string;
}) {
  const subscription = await prisma.subscription.findUnique({ where: { tenantId } });
  if (!subscription) throw new Error("El tenant no tiene suscripción");

  if (subscription.mercadoPagoPreapprovalId) {
    await mercadoPagoRequest(`/preapproval/${subscription.mercadoPagoPreapprovalId}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    });
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { autoRenew: false },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.SUBSCRIPTION_AUTO_RENEW_DISABLED,
    targetType: "Subscription",
    targetId: updated.id,
    metadata: { tenantId },
  });

  return updated;
}

export async function updateMercadoPagoPreapprovalAmount({
  preapprovalId,
  priceCents,
  currency,
}: {
  preapprovalId: string;
  priceCents: number;
  currency: string;
}) {
  await mercadoPagoRequest(`/preapproval/${preapprovalId}`, {
    method: "PUT",
    body: JSON.stringify({
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: priceCents / 100,
        currency_id: currency,
      },
    }),
  });
}
async function getMercadoPagoPreapproval(id: string) {
  return mercadoPagoRequest<MercadoPagoPreapproval>(`/preapproval/${id}`);
}

async function getMercadoPagoAuthorizedPayment(id: string) {
  return mercadoPagoRequest<MercadoPagoAuthorizedPayment>(`/authorized_payments/${id}`);
}

async function getMercadoPagoPayment(id: string) {
  return mercadoPagoRequest<MercadoPagoPayment>(`/v1/payments/${id}`);
}

async function updateSubscriptionFromPreapproval(preapproval: MercadoPagoPreapproval) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { id: preapproval.external_reference || undefined },
        { mercadoPagoPreapprovalId: preapproval.id },
      ],
    },
  });

  if (!subscription) return null;

  const status = mapPreapprovalStatus(preapproval.status);
  const now = new Date();
  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status,
      mercadoPagoPreapprovalId: preapproval.id,
      mercadoPagoInitPoint: preapproval.init_point || preapproval.sandbox_init_point || subscription.mercadoPagoInitPoint,
      mercadoPagoStatus: preapproval.status || null,
      lastWebhookAt: now,
      graceEndsAt: status === "GRACE_PERIOD" ? addDays(now, GRACE_PERIOD_DAYS) : subscription.graceEndsAt,
    },
  });

  await updateTenantStatusFromSubscription(updated.tenantId, status);
  await auditWebhook(updated.id, updated.tenantId, "subscription_preapproval", preapproval.id, preapproval.status);

  return updated;
}

async function registerAuthorizedPayment(authorizedPayment: MercadoPagoAuthorizedPayment) {
  if (!authorizedPayment.preapproval_id) return null;

  const subscription = await prisma.subscription.findUnique({
    where: { mercadoPagoPreapprovalId: authorizedPayment.preapproval_id },
  });

  if (!subscription) return null;

  return upsertMercadoPagoPayment({
    subscription,
    externalId: String(authorizedPayment.payment?.id || authorizedPayment.id),
    amount: authorizedPayment.transaction_amount,
    currency: authorizedPayment.currency_id,
    rawStatus: authorizedPayment.status,
    date: authorizedPayment.date_created,
    topic: "subscription_authorized_payment",
  });
}

async function registerPayment(payment: MercadoPagoPayment) {
  const subscription = payment.external_reference
    ? await prisma.subscription.findUnique({ where: { id: payment.external_reference } })
    : null;

  if (!subscription) return null;

  return upsertMercadoPagoPayment({
    subscription,
    externalId: String(payment.id),
    amount: payment.transaction_amount,
    currency: payment.currency_id,
    rawStatus: payment.status,
    date: payment.date_approved || payment.date_created,
    topic: "payment",
  });
}

async function upsertMercadoPagoPayment({
  subscription,
  externalId,
  amount,
  currency,
  rawStatus,
  date,
  topic,
}: {
  subscription: { id: string; tenantId: string; currentPeriodEnd: Date; priceCents: number; currency: string; unitsSnapshot: number; pendingUnitsSnapshot: number | null; pendingPriceCents: number | null; pendingCurrency: string | null };
  externalId: string;
  amount?: number;
  currency?: string;
  rawStatus?: string;
  date?: string;
  topic: string;
}) {
  const status = mapPaymentStatus(rawStatus);
  const now = new Date();
  const periodStart = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const periodEnd = addDays(periodStart, BILLING_PERIOD_DAYS);
  const paidAt = status === "APPROVED" ? parseDateOrNow(date) : null;
  const amountCents = Math.round((amount || subscription.priceCents / 100) * 100);

  const payment = await prisma.payment.upsert({
    where: { mercadoPagoPaymentId: externalId },
    update: {
      status,
      rawStatus: rawStatus || null,
      paidAt,
    },
    create: {
      tenantId: subscription.tenantId,
      subscriptionId: subscription.id,
      amountCents,
      currency: currency || subscription.currency,
      status,
      provider: "MERCADO_PAGO",
      dueDate: now,
      paidAt,
      periodStart,
      periodEnd,
      externalReference: externalId,
      mercadoPagoPaymentId: externalId,
      rawStatus: rawStatus || null,
    },
  });

  const nextSubscriptionStatus = paymentStatusToSubscriptionStatus(status);
  const pendingTerms =
    status === "APPROVED" &&
    subscription.pendingUnitsSnapshot !== null &&
    subscription.pendingPriceCents !== null
      ? {
          unitsSnapshot: subscription.pendingUnitsSnapshot,
          priceCents: subscription.pendingPriceCents,
          currency: subscription.pendingCurrency || subscription.currency,
        }
      : null;
  const subscriptionUpdate = status === "APPROVED"
    ? {
        status: nextSubscriptionStatus,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        lastWebhookAt: now,
        ...(pendingTerms
          ? {
              ...pendingTerms,
              pendingUnitsSnapshot: null,
              pendingPriceCents: null,
              pendingCurrency: null,
              pendingPriceEffectiveAt: null,
            }
          : {}),
      }
    : {
        status: nextSubscriptionStatus,
        graceEndsAt: addDays(now, GRACE_PERIOD_DAYS),
        lastWebhookAt: now,
      };

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: subscriptionUpdate,
  });
  await updateTenantStatusFromSubscription(subscription.tenantId, nextSubscriptionStatus);
  await auditWebhook(subscription.id, subscription.tenantId, topic, externalId, rawStatus);

  return payment;
}

async function updateTenantStatusFromSubscription(tenantId: string, status: SubscriptionStatus) {
  if (status === "ACTIVE" || status === "TRIAL") {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
  } else if (status === "GRACE_PERIOD") {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "GRACE_PERIOD" } });
  } else if (status === "SUSPENDED") {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } });
  } else if (status === "CANCELLED") {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: "CANCELLED" } });
  }
}

async function auditWebhook(subscriptionId: string, tenantId: string, topic: string, externalId: string, rawStatus?: string) {
  await registerAuditLog({
    actorUserId: null,
    action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
    targetType: "Subscription",
    targetId: subscriptionId,
    metadata: { tenantId, topic, externalId, rawStatus },
  });
}

async function mercadoPagoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Falta MERCADO_PAGO_ACCESS_TOKEN");
  }

  const response = await fetch(`${MERCADO_PAGO_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Error Mercado Pago ${response.status}: ${detail}`);
  }

  return response.json() as Promise<T>;
}

function validateWebhookSignatureIfConfigured({ headers, dataId }: { headers: Headers; dataId: string }) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) throw new Error("Falta MERCADO_PAGO_WEBHOOK_SECRET para validar el webhook");

  const xSignature = headers.get("x-signature");
  const xRequestId = headers.get("x-request-id");

  if (!xSignature || !xRequestId) {
    throw new Error("Webhook Mercado Pago sin firma");
  }

  const parts = Object.fromEntries(
    xSignature.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key.trim(), value?.trim() || ""];
    })
  );

  const ts = parts.ts;
  const received = parts.v1;
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  if (!received || received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    throw new Error("Firma Mercado Pago inválida");
  }
}

function mapPreapprovalStatus(status?: string): SubscriptionStatus {
  const normalized = status?.toLowerCase();
  if (normalized === "authorized") return "ACTIVE";
  if (normalized === "paused") return "GRACE_PERIOD";
  if (normalized === "cancelled") return "CANCELLED";
  if (normalized === "pending") return "TRIAL";
  return "GRACE_PERIOD";
}

function mapPaymentStatus(status?: string): PaymentStatus {
  const normalized = status?.toLowerCase();
  if (normalized === "approved" || normalized === "authorized") return "APPROVED";
  if (normalized === "rejected" || normalized === "cancelled") return "REJECTED";
  return "PENDING";
}

function paymentStatusToSubscriptionStatus(status: PaymentStatus): SubscriptionStatus {
  if (status === "APPROVED") return "ACTIVE";
  if (status === "REJECTED") return "GRACE_PERIOD";
  return "GRACE_PERIOD";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateOrNow(value?: string) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function resolveBackUrl(value: string, appUrl: string) {
  const base = new URL(appUrl);
  try {
    const resolved = new URL(value, base);
    return resolved.origin === base.origin ? resolved.toString() : new URL('/admin/licencias', base).toString();
  } catch {
    return new URL('/admin/licencias', base).toString();
  }
}
function getAppUrl() {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL;
  if (!appUrl) {
    throw new Error("Falta NEXTAUTH_URL o APP_URL para crear suscripciones Mercado Pago");
  }

  return appUrl.replace(/\/$/, "");
}
