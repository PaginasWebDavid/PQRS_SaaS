import crypto from "crypto";
import { AuditAction, PaymentStatus, Prisma, SubscriptionStatus, WebhookEventResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePriceForUnits, getGracePeriodDays } from "./billing.service";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { addDays, BILLING_PERIOD_DAYS, computeNextPeriod } from "./period";
import { buildPaymentEffectKey, sanitizeWebhookMetadata } from "./webhook-metadata";
import { isHistoricalQuarantined } from "./reconciliation";

const MERCADO_PAGO_API_URL = "https://api.mercadopago.com";
const MERCADO_PAGO_PROVIDER = "MERCADO_PAGO";

type TxClient = Prisma.TransactionClient;

// --- Seam de fallos SOLO para pruebas ----------------------------------------
// Permite inyectar un fallo en un punto exacto de la transaccion del pago para
// probar el rollback. El flujo productivo usa una implementacion vacia: las rutas
// HTTP no lo aceptan, no se controla por variables de entorno y no es una API
// publica general. Solo las pruebas lo inyectan via __unsafeSetBillingTestHooks.
export type BillingTransactionStep =
  | "AFTER_PAYMENT_UPSERT"
  | "AFTER_EFFECT_CLAIM"
  | "AFTER_SUBSCRIPTION_UPDATE"
  | "AFTER_TENANT_UPDATE"
  | "BEFORE_AUDIT_LOG"
  | "BEFORE_WEBHOOK_RESULT";

type BillingTestHooks = { onStep?: (step: BillingTransactionStep) => void | Promise<void> };
let billingTestHooks: BillingTestHooks = {};

/** Uso EXCLUSIVO de pruebas. No invocar desde codigo productivo ni rutas HTTP. */
export function __unsafeSetBillingTestHooks(hooks: BillingTestHooks) {
  billingTestHooks = hooks;
}

async function runBillingStep(step: BillingTransactionStep) {
  if (billingTestHooks.onStep) await billingTestHooks.onStep(step);
}

// --- Ledger de entregas de webhook (trazabilidad, NO garantia economica) -----

async function recordWebhookReceived(input: {
  topic: string;
  dataId: string;
  requestId?: string | null;
  rawStatus?: string | null;
}): Promise<string> {
  const event = await prisma.webhookEvent.create({
    data: {
      provider: MERCADO_PAGO_PROVIDER,
      topic: input.topic || "unknown",
      dataId: input.dataId,
      requestId: input.requestId ?? null,
      rawStatus: input.rawStatus ?? null,
      result: WebhookEventResult.RECEIVED,
      metadata: sanitizeWebhookMetadata({ topic: input.topic, dataId: input.dataId }),
    },
  });
  return event.id;
}

