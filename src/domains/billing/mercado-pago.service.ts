import crypto from "crypto";
import { AuditAction, BillingOutboxEventType, PaymentStatus, Prisma, SubscriptionStatus, WebhookEventResult } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePriceForUnits, getGracePeriodDays } from "./billing.service";
import { createBillingOutboxIntentsForTransition } from "./billing-outbox.service";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { addDays, BILLING_PERIOD_DAYS, computeNextPeriod } from "./period";
import { buildPaymentEffectKey, sanitizeWebhookMetadata } from "./webhook-metadata";
import { isHistoricalQuarantined } from "./reconciliation";
import {
  ACCESS_PRESERVED_REASON,
  decidePaymentRowTransition,
  decidePreapprovalOutcome,
  decideSubscriptionActionForNonApproved,
  hasCurrentAccessCoverage,
  hasCurrentAppliedAccessEvidence,
  hasCurrentRealPaymentCoverage,
  normalizePreapprovalStatus,
  normalizeProviderPaymentStatus,
  PRECEDENCE_REASON,
  providerStatusLabel,
  truncateProviderStatus,
  type CoverageIdentity,
  type KnownPaymentStatus,
  type PaymentCoverageRow,
} from "./precedence";

const CONCURRENT_SUBSCRIPTION_CHANGE = "CONCURRENT_SUBSCRIPTION_CHANGE";

// Snapshot de acceso. Una accion administrativa que cambie cualquiera de estas
// fronteras gana la carrera y no debe ser reemplazada por el webhook.
type SubscriptionAccessSnapshot = {
  id: string;
  tenantId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
};

// Snapshot economico separado del acceso. No incluye status: una suspension o
// cancelacion administrativa no puede impedir que se registre el periodo pagado.
type SubscriptionEconomicSnapshot = {
  id: string;
  tenantId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  unitsSnapshot: number;
  priceCents: number;
  currency: string;
  pendingUnitsSnapshot: number | null;
  pendingPriceCents: number | null;
  pendingCurrency: string | null;
  pendingPriceEffectiveAt: Date | null;
};

type PersistedSubscriptionSnapshot = {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  graceEndsAt: Date | null;
};

class SubscriptionEconomicConflictError extends Error {
  constructor() {
    super("La suscripcion cambio economicamente durante la aplicacion del pago");
    this.name = "SubscriptionEconomicConflictError";
  }
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function runBillingTransaction<T>(
  work: (tx: TxClient, attempt: number) => Promise<T>,
  options: {
    isolationLevel?: Prisma.TransactionIsolationLevel;
    retryEconomicConflict?: boolean;
    retrySerializationConflict?: boolean;
  } = {}
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction((tx) => work(tx, attempt), {
        ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
      });
    } catch (error) {
      const retryable =
        (options.retryEconomicConflict === true && error instanceof SubscriptionEconomicConflictError) ||
        (options.retrySerializationConflict === true && isSerializationConflict(error));
      if (!retryable || attempt === 1) throw error;
    }
  }
  throw new Error("No se pudo completar la transaccion de facturacion");
}

function persistedSubscriptionMetadata(snapshot: PersistedSubscriptionSnapshot) {
  return {
    persistedSubscriptionStatus: snapshot.status,
    currentPeriodStart: snapshot.currentPeriodStart.toISOString(),
    currentPeriodEnd: snapshot.currentPeriodEnd.toISOString(),
    graceEndsAt: snapshot.graceEndsAt?.toISOString() ?? null,
  };
}

async function readPersistedSubscriptionSnapshot(
  tx: TxClient,
  subscriptionId: string
): Promise<PersistedSubscriptionSnapshot> {
  return tx.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    select: {
      status: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      graceEndsAt: true,
    },
  });
}

// Escritura condicional de acceso: solo aplica `data` si la fila sigue
// exactamente como se leyo. No contiene ningun campo economico en `data`.
async function claimSubscriptionTransition(
  tx: TxClient,
  snapshot: SubscriptionAccessSnapshot,
  data: Prisma.SubscriptionUpdateManyMutationInput
): Promise<boolean> {
  const claimed = await tx.subscription.updateMany({
    where: {
      id: snapshot.id,
      tenantId: snapshot.tenantId,
      status: snapshot.status,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      graceEndsAt: snapshot.graceEndsAt,
      trialEndsAt: snapshot.trialEndsAt,
    },
    data,
  });
  return claimed.count === 1;
}