async function markWebhookResult(
  client: TxClient | typeof prisma,
  eventId: string,
  input: {
    result: WebhookEventResult;
    tenantId?: string | null;
    subscriptionId?: string | null;
    rawStatus?: string | null;
    errorCode?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await client.webhookEvent.update({
    where: { id: eventId },
    data: {
      result: input.result,
      tenantId: input.tenantId ?? undefined,
      subscriptionId: input.subscriptionId ?? undefined,
      rawStatus: input.rawStatus ?? undefined,
      errorCode: input.errorCode ?? undefined,
      processedAt: new Date(),
      metadata: input.metadata ? sanitizeWebhookMetadata(input.metadata) : undefined,
    },
  });
}

// Mensaje de error seguro (sin cuerpos completos ni secretos) para el ledger.
function safeErrorCode(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 120);
  return "unknown-error";
}

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
  const preapproval = await mercadoPagoRequest<MercadoPagoPreapproval>("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: `Licencia PQRS Services - ${tenant.name}`.slice(0, 60),
      external_reference: tenant.subscription.id,
      // MERCADO_PAGO_TEST_PAYER_EMAIL solo aplica con token de sandbox (TEST-...): un
      // token de produccion (APP_USR-...) tiene que usar el correo real del ADMIN, o
      // Mercado Pago rechaza el preapproval (500 generico) por payer inexistente.
      payer_email: isMercadoPagoTestToken() ? (process.env.MERCADO_PAGO_TEST_PAYER_EMAIL?.trim() || admin.email) : admin.email,
      back_url: resolveBackUrl(backUrl || ("/super-admin?tenantId=" + tenant.id), appUrl),
      status: "pending",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: price.priceCents / 100,
        currency_id: price.currency,
      },
    }),
  });
  const mercadoPagoInitPoint = preapproval.init_point || preapproval.sandbox_init_point;
  if (!preapproval.id || !mercadoPagoInitPoint) {
    throw new Error("Mercado Pago no devolvió una suscripción válida para iniciar el checkout");
  }

  const updated = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: {
      ...(tenant.subscription.pendingPriceCents === null
        ? { unitsSnapshot: price.units, priceCents: price.priceCents, currency: price.currency }
        : {}),
      autoRenew: true,
      mercadoPagoPreapprovalId: preapproval.id,
      mercadoPagoInitPoint,
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
  const requestId = headers.get("x-request-id");

  if (!dataId) {
    // Sin dataId no hay manifiesto verificable: la peticion NO puede autenticarse.
    // No se persiste en el ledger economico (evita ruido/crecimiento no autenticado),
    // no se consulta a Mercado Pago y no se aplica ningun efecto.
    return { processed: false, reason: "missing-data-id" };
  }

  // 1. Autenticidad primero: una firma invalida aborta antes de tocar el ledger.
  validateWebhookSignatureIfConfigured({ headers, dataId });

  // 2. Registrar la recepcion minima del webhook.
  const eventId = await recordWebhookReceived({ topic, dataId, requestId });

  try {
    // 3-5. Consultar a Mercado Pago FUERA de la transaccion; los handlers abren
    // una transaccion corta para aplicar el estado local y marcar el ledger.
    if (topic === "subscription_preapproval") {
      const preapproval = await getMercadoPagoPreapproval(dataId);
      const subscription = await updateSubscriptionFromPreapproval(preapproval, eventId);
      return { processed: Boolean(subscription), topic, dataId };
    }

    if (topic === "subscription_authorized_payment") {
      const authorizedPayment = await getMercadoPagoAuthorizedPayment(dataId);
      const payment = await registerAuthorizedPayment(authorizedPayment, eventId);
      return { processed: Boolean(payment), topic, dataId };
    }

    if (topic === "payment") {
      const payment = await getMercadoPagoPayment(dataId);
      const stored = await registerPayment(payment, eventId);
      return { processed: Boolean(stored), topic, dataId };
    }

    await markWebhookResult(prisma, eventId, { result: WebhookEventResult.UNSUPPORTED_TOPIC });
    return { processed: false, topic, dataId, reason: "unsupported-topic" };
  } catch (error) {
    // 6. Fallo de consulta externa o de la transaccion: se registra de forma segura.
    await markWebhookResult(prisma, eventId, {
      result: WebhookEventResult.FAILED,
      errorCode: safeErrorCode(error),
    }).catch(() => {});
    throw error;
  }
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
      body: JSON.stringify({ status: "canceled" }),
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

async function updateSubscriptionFromPreapproval(preapproval: MercadoPagoPreapproval, eventId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      OR: [
        { id: preapproval.external_reference || undefined },
        { mercadoPagoPreapprovalId: preapproval.id },
      ],
    },
  });

  if (!subscription) {
    await markWebhookResult(prisma, eventId, {
      result: WebhookEventResult.ENTITY_NOT_FOUND,
      rawStatus: preapproval.status ?? null,
    });
    return null;
  }

  const now = new Date();
  let status = mapPreapprovalStatus(preapproval.status);

  if (status === "ACTIVE") {
    // "authorized" en Mercado Pago solo significa que el preapproval (autorizacion de cobro
    // recurrente) fue aceptado por el pagador; NO garantiza que ya se haya efectuado un cobro.
    // No se puede activar el tenant sin al menos un pago APROBADO registrado.
    const approvedPayment = await prisma.payment.findFirst({
      where: { subscriptionId: subscription.id, status: "APPROVED" },
      select: { id: true },
    });
    if (!approvedPayment) {
      status = subscription.trialEndsAt && subscription.trialEndsAt > now ? "TRIAL" : "PENDING_PAYMENT";
    }
  }

  const graceDays = status === "GRACE_PERIOD" ? await getGracePeriodDays() : 0;
  const prevStatus = subscription.status;

  // Transaccion local corta: Subscription + Tenant + AuditLog + ledger coherentes.
  const updated = await prisma.$transaction(async (tx) => {
    const updatedSubscription = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status,
        mercadoPagoPreapprovalId: preapproval.id,
        mercadoPagoInitPoint: preapproval.init_point || preapproval.sandbox_init_point || subscription.mercadoPagoInitPoint,
        mercadoPagoStatus: preapproval.status || null,
        lastWebhookAt: now,
        graceEndsAt: status === "GRACE_PERIOD" ? addDays(now, graceDays) : subscription.graceEndsAt,
      },
    });

    await applyTenantStatusInTx(tx, updatedSubscription.tenantId, status);

    await registerAuditLog(
      {
        actorUserId: null,
        tenantId: updatedSubscription.tenantId,
        action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
        targetType: "Subscription",
        targetId: updatedSubscription.id,
        metadata: {
          provider: MERCADO_PAGO_PROVIDER,
          topic: "subscription_preapproval",
          externalId: preapproval.id,
          rawStatus: preapproval.status ?? null,
          prevStatus,
          nextStatus: status,
          effectApplied: false,
        },
      },
      tx
    );

    await markWebhookResult(tx, eventId, {
      result: WebhookEventResult.PROCESSED,
      tenantId: updatedSubscription.tenantId,
      subscriptionId: updatedSubscription.id,
      rawStatus: preapproval.status ?? null,
      metadata: { prevStatus, nextStatus: status },
    });

    return updatedSubscription;
  });

  return updated;
}