// Escritura condicional economica: protege periodo, precio, unidades y terminos
// pendientes sin comparar ni modificar el status administrativo.
async function claimSubscriptionEconomicEffect(
  tx: TxClient,
  snapshot: SubscriptionEconomicSnapshot,
  data: Prisma.SubscriptionUpdateManyMutationInput
): Promise<boolean> {
  const claimed = await tx.subscription.updateMany({
    where: {
      id: snapshot.id,
      tenantId: snapshot.tenantId,
      currentPeriodStart: snapshot.currentPeriodStart,
      currentPeriodEnd: snapshot.currentPeriodEnd,
      unitsSnapshot: snapshot.unitsSnapshot,
      priceCents: snapshot.priceCents,
      currency: snapshot.currency,
      pendingUnitsSnapshot: snapshot.pendingUnitsSnapshot,
      pendingPriceCents: snapshot.pendingPriceCents,
      pendingCurrency: snapshot.pendingCurrency,
      pendingPriceEffectiveAt: snapshot.pendingPriceEffectiveAt,
    },
    data,
  });
  return claimed.count === 1;
}
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
  | "BEFORE_WEBHOOK_RESULT"
  // Seams deterministas de concurrencia (F2F). Permiten a una prueba pausar una
  // operacion, ejecutar una transaccion concurrente dentro del propio hook y
  // liberar. Solo se activan bajo NODE_ENV === "test"; nunca en produccion.
  | "AFTER_WEBHOOK_SUBSCRIPTION_READ"
  | "BEFORE_WEBHOOK_SUBSCRIPTION_CAS"
  | "AFTER_APPROVED_ECONOMIC_SNAPSHOT"
  | "AFTER_APPROVED_ECONOMIC_UPDATE"
  | "BEFORE_APPROVED_ACCESS_CAS"
  | "AFTER_PREAPPROVAL_COVERAGE_READ"
  | "BEFORE_PREAPPROVAL_COMMIT"
  | "AFTER_NON_APPROVED_COVERAGE_READ"
  | "AFTER_REACTIVATION_EVIDENCE_READ"
  | "BEFORE_REACTIVATION_AUDIT_LOG";

type BillingTestHooks = { onStep?: (step: BillingTransactionStep) => void | Promise<void> };
let billingTestHooks: BillingTestHooks = {};

/** Uso EXCLUSIVO de pruebas. No invocar desde codigo productivo ni rutas HTTP. */
export function __unsafeSetBillingTestHooks(hooks: BillingTestHooks) {
  billingTestHooks = hooks;
}

async function runBillingStep(step: BillingTransactionStep) {
  // Los seams SOLO se ejecutan en pruebas. En produccion NODE_ENV !== "test" y el
  // hook nunca corre, aunque quedara vacio de todas formas.
  if (process.env.NODE_ENV === "test" && billingTestHooks.onStep) await billingTestHooks.onStep(step);
}

/**
 * Seam de pruebas compartido: permite que otros servicios de facturacion (p. ej.
 * la reactivacion administrativa en tenant-admin) reutilicen los mismos hooks
 * deterministas de concurrencia. Uso EXCLUSIVO de pruebas.
 */
export async function __billingTestSeam(step: BillingTransactionStep) {
  await runBillingStep(step);
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
      memberships: {
        where: { role: "ADMIN", isActive: true },
        select: { user: { select: { email: true, name: true } } },
        take: 1,
      },
    },
  });

  if (!tenant?.subscription) {
    throw new Error("El tenant no tiene suscripción local");
  }

  const admin = tenant.memberships[0]?.user;
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

  const preapprovalStatusSafe = providerStatusLabel(preapproval.status);

  const updated = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: {
      ...(tenant.subscription.pendingPriceCents === null
        ? { unitsSnapshot: price.units, priceCents: price.priceCents, currency: price.currency }
        : {}),
      autoRenew: true,
      mercadoPagoPreapprovalId: preapproval.id,
      mercadoPagoInitPoint,
      mercadoPagoStatus: preapprovalStatusSafe || null,
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
      mercadoPagoStatus: preapprovalStatusSafe || null,
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
  const preapprovalStatusSafe = providerStatusLabel(preapproval.status);

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
      rawStatus: preapprovalStatusSafe || null,
    });
    return null;
  }

  const now = new Date();
  const normalized = normalizePreapprovalStatus(preapproval.status);

  const updated = await runBillingTransaction(
    async (tx, attempt) => {
      const current = await tx.subscription.findUnique({ where: { id: subscription.id } });
      if (!current) {
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.ENTITY_NOT_FOUND,
          rawStatus: preapprovalStatusSafe || null,
        });
        return null;
      }
      await runBillingStep("AFTER_WEBHOOK_SUBSCRIPTION_READ");

      const identity: CoverageIdentity = { tenantId: current.tenantId, subscriptionId: current.id };
      const coverageRows = await loadCoverageRows(tx, current.tenantId, current.id);
      const realPaymentCovered = hasCurrentRealPaymentCoverage(coverageRows, now, identity);
      const accessCovered = hasCurrentAccessCoverage({
        subscriptionStatus: current.status,
        currentPeriodEnd: current.currentPeriodEnd,
        graceEndsAt: current.graceEndsAt,
        trialEndsAt: current.trialEndsAt,
        now,
      });
      const trialValid = current.trialEndsAt !== null && current.trialEndsAt > now;
      const appliedAccessEvidence = hasCurrentAppliedAccessEvidence(coverageRows, now, identity);
      await runBillingStep("AFTER_PREAPPROVAL_COVERAGE_READ");

      const decision = decidePreapprovalOutcome({
        normalized,
        accessCovered,
        realPaymentCovered,
        trialValid,
        currentStatus: current.status,
      });

      const nextStatus = decision.action === "SET" ? decision.nextStatus : current.status;
      const baseMetadata = {
        provider: MERCADO_PAGO_PROVIDER,
        topic: "subscription_preapproval",
        externalId: preapproval.id,
        providerStatus: preapprovalStatusSafe,
        previousSubscriptionStatus: current.status,
        accessCovered,
        realPaymentCovered,
        appliedAccessEvidence,
        previousPaymentStatus: null,
        incomingPaymentStatus: "UNKNOWN",
        persistedPaymentStatus: null,
        paymentExists: coverageRows.length > 0,
        subscriptionId: current.id,
        tenantId: current.tenantId,
        reason: decision.reason,
        effectApplied: false,
      };

      if (decision.action === "IGNORE") {
        const meta = {
          ...baseMetadata,
          ...persistedSubscriptionMetadata(current),
          ignoredReason: decision.reason,
          concurrentAccessChange: attempt > 0,
          serializationRetried: attempt > 0,
        };
        await registerAuditLog(
          {
            actorUserId: null,
            tenantId: current.tenantId,
            action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
            targetType: "Subscription",
            targetId: current.id,
            metadata: meta,
          },
          tx
        );
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.IGNORED,
          tenantId: current.tenantId,
          subscriptionId: current.id,
          rawStatus: preapprovalStatusSafe || null,
          metadata: meta,
        });
        await runBillingStep("BEFORE_PREAPPROVAL_COMMIT");
        return current;
      }

      await runBillingStep("BEFORE_WEBHOOK_SUBSCRIPTION_CAS");
      const claimed = await claimSubscriptionTransition(tx, current, {
        ...(decision.action === "SET" ? { status: nextStatus } : {}),
        mercadoPagoPreapprovalId: preapproval.id,
        mercadoPagoInitPoint:
          preapproval.init_point || preapproval.sandbox_init_point || current.mercadoPagoInitPoint,
        mercadoPagoStatus: preapprovalStatusSafe || null,
        lastWebhookAt: now,
      });

      const persisted = await readPersistedSubscriptionSnapshot(tx, current.id);
      const concurrentChange = !claimed || attempt > 0;
      if (decision.action === "SET" && claimed) {
        await applyTenantStatusInTx(tx, current.tenantId, nextStatus, {
          now,
          trialEndsAt: current.trialEndsAt,
          subscriptionId: current.id,
          ...(nextStatus === "ACTIVE" ? { realPaymentCoverageValidated: true as const } : {}),
        });
      }

      const applied = decision.action === "SET" && claimed;
      const ignoredReason = concurrentChange ? CONCURRENT_SUBSCRIPTION_CHANGE : decision.reason;
      const meta = {
        ...baseMetadata,
        ...persistedSubscriptionMetadata(persisted),
        concurrentAccessChange: concurrentChange,
        serializationRetried: attempt > 0,
        ...(applied ? {} : { ignoredReason }),
      };
      await registerAuditLog(
        {
          actorUserId: null,
          tenantId: current.tenantId,
          action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
          targetType: "Subscription",
          targetId: current.id,
          metadata: meta,
        },
        tx
      );
      await markWebhookResult(tx, eventId, {
        result: applied ? WebhookEventResult.PROCESSED : WebhookEventResult.IGNORED,
        tenantId: current.tenantId,
        subscriptionId: current.id,
        rawStatus: preapprovalStatusSafe || null,
        metadata: meta,
      });
      await runBillingStep("BEFORE_PREAPPROVAL_COMMIT");

      return current;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      retrySerializationConflict: true,
    }
  );

  return updated;
}
// Carga las filas minimas para evaluar cobertura (real, acceso y evidencia
// aplicada) acotadas por identidad exacta tenant + subscription. Los enums de
// Prisma se devuelven como literales string, compatibles con PaymentCoverageRow.
async function loadCoverageRows(
  client: TxClient | typeof prisma,
  tenantId: string,
  subscriptionId: string
): Promise<PaymentCoverageRow[]> {
  return client.payment.findMany({
    where: { tenantId, subscriptionId },
    select: {
      tenantId: true,
      subscriptionId: true,
      provider: true,
      status: true,
      periodEnd: true,
      approvedEffectAppliedAt: true,
      approvedEffectReconciliationRequired: true,
    },
  });
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
  subscription: { id: string; tenantId: string; status: SubscriptionStatus; currentPeriodEnd: Date; trialEndsAt: Date | null; graceEndsAt: Date | null; priceCents: number; currency: string; unitsSnapshot: number; pendingUnitsSnapshot: number | null; pendingPriceCents: number | null; pendingCurrency: string | null };
  externalId: string;
  amount?: number;
  currency?: string;
  // rawStatus proviene de JSON externo: puede no ser string en runtime (F2D-05).
  rawStatus?: unknown;
  date?: string;
  topic: string;
  eventId: string;
}) {
  const now = new Date();
  const normalized = normalizeProviderPaymentStatus(rawStatus);
  const amountCents = Math.round((amount || subscription.priceCents / 100) * 100);
  // Valor SEGURO para persistir en columnas string: recorte + truncado al maximo
  // (F2F-05) si es string no vacio, o null. providerStatusLabel da una etiqueta
  // acotada (incluye truncado) para metadata/ledger.
  const rawStatusForStore =
    typeof rawStatus === "string" && rawStatus.trim() !== "" ? truncateProviderStatus(rawStatus.trim()) : null;
  const providerStatusSafe = providerStatusLabel(rawStatus);

  // Estado desconocido (F2-03): fail-SAFE. No se crea un Payment ambiguo, no se
  // cambia el status ni se limpia paidAt, no se toca Subscription ni Tenant. Solo
  // se refresca rawStatus si el pago ya existe. Ledger IGNORED + auditoria.
  const identity: CoverageIdentity = { tenantId: subscription.tenantId, subscriptionId: subscription.id };

  if (!normalized.known) {
    const existing = await prisma.payment.findUnique({ where: { mercadoPagoPaymentId: externalId } });
    // Cobertura para trazabilidad completa de la decision (F2D-07).
    const coverageRows = await loadCoverageRows(prisma, subscription.tenantId, subscription.id);
    const ignoreMetadata = {
      provider: MERCADO_PAGO_PROVIDER,
      topic,
      externalId,
      ignoredReason: PRECEDENCE_REASON.UNKNOWN_PROVIDER_STATUS,
      // providerStatus acotado: nombre del tipo si no es string, nunca el objeto.
      providerStatus: providerStatusSafe,
      previousPaymentStatus: existing?.status ?? null,
      incomingPaymentStatus: "UNKNOWN",
      persistedPaymentStatus: existing?.status ?? null,
      previousSubscriptionStatus: subscription.status,
      persistedSubscriptionStatus: subscription.status,
      accessCovered: hasCurrentAccessCoverage({
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        graceEndsAt: subscription.graceEndsAt,
        trialEndsAt: subscription.trialEndsAt,
        now,
      }),
      realPaymentCovered: hasCurrentRealPaymentCoverage(coverageRows, now, identity),
      appliedAccessEvidence: hasCurrentAppliedAccessEvidence(coverageRows, now, identity),
      paymentExists: existing !== null,
      subscriptionId: subscription.id,
      tenantId: subscription.tenantId,
      effectApplied: false,
    };
    await prisma.$transaction(async (tx) => {
      if (existing) {
        // Solo refresca rawStatus como metadata no economica (nunca status/paidAt).
        // Se guarda la etiqueta SEGURA (string recortada o nombre del tipo), nunca el objeto.
        await tx.payment.update({ where: { id: existing.id }, data: { rawStatus: providerStatusSafe || null } });
      }
      await runBillingStep("BEFORE_AUDIT_LOG");
      await registerAuditLog(
        {
          actorUserId: null,
          tenantId: subscription.tenantId,
          action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
          targetType: "Subscription",
          targetId: subscription.id,
          metadata: ignoreMetadata,
        },
        tx
      );
      await markWebhookResult(tx, eventId, {
        result: WebhookEventResult.IGNORED,
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        rawStatus: providerStatusSafe || null,
        metadata: ignoreMetadata,
      });
    });
    return existing ?? null;
  }

  const incoming: KnownPaymentStatus = normalized.status;
  const nextSubscriptionStatus = paymentStatusToSubscriptionStatus(incoming);
  // Se resuelve fuera de la transaccion (lectura de PlatformSetting) para no
  // mantener llamadas ajenas abiertas dentro de ella.
  const graceDays = incoming === "APPROVED" ? 0 : await getGracePeriodDays();

  const { payment } = await runBillingTransaction(
    async (tx, attempt) => {
    // 1. PRECEDENCIA DE FILA (F2-08): se lee el estado previo del Payment para que
    // un evento inferior nunca haga retroceder el status ni borre paidAt.
    const existing = await tx.payment.findUnique({ where: { mercadoPagoPaymentId: externalId } });
    const rowDecision = decidePaymentRowTransition({
      incoming,
      current: existing ? { status: existing.status as KnownPaymentStatus, approvedEffectAppliedAt: existing.approvedEffectAppliedAt } : null,
    });
    const persistedStatus = rowDecision.nextPaymentStatus;
    // paidAt es economico: solo se fija/conserva cuando el estado persistido es
    // APPROVED. Nunca se limpia por un evento inferior (persistedStatus == previo).
    const persistedPaidAt = persistedStatus === "APPROVED" ? (existing?.paidAt ?? parseDateOrNow(date)) : null;

    // Fila Payment idempotente por mercadoPagoPaymentId unico. El update escribe el
    // estado ya decidido por precedencia (para PRESERVE coincide con el previo, es
    // un no-op economico); rawStatus se refresca siempre como metadata no economica.
    const payment = await tx.payment.upsert({
      where: { mercadoPagoPaymentId: externalId },
      update: {
        status: persistedStatus,
        rawStatus: rawStatusForStore,
        paidAt: persistedPaidAt,
      },
      create: {
        tenantId: subscription.tenantId,
        subscriptionId: subscription.id,
        amountCents,
        currency: currency || subscription.currency,
        status: persistedStatus,
        provider: "MERCADO_PAGO",
        dueDate: now,
        paidAt: persistedPaidAt,
        periodStart: now,
        periodEnd: now,
        externalReference: externalId,
        mercadoPagoPaymentId: externalId,
        rawStatus: rawStatusForStore,
      },
    });

    await runBillingStep("AFTER_PAYMENT_UPSERT");

    // Gate de notificacion de rechazo: solo la PRIMERA vez que esta fila Payment
    // (identificada por mercadoPagoPaymentId, unico) queda persistida como
    // REJECTED. Un reintento del mismo webhook relee `existing.status` ya en
    // REJECTED y no vuelve a notificar. PENDING nunca dispara este aviso (no es
    // un rechazo definitivo, ver KnownPaymentStatus).
    const isNewlyRejectedPayment =
      incoming === "REJECTED" && persistedStatus === "REJECTED" && existing?.status !== "REJECTED";

    if (incoming === "APPROVED") {
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
              rawStatus: rawStatusForStore,
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
          rawStatus: rawStatusForStore,
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
        const economicSnapshot = await tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
        await runBillingStep("AFTER_WEBHOOK_SUBSCRIPTION_READ");
        await runBillingStep("AFTER_APPROVED_ECONOMIC_SNAPSHOT");
        const next = computeNextPeriod({
          currentPeriodEnd: economicSnapshot.currentPeriodEnd,
          now,
          periodDays: BILLING_PERIOD_DAYS,
          pending: {
            pendingUnitsSnapshot: economicSnapshot.pendingUnitsSnapshot,
            pendingPriceCents: economicSnapshot.pendingPriceCents,
            pendingCurrency: economicSnapshot.pendingCurrency,
            fallbackCurrency: economicSnapshot.currency,
          },
        });

        // Payment y Subscription reciben el mismo periodo dentro de la misma
        // transaccion. Si el CAS economico pierde, todo (incluido el marcador) se
        // revierte y el unico reintento puede recalcular desde el snapshot ganador.
        await tx.payment.update({
          where: { id: payment.id },
          data: { periodStart: next.periodStart, periodEnd: next.periodEnd },
        });
        const economicClaimed = await claimSubscriptionEconomicEffect(tx, economicSnapshot, {
          currentPeriodStart: next.periodStart,
          currentPeriodEnd: next.periodEnd,
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
        });
        if (!economicClaimed) throw new SubscriptionEconomicConflictError();
        await runBillingStep("AFTER_APPROVED_ECONOMIC_UPDATE");
        await runBillingStep("AFTER_SUBSCRIPTION_UPDATE");

        // El acceso se decide DESPUES de confirmar la economia y sobre una relectura
        // actual. Una accion administrativa puede preservar SUSPENDED/CANCELLED sin
        // impedir el periodo ni los terminos ya pagados.
        const accessSnapshot = await tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
        const accessIsTerminal = accessSnapshot.status === "SUSPENDED" || accessSnapshot.status === "CANCELLED";
        let accessClaimed = false;

        if (!accessIsTerminal) {
          await runBillingStep("BEFORE_APPROVED_ACCESS_CAS");
          await runBillingStep("BEFORE_WEBHOOK_SUBSCRIPTION_CAS");
          accessClaimed = await claimSubscriptionTransition(tx, accessSnapshot, {
            status: nextSubscriptionStatus,
            graceEndsAt: null,
            lastWebhookAt: now,
          });
          if (accessClaimed) {
            await applyTenantStatusInTx(tx, subscription.tenantId, nextSubscriptionStatus, {
              now,
              trialEndsAt: accessSnapshot.trialEndsAt,
              subscriptionId: subscription.id,
              realPaymentCoverageValidated: true,
            });
          }
        }

        const persisted = await readPersistedSubscriptionSnapshot(tx, subscription.id);
        const statusChangedDuringEconomicEffect = accessSnapshot.status !== economicSnapshot.status;
        const concurrentChange = statusChangedDuringEconomicEffect || (!accessIsTerminal && !accessClaimed);
        await runBillingStep("AFTER_TENANT_UPDATE");

        const accessStatePreserved = accessIsTerminal || concurrentChange;
        const ignoredAccessReason = concurrentChange
          ? CONCURRENT_SUBSCRIPTION_CHANGE
          : accessIsTerminal
            ? persisted.status === "SUSPENDED"
              ? ACCESS_PRESERVED_REASON.SUSPENDED_REQUIRES_MANUAL_REACTIVATION
              : ACCESS_PRESERVED_REASON.CANCELLED_ACCESS_PRESERVED
            : null;
        const persistedState = persistedSubscriptionMetadata(persisted);

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
              rawStatus: rawStatusForStore,
              effectKey: buildPaymentEffectKey(MERCADO_PAGO_PROVIDER, externalId),
              effectApplied: true,
              paymentEffectApplied: true,
              accessStatePreserved,
              concurrentAccessChange: concurrentChange,
              economicRetry: attempt > 0,
              previousSubscriptionStatus: economicSnapshot.status,
              ...persistedState,
              ignoredAccessReason,
              prevStatus: subscription.status,
              nextStatus: persisted.status,
              prevPeriodEnd: economicSnapshot.currentPeriodEnd.toISOString(),
              nextPeriodEnd: next.periodEnd.toISOString(),
            },
          },
          tx
        );

        // Notificacion de pago aprobado: solo cuando el efecto economico realmente
        // se aplico en ESTE intento (gate `effectApplied`), nunca en el reintento
        // "APPROVED repetido" de mas abajo. boundary = payment.createdAt: estable
        // para el mismo Payment (mismo mercadoPagoPaymentId) a traves de reintentos
        // del webhook, por lo que el dedupeKey del outbox nunca duplica el aviso.
        await createBillingOutboxIntentsForTransition(tx, {
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          eventType: BillingOutboxEventType.SAAS_PAYMENT_APPROVED,
          boundary: payment.createdAt,
          periodEndsAt: next.periodEnd,
        });

        await runBillingStep("BEFORE_WEBHOOK_RESULT");
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.PROCESSED,
          tenantId: subscription.tenantId,
          subscriptionId: subscription.id,
          rawStatus: rawStatusForStore,
          metadata: {
            effectApplied: true,
            accessStatePreserved,
            concurrentAccessChange: concurrentChange,
            economicRetry: attempt > 0,
            ignoredAccessReason,
            nextStatus: persisted.status,
            ...persistedState,
          },
        });      } else {
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
              rawStatus: rawStatusForStore,
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
          rawStatus: rawStatusForStore,
          metadata: { effectApplied: false, duplicate: true },
        });
      }
    } else {
      // No-APPROVED (PENDING/REJECTED): PRECEDENCIA + COBERTURA (F2-01). La Subscription
      // se RELEE dentro de la transaccion (F2F-01) y la decision se calcula sobre esa
      // fila actual. Un evento tardio NO puede quitar acceso vigente ni degradar un
      // estado terminal. Solo inicia GRACE (via CAS) cuando no hay cobertura vigente.
      const current = await tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
      await runBillingStep("AFTER_WEBHOOK_SUBSCRIPTION_READ");
      const currentPaymentIsTerminal =
        existing !== null && (existing.status === "APPROVED" || existing.approvedEffectAppliedAt !== null);
      const accessCovered = hasCurrentAccessCoverage({
        subscriptionStatus: current.status,
        currentPeriodEnd: current.currentPeriodEnd,
        graceEndsAt: current.graceEndsAt,
        trialEndsAt: current.trialEndsAt,
        now,
      });
      const currentIdentity: CoverageIdentity = { tenantId: current.tenantId, subscriptionId: current.id };
      const coverageRows = await loadCoverageRows(tx, current.tenantId, current.id);
      const appliedAccessEvidenceElsewhere = hasCurrentAppliedAccessEvidence(coverageRows, now, currentIdentity);
      const realPaymentCovered = hasCurrentRealPaymentCoverage(coverageRows, now, currentIdentity);
      await runBillingStep("AFTER_NON_APPROVED_COVERAGE_READ");

      const subDecision = decideSubscriptionActionForNonApproved({
        incoming,
        currentSubscriptionStatus: current.status,
        currentPaymentIsTerminal,
        accessCovered,
        appliedAccessEvidenceElsewhere,
      });

      const baseMetadata = {
        provider: MERCADO_PAGO_PROVIDER,
        topic,
        externalId,
        providerStatus: providerStatusSafe,
        previousPaymentStatus: existing?.status ?? null,
        incomingPaymentStatus: incoming,
        persistedPaymentStatus: persistedStatus,
        previousSubscriptionStatus: current.status,
        accessCovered,
        realPaymentCovered,
        appliedAccessEvidence: appliedAccessEvidenceElsewhere,
        effectApplied: false,
        reason: subDecision.reason,
      };

      const graceClaimed =
        subDecision.subscriptionAction === "ENTER_GRACE"
          ? await (async () => {
              await runBillingStep("BEFORE_WEBHOOK_SUBSCRIPTION_CAS");
              return claimSubscriptionTransition(tx, current, {
                status: nextSubscriptionStatus,
                graceEndsAt: addDays(now, graceDays),
                lastWebhookAt: now,
              });
            })()
          : false;
      const persisted = await readPersistedSubscriptionSnapshot(tx, current.id);
      const concurrentChange =
        attempt > 0 || (subDecision.subscriptionAction === "ENTER_GRACE" && !graceClaimed);
      const persistedState = persistedSubscriptionMetadata(persisted);

      if (subDecision.subscriptionAction === "ENTER_GRACE" && graceClaimed) {
        await applyTenantStatusInTx(tx, current.tenantId, nextSubscriptionStatus, {
          now,
          trialEndsAt: current.trialEndsAt,
          subscriptionId: current.id,
        });
        const metadata = {
          ...baseMetadata,
          ...persistedState,
          concurrentAccessChange: concurrentChange,
          serializationRetried: attempt > 0,
        };
        await registerAuditLog(
          {
            actorUserId: null,
            tenantId: current.tenantId,
            action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
            targetType: "Subscription",
            targetId: current.id,
            metadata,
          },
          tx
        );
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.PROCESSED,
          tenantId: current.tenantId,
          subscriptionId: current.id,
          rawStatus: rawStatusForStore,
          metadata,
        });
      } else {
        const ignoredReason = concurrentChange ? CONCURRENT_SUBSCRIPTION_CHANGE : subDecision.reason;
        const metadata = {
          ...baseMetadata,
          ...persistedState,
          concurrentAccessChange: concurrentChange,
          serializationRetried: attempt > 0,
          ignoredReason,
        };
        await registerAuditLog(
          {
            actorUserId: null,
            tenantId: current.tenantId,
            action: AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
            targetType: "Subscription",
            targetId: current.id,
            metadata,
          },
          tx
        );
        await markWebhookResult(tx, eventId, {
          result: WebhookEventResult.IGNORED,
          tenantId: current.tenantId,
          subscriptionId: current.id,
          rawStatus: rawStatusForStore,
          metadata,
        });      }

      // Notificacion de pago rechazado: independiente de si este webhook logro
      // o no mover la suscripcion a GRACE_PERIOD (puede haber cobertura vigente
      // por otro lado). Se dispara una sola vez por Payment (ver
      // isNewlyRejectedPayment), nunca para PENDING.
      if (isNewlyRejectedPayment) {
        await createBillingOutboxIntentsForTransition(tx, {
          tenantId: current.tenantId,
          subscriptionId: current.id,
          eventType: BillingOutboxEventType.SAAS_PAYMENT_REJECTED,
          boundary: payment.createdAt,
        });
      }
    }

    return { payment };
    },
    incoming === "APPROVED"
      ? { retryEconomicConflict: true }
      : {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          retrySerializationConflict: true,
        }
  );

  if (payment.status === PaymentStatus.APPROVED && payment.concept === "SUBSCRIPTION_MONTHLY") {
    await import("@/domains/commercial/commercial.service")
      .then(({ refreshReferralCommission }) => refreshReferralCommission(payment.tenantId))
      .catch(() => undefined);
  }
  return payment;
}