async function registerAuthorizedPayment(authorizedPayment: MercadoPagoAuthorizedPayment, eventId: string) {
  if (!authorizedPayment.preapproval_id) {
    await markWebhookResult(prisma, eventId, { result: WebhookEventResult.ENTITY_NOT_FOUND, errorCode: "missing-preapproval-id" });
    return null;
  }

  const subscription = await prisma.subscription.findUnique({
    where: { mercadoPagoPreapprovalId: authorizedPayment.preapproval_id },
  });

  if (!subscription) {
    await markWebhookResult(prisma, eventId, { result: WebhookEventResult.ENTITY_NOT_FOUND });
    return null;
  }

  return upsertMercadoPagoPayment({
    subscription,
    externalId: String(authorizedPayment.payment?.id || authorizedPayment.id),
    amount: authorizedPayment.transaction_amount,
    currency: authorizedPayment.currency_id,
    rawStatus: authorizedPayment.status,
    date: authorizedPayment.date_created,
    topic: "subscription_authorized_payment",
    eventId,
  });
}

async function registerPayment(payment: MercadoPagoPayment, eventId: string) {
  const subscription = payment.external_reference
    ? await prisma.subscription.findUnique({ where: { id: payment.external_reference } })
    : null;

  if (!subscription) {
    await markWebhookResult(prisma, eventId, { result: WebhookEventResult.ENTITY_NOT_FOUND });
    return null;
  }

  return upsertMercadoPagoPayment({
    subscription,
    externalId: String(payment.id),
    amount: payment.transaction_amount,
    currency: payment.currency_id,
    rawStatus: payment.status,
    date: payment.date_approved || payment.date_created,
    topic: "payment",
    eventId,
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
  eventId,
}: {
  subscription: { id: string; tenantId: string; status: SubscriptionStatus; currentPeriodEnd: Date; priceCents: number; currency: string; unitsSnapshot: number; pendingUnitsSnapshot: number | null; pendingPriceCents: number | null; pendingCurrency: string | null };
  externalId: string;
  amount?: number;
  currency?: string;
  rawStatus?: string;
  date?: string;
  topic: string;
  eventId: string;
}) {
  const status = mapPaymentStatus(rawStatus);
  const now = new Date();
  const paidAt = status === "APPROVED" ? parseDateOrNow(date) : null;
  const amountCents = Math.round((amount || subscription.priceCents / 100) * 100);
  const nextSubscriptionStatus = paymentStatusToSubscriptionStatus(status);
  // Se resuelve fuera de la transaccion (lectura de PlatformSetting) para no
  // mantener llamadas ajenas abiertas dentro de ella.
  const graceDays = status === "APPROVED" ? 0 : await getGracePeriodDays();

  const { payment } = await prisma.$transaction(async (tx) => {
    // 1. Fila Payment idempotente por mercadoPagoPaymentId unico.
    const payment = await tx.payment.upsert({
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
        periodStart: now,
        periodEnd: now,
        externalReference: externalId,
        mercadoPagoPaymentId: externalId,
        rawStatus: rawStatus || null,
      },
    });

    await runBillingStep("AFTER_PAYMENT_UPSERT");

    if (status === "APPROVED") {
      // CUARENTENA: un pago historico (previo a la migracion de idempotencia) tiene
      // approvedEffectReconciliationRequired=true. NUNCA se reclama su efecto (no puede
      // extender por replay historico). Se registra como RECONCILIATION_REQUIRED, que es
      // DISTINTO de DUPLICATE (aun no se ha afirmado que el efecto este reconciliado).
      if (isHistoricalQuarantined(payment)) {
        await registerAuditLog(
          {
            actorUserId: null,
            tenantId: subscription.tenantId,
            action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
            targetType: "Subscription",
            targetId: subscription.id,
            metadata: {
              provider: MERCADO_PAGO_PROVIDER,
              topic,
              externalId,
              rawStatus: rawStatus ?? null,
              effectKey: buildPaymentEffectKey(MERCADO_PAGO_PROVIDER, externalId),
              effectApplied: false,
              reconciliationRequired: true,
            },
          },
          tx
        );
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.RECONCILIATION_REQUIRED,
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          rawStatus: rawStatus ?? null,
          metadata: { effectApplied: false, reconciliationRequired: true },
        });
        return { payment };
      }

      // 2. RECLAMO ATOMICO del efecto economico: solo un procesamiento gana el update
      // condicional (status APPROVED, sin efecto previo Y sin cuarentena). Un APPROVED
      // repetido (o concurrente) obtiene count === 0 y NO vuelve a extender.
      const claim = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: "APPROVED",
          approvedEffectAppliedAt: null,
          approvedEffectReconciliationRequired: false,
        },
        data: { approvedEffectAppliedAt: now },
      });
      await runBillingStep("AFTER_EFFECT_CLAIM");
      const effectApplied = claim.count === 1;

      if (effectApplied) {
        // 3-5. Primera aplicacion: calcular periodo (fuente unica), aplicar terminos
        // pendientes, actualizar Subscription y Tenant.
        const current = await tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
        const next = computeNextPeriod({
          currentPeriodEnd: current.currentPeriodEnd,
          now,
          periodDays: BILLING_PERIOD_DAYS,
          pending: {
            pendingUnitsSnapshot: current.pendingUnitsSnapshot,
            pendingPriceCents: current.pendingPriceCents,
            pendingCurrency: current.pendingCurrency,
            fallbackCurrency: current.currency,
          },
        });

        await tx.subscription.update({
          where: { id: current.id },
          data: {
            status: nextSubscriptionStatus,
            currentPeriodStart: next.periodStart,
            currentPeriodEnd: next.periodEnd,
            graceEndsAt: null,
            lastWebhookAt: now,
            ...(next.effectiveTerms
              ? {
                  unitsSnapshot: next.effectiveTerms.unitsSnapshot,
                  priceCents: next.effectiveTerms.priceCents,
                  currency: next.effectiveTerms.currency,
                }
              : {}),
            ...(next.clearPending
              ? {
                  pendingUnitsSnapshot: null,
                  pendingPriceCents: null,
                  pendingCurrency: null,
                  pendingPriceEffectiveAt: null,
                }
              : {}),
          },
        });
        await runBillingStep("AFTER_SUBSCRIPTION_UPDATE");
        await tx.payment.update({
          where: { id: payment.id },
          data: { periodStart: next.periodStart, periodEnd: next.periodEnd },
        });
        await applyTenantStatusInTx(tx, subscription.tenantId, nextSubscriptionStatus);
        await runBillingStep("AFTER_TENANT_UPDATE");

        await runBillingStep("BEFORE_AUDIT_LOG");
        await registerAuditLog(
          {
            actorUserId: null,
            tenantId: subscription.tenantId,
            action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
            targetType: "Subscription",
            targetId: subscription.id,
            metadata: {
              provider: MERCADO_PAGO_PROVIDER,
              topic,
              externalId,
              rawStatus: rawStatus ?? null,
              effectKey: buildPaymentEffectKey(MERCADO_PAGO_PROVIDER, externalId),
              effectApplied: true,
              prevStatus: subscription.status,
              nextStatus: nextSubscriptionStatus,
              prevPeriodEnd: current.currentPeriodEnd.toISOString(),
              nextPeriodEnd: next.periodEnd.toISOString(),
            },
          },
          tx
        );

        await runBillingStep("BEFORE_WEBHOOK_RESULT");
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.PROCESSED,
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          rawStatus: rawStatus ?? null,
          metadata: { effectApplied: true, nextStatus: nextSubscriptionStatus },
        });
      } else {
        // APPROVED repetido: el efecto ya fue aplicado. No se toca el periodo ni
        // los terminos pendientes; solo se registra como duplicado.
        await registerAuditLog(
          {
            actorUserId: null,
            tenantId: subscription.tenantId,
            action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
            targetType: "Subscription",
            targetId: subscription.id,
            metadata: {
              provider: MERCADO_PAGO_PROVIDER,
              topic,
              externalId,
              rawStatus: rawStatus ?? null,
              effectKey: buildPaymentEffectKey(MERCADO_PAGO_PROVIDER, externalId),
              effectApplied: false,
              duplicate: true,
            },
          },
          tx
        );
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.DUPLICATE,
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          rawStatus: rawStatus ?? null,
          metadata: { effectApplied: false, duplicate: true },
        });
      }
    } else {
      // No-APPROVED (PENDING/REJECTED): se conserva el comportamiento actual
      // (mover a GRACE_PERIOD) pero ahora dentro de la transaccion. La precedencia
      // de eventos fuera de orden queda para una subfase posterior (fuera de alcance).
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: nextSubscriptionStatus,
          graceEndsAt: addDays(now, graceDays),
          lastWebhookAt: now,
        },
      });
      await applyTenantStatusInTx(tx, subscription.tenantId, nextSubscriptionStatus);

      await registerAuditLog(
        {
          actorUserId: null,
          tenantId: subscription.tenantId,
          action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
          targetType: "Subscription",
          targetId: subscription.id,
          metadata: {
            provider: MERCADO_PAGO_PROVIDER,
            topic,
            externalId,
            rawStatus: rawStatus ?? null,
            effectApplied: false,
            prevStatus: subscription.status,
            nextStatus: nextSubscriptionStatus,
          },
        },
        tx
      );
      await markWebhookResult(tx, eventId, {
        result: WebhookEventResult.PROCESSED,
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        rawStatus: rawStatus ?? null,
        metadata: { effectApplied: false, nextStatus: nextSubscriptionStatus },
      });
    }

    return { payment };
  });

  return payment;
}