// Sincroniza el estado del Tenant con el de la Subscription DENTRO de la misma
// transaccion. Cada estado tiene una POLITICA SEPARADA (F2D-02): no se tratan
// juntos ACTIVE y TRIAL, y PENDING_PAYMENT se sincroniza explicitamente.
//   - ACTIVE: exige COBERTURA DE PAGO REAL vigente (Mercado Pago, aprobado, efecto
//     aplicado, sin cuarentena, periodo vigente). Si no hay, no toca el Tenant.
//   - TRIAL: no exige pago real; exige ventana de trial valida (trialEndsAt > now).
//   - PENDING_PAYMENT / GRACE_PERIOD / SUSPENDED / CANCELLED: se escriben tal cual.
// El guard de estados terminales vive en las decisiones (preapproval y APPROVED),
// que llaman aqui solo con el estado que corresponde persistir.
async function applyTenantStatusInTx(
  tx: TxClient,
  tenantId: string,
  status: SubscriptionStatus,
  ctx: {
    now: Date;
    trialEndsAt: Date | null;
    subscriptionId: string;
    realPaymentCoverageValidated?: true;
  }
) {
  if (status === "ACTIVE") {
    // ACTIVE solo se sincroniza cuando el caller ya valido cobertura real dentro
    // de la misma transaccion. No se hace una segunda lectura capaz de divergir.
    if (ctx.realPaymentCoverageValidated !== true) {
      throw new Error("No se puede activar Tenant sin cobertura real validada en la transaccion");
    }
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
  } else if (status === "TRIAL") {
    if (!(ctx.trialEndsAt !== null && ctx.trialEndsAt > ctx.now)) return;
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "TRIAL" } });
  } else if (status === "PENDING_PAYMENT") {
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "PENDING_PAYMENT" } });
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