// Version tx-aware de la sincronizacion de estado del Tenant. Mantiene la regla de
// no marcar ACTIVE sin un pago APROBADO existente.
async function applyTenantStatusInTx(tx: TxClient, tenantId: string, status: SubscriptionStatus) {
  if (status === "ACTIVE" || status === "TRIAL") {
    const approvedPayment = await tx.payment.findFirst({
      where: { tenantId, status: "APPROVED" },
      select: { id: true },
    });
    if (!approvedPayment) return;
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
  } else if (status === "GRACE_PERIOD") {
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "GRACE_PERIOD" } });
  } else if (status === "SUSPENDED") {
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "SUSPENDED" } });
  } else if (status === "CANCELLED") {
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "CANCELLED" } });
  }
}

function isMercadoPagoTestToken() {
  return (process.env.MERCADO_PAGO_ACCESS_TOKEN || "").startsWith("TEST-");
}

async function mercadoPagoRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Falta MERCADO_PAGO_ACCESS_TOKEN");
  }
  const isTestEnvironment = isMercadoPagoTestToken();

  const response = await fetch(`${MERCADO_PAGO_API_URL}${path}`, {
    ...init,
    headers: {
      ...(isTestEnvironment ? { "X-scope": "stage" } : {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    const requestId = response.headers.get("x-request-id");
    const suffix = requestId ? ` (request-id: ${requestId})` : "";
    throw new Error(`Error Mercado Pago ${response.status}: ${detail}${suffix}`);
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
  if (normalized === "cancelled" || normalized === "canceled") return "CANCELLED";
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
