import { randomUUID, timingSafeEqual } from "node:crypto";
import { AuditAction, BillingOutboxEventType, PaymentStatus, Prisma, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { upsertPlatformSetting } from "@/domains/platform/platform-setting.service";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/design/licenseStatus";
import {
  createBillingOutboxIntentsForTransition,
  dispatchBillingOutbox,
  emptyBillingOutboxDispatchSummary,
  type BillingOutboxCreationSummary,
  type BillingOutboxDispatchSummary,
} from "./billing-outbox.service";
import { addDays, BILLING_PERIOD_DAYS, computeNextPeriod } from "./period";
import { decideCronTransition, type CronTransitionKind } from "./cron-decision";

export const DEFAULT_TRIAL_DAYS = 15;
const RENEWAL_WINDOW_DAYS = 15;
export const DEFAULT_GRACE_PERIOD_DAYS = 5;
export const DEFAULT_MIN_PRICING_RULE_CENTS = 50_000 * 100;
export const DEFAULT_MAX_PRICING_RULE_CENTS = 1_000_000 * 100;

export async function getPricingRuleCaps() {
  const [minSetting, maxSetting] = await Promise.all([
    prisma.platformSetting.findUnique({ where: { key: "pricingRuleMinCents" } }),
    prisma.platformSetting.findUnique({ where: { key: "pricingRuleMaxCents" } }),
  ]);
  return {
    minCents: typeof minSetting?.value === "number" ? minSetting.value : DEFAULT_MIN_PRICING_RULE_CENTS,
    maxCents: typeof maxSetting?.value === "number" ? maxSetting.value : DEFAULT_MAX_PRICING_RULE_CENTS,
  };
}

export async function updatePricingRuleCaps(actorUserId: string, input: { minCents: number; maxCents: number }) {
  if (!Number.isSafeInteger(input.minCents) || input.minCents <= 0) {
    throw new Error("El tope mínimo debe ser mayor que cero");
  }
  if (!Number.isSafeInteger(input.maxCents) || input.maxCents <= input.minCents) {
    throw new Error("El tope máximo debe ser mayor que el tope mínimo");
  }

  const activeRules = await prisma.pricingRule.findMany({ where: { isActive: true } });
  const outOfBounds = activeRules.filter((r) => r.priceCents < input.minCents || r.priceCents > input.maxCents);
  if (outOfBounds.length > 0) {
    const example = outOfBounds[0];
    throw new Error(
      `No se puede: ya existe una regla activa (${example.minUnits}+ unidades, ${formatMoneyFromCents(example.priceCents)}) que quedaría fuera de los nuevos topes. Ajusta o desactiva esa regla primero.`
    );
  }

  await Promise.all([
    upsertPlatformSetting({ key: "pricingRuleMinCents", value: input.minCents, updatedById: actorUserId }),
    upsertPlatformSetting({ key: "pricingRuleMaxCents", value: input.maxCents, updatedById: actorUserId }),
  ]);

  return getPricingRuleCaps();
}

export async function calculatePriceForUnits(units: number) {
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new Error("Las unidades deben ser un entero positivo");
  }
  const normalizedUnits = units;
  const rule = await prisma.pricingRule.findFirst({
    where: {
      isActive: true,
      minUnits: { lte: normalizedUnits },
      OR: [{ maxUnits: null }, { maxUnits: { gte: normalizedUnits } }],
    },
    orderBy: { minUnits: "asc" },
  });

  if (!rule) {
    throw new Error(`No hay regla de precio activa para ${normalizedUnits} unidades`);
  }

  return {
    pricingRuleId: rule.id,
    units: normalizedUnits,
    priceCents: rule.priceCents,
    currency: rule.currency,
  };
}

export async function createInitialSubscriptionForTenant({
  actorUserId,
  tenantId,
  units,
}: {
  actorUserId: string;
  tenantId: string;
  units: number;
}) {
  const price = await calculatePriceForUnits(units);
  const now = new Date();
  const periodEnd = addDays(now, BILLING_PERIOD_DAYS);
  const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);

  const subscription = await prisma.subscription.create({
    data: {
      tenantId,
      status: "ACTIVE",
      unitsSnapshot: price.units,
      priceCents: price.priceCents,
      currency: price.currency,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      trialEndsAt,
      payments: {
        create: {
          tenantId,
          amountCents: price.priceCents,
          currency: price.currency,
          status: "APPROVED",
          provider: "SIMULATED",
          dueDate: now,
          paidAt: now,
          periodStart: now,
          periodEnd,
          externalReference: "initial-simulated-payment",
        },
      },
    },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.SUBSCRIPTION_CREATED,
    targetType: "Subscription",
    targetId: subscription.id,
    metadata: {
      tenantId,
      units: price.units,
      priceCents: price.priceCents,
      currency: price.currency,
      pricingRuleId: price.pricingRuleId,
      provider: "SIMULATED",
    },
  });

  return subscription;
}

function resolveBillingOperationId(operationId: string | undefined): string {
  if (operationId === undefined) return randomUUID();
  const normalized = operationId.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) {
    throw new Error("Identificador de operacion invalido");
  }
  return normalized;
}

export async function renewSubscriptionWithSimulatedPayment({
  actorUserId,
  tenantId,
  operationId,
}: {
  actorUserId: string;
  tenantId: string;
  operationId?: string;
}) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { name: true, units: true } } },
  });
  if (!subscription) throw new Error("El tenant no tiene suscripcion");

  const price = subscription.pendingPriceCents !== null && subscription.pendingUnitsSnapshot !== null
    ? {
        units: subscription.pendingUnitsSnapshot,
        priceCents: subscription.pendingPriceCents,
        currency: subscription.pendingCurrency || subscription.currency,
      }
    : await calculatePriceForUnits(subscription.tenant.units);
  const now = new Date();
  const idempotencyKey = resolveBillingOperationId(operationId);
  const externalReference = `simulated-renewal:${tenantId}:${idempotencyKey}`;
  const { periodStart, periodEnd } = computeNextPeriod({
    currentPeriodEnd: subscription.currentPeriodEnd,
    now,
    periodDays: BILLING_PERIOD_DAYS,
  });

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${externalReference}, 0))`;
    const duplicate = await tx.payment.findFirst({ where: { tenantId, externalReference }, select: { id: true } });
    if (duplicate) {
      return { applied: false, updated: await tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } }) };
    }

    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        unitsSnapshot: price.units,
        priceCents: price.priceCents,
        currency: price.currency,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        pendingUnitsSnapshot: null,
        pendingPriceCents: null,
        pendingCurrency: null,
        pendingPriceEffectiveAt: null,
      },
    });
    const payment = await tx.payment.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        amountCents: price.priceCents,
        currency: price.currency,
        status: "APPROVED",
        provider: "SIMULATED",
        dueDate: now,
        paidAt: now,
        periodStart,
        periodEnd,
        externalReference,
      },
    });
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE", cancelledAt: null } });
    await createBillingOutboxIntentsForTransition(tx, {
      tenantId,
      subscriptionId: subscription.id,
      eventType: BillingOutboxEventType.SAAS_PAYMENT_APPROVED,
      boundary: payment.createdAt,
      periodEndsAt: periodEnd,
    });
    return { applied: true, updated };
  });

  if (outcome.applied) {
    await registerAuditLog({
      actorUserId,
      tenantId,
      action: AuditAction.SUBSCRIPTION_RENEWED,
      targetType: "Subscription",
      targetId: outcome.updated.id,
      metadata: {
        tenantId,
        name: subscription.tenant.name,
        units: price.units,
        priceCents: price.priceCents,
        currency: price.currency,
        provider: "SIMULATED",
        operationId: idempotencyKey,
      },
    });
  }
  return outcome.updated;
}
// Le da al Super Admin una forma simple de otorgar una cortesia (extender dias sin
// cobrar) sin tener que fabricar un pago a mano en la base de datos. Util para casos
// puntuales de atencion al cliente: un reclamo justificado, un error de configuracion,
// o simplemente dejar probar mas dias a un conjunto nuevo.
export async function grantCourtesyExtension({
  actorUserId,
  tenantId,
  days,
  reason,
  operationId,
}: {
  actorUserId: string;
  tenantId: string;
  days: number;
  reason: string;
  operationId?: string;
}) {
  if (!Number.isSafeInteger(days) || days <= 0 || days > 90) {
    throw new Error("Los dias de cortesia deben ser un entero entre 1 y 90");
  }
  if (!reason.trim()) throw new Error("Debes indicar un motivo para la cortesia");

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { name: true } } },
  });
  if (!subscription) throw new Error("El tenant no tiene suscripcion");

  const now = new Date();
  const idempotencyKey = resolveBillingOperationId(operationId);
  const externalReference = `courtesy:${tenantId}:${idempotencyKey}`;
  const periodStart = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const periodEnd = addDays(periodStart, days);

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${externalReference}, 0))`;
    const duplicate = await tx.payment.findFirst({ where: { tenantId, externalReference }, select: { id: true } });
    if (duplicate) {
      return { applied: false, updated: await tx.subscription.findUniqueOrThrow({ where: { id: subscription.id } }) };
    }

    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
      },
    });
    const accessGrant = await tx.payment.create({
      data: {
        tenantId,
        subscriptionId: subscription.id,
        amountCents: 0,
        currency: subscription.currency,
        status: "APPROVED",
        provider: "COURTESY",
        dueDate: now,
        paidAt: now,
        periodStart,
        periodEnd,
        externalReference,
      },
    });
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE", cancelledAt: null } });
    await createBillingOutboxIntentsForTransition(tx, {
      tenantId,
      subscriptionId: subscription.id,
      eventType: BillingOutboxEventType.COURTESY_EXTENSION_GRANTED,
      boundary: accessGrant.createdAt,
      periodEndsAt: periodEnd,
    });
    return { applied: true, updated };
  });

  if (outcome.applied) {
    await registerAuditLog({
      actorUserId,
      tenantId,
      action: AuditAction.SUBSCRIPTION_RENEWED,
      targetType: "Subscription",
      targetId: outcome.updated.id,
      metadata: {
        tenantId,
        name: subscription.tenant.name,
        courtesy: true,
        days,
        reason,
        operationId: idempotencyKey,
      },
    });
  }
  return outcome.updated;
}
export async function getBillingPlatformOverview() {
  const now = new Date();
  const renewalLimit = addDays(now, RENEWAL_WINDOW_DAYS);
  const thisMonthStart = startOfMonth(now);
  const nextMonthStart = startOfNextMonth(now);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    approvedPayments,
    lastMonthApprovedPayments,
    totalApprovedPayments,
    pendingPayments,
    upcomingRenewals,
    activeLicenses,
    churnThisMonth,
    avgCloseTime,
  ] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        status: "APPROVED",
        provider: { not: "COURTESY" },
        paidAt: { gte: thisMonthStart, lt: nextMonthStart },
      },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        status: "APPROVED",
        provider: { not: "COURTESY" },
        paidAt: { gte: lastMonthStart, lt: thisMonthStart },
      },
      _sum: { amountCents: true },
    }),
    prisma.payment.aggregate({
      where: { status: "APPROVED", provider: { not: "COURTESY" } },
      _sum: { amountCents: true },
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.subscription.count({
      where: {
        status: { in: ["TRIAL", "ACTIVE", "GRACE_PERIOD"] },
        currentPeriodEnd: { gte: now, lte: renewalLimit },
      },
    }),
    prisma.subscription.count({ where: { status: { in: ["TRIAL", "ACTIVE"] } } }),
    prisma.tenant.count({
      where: { cancelledAt: { gte: thisMonthStart, lt: nextMonthStart } },
    }),
    prisma.pqrs.aggregate({
      where: { estado: "TERMINADO" },
      _avg: { tiempoRespuestaCierre: true },
    }),
  ]);

  const monthlyRevenueCents = approvedPayments._sum.amountCents || 0;
  const lastMonthRevenueCents = lastMonthApprovedPayments._sum.amountCents || 0;
  const mrrGrowthPercent =
    lastMonthRevenueCents > 0
      ? ((monthlyRevenueCents - lastMonthRevenueCents) / lastMonthRevenueCents) * 100
      : null;

  return {
    monthlyRevenueCents,
    totalRevenueCents: totalApprovedPayments._sum.amountCents || 0,
    monthlyApprovedPayments: approvedPayments._count,
    pendingPayments,
    upcomingRenewals,
    activeLicenses,
    mrrGrowthPercent,
    churnThisMonth,
    avgPqrsCloseTimeDays: avgCloseTime._avg.tiempoRespuestaCierre,
  };
}

// Fuente unica del periodo de gracia configurable por el Super Admin. El webhook de
// Mercado Pago (mercado-pago.service.ts) tambien debe leer este mismo valor en vez de
// tener su propia constante, para que ambos caminos apliquen siempre el mismo numero.
export async function getGracePeriodDays(): Promise<number> {
  const graceDaysSetting = await prisma.platformSetting.findUnique({ where: { key: "gracePeriodDays" } });
  return typeof graceDaysSetting?.value === "number" ? graceDaysSetting.value : DEFAULT_GRACE_PERIOD_DAYS;
}

// Limite TOTAL de candidatos accionables. Se reparte entre cuatro buckets
// independientes para que un backlog de ACTIVE, TRIAL o GRACE no prive a las
// otras categorias. Las inconsistencias se consultan aparte y no consumen cupo.
const CRON_BATCH_LIMIT = 500;
const CRON_ACTIONABLE_BUCKETS = 4;
const CRON_INCONSISTENCY_DETAIL_LIMIT = 50;
const CRON_EXTERNAL_ERROR_DETAIL_LIMIT = 50;
const CRON_TENANT_SCOPE_LIMIT = 1_000;
// El outbox agrega consultas atomicas a cada candidato; el timeout por defecto
// de Prisma (5 s) es insuficiente con latencia real de PostgreSQL remoto.
const CRON_CANDIDATE_TRANSACTION_TIMEOUT_MS = 30_000;

export function isCronAuthorizationValid(secret: string | undefined, authHeader: string | null) {
  if (!secret || !authHeader) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Seams de concurrencia del cron, SOLO para pruebas -----------------------
// Mismo patron seguro aprobado en el webhook: solo se ejecutan bajo
// NODE_ENV === "test", no hay entrada HTTP, no controlan produccion. Permiten a
// una prueba (a) inyectar una transaccion concurrente en un punto exacto para
// forzar la perdida del CAS, o (b) lanzar un fallo para probar el rollback
// atomico. `context` identifica el candidato para poder dirigir el hook a una
// sola suscripcion. Las pruebas resetean el hook en `finally` y en `after()`.
export type CronTransactionStep =
  | "AFTER_CRON_CANDIDATE_SELECTED"
  | "AFTER_CRON_SUBSCRIPTION_READ"
  | "BEFORE_CRON_SUBSCRIPTION_CAS"
  | "BEFORE_CRON_TENANT_UPDATE"
  | "BEFORE_CRON_AUDIT_LOG"
  | "AFTER_CRON_EFFECT_RECIPIENTS_READ"
  | "BEFORE_CRON_NOTIFICATION"
  | "BEFORE_CRON_EMAIL";

type CronStepContext = {
  subscriptionId?: string;
  tenantId?: string;
  candidateIds?: string[];
  tenantIds?: string[];
};
type CronTestHooks = { onStep?: (step: CronTransactionStep, context: CronStepContext) => void | Promise<void> };
let cronTestHooks: CronTestHooks = {};

/** Uso EXCLUSIVO de pruebas. No invocar desde codigo productivo ni rutas HTTP. */
export function __unsafeSetCronTestHooks(hooks: CronTestHooks) {
  cronTestHooks = hooks;
}

async function runCronStep(step: CronTransactionStep, context: CronStepContext = {}) {
  // Los seams SOLO corren en pruebas. En produccion NODE_ENV !== "test" y el hook
  // nunca se ejecuta, ademas de quedar vacio por defecto.
  if (process.env.NODE_ENV === "test" && cronTestHooks.onStep) await cronTestHooks.onStep(step, context);
}

type CronCandidate = { id: string; tenantId: string };

type CronCandidateOutcome =
  | { outcome: "APPLIED"; transition: CronTransitionKind; nextStatus: SubscriptionStatus; tenantId: string; subscriptionId: string; outbox: BillingOutboxCreationSummary }
  | { outcome: "PRESERVED"; reason: string }
  | { outcome: "INCONSISTENT"; reason: string; subscriptionId: string; tenantId: string }
  | { outcome: "SKIPPED_CONCURRENT_CHANGE" }
  | { outcome: "SKIPPED_MISSING" };

// Clasifica un error sin filtrar stack, mensajes ni datos sensibles.
function classifyCronError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `PRISMA_${error.code}`;
  if (error instanceof Prisma.PrismaClientValidationError) return "PRISMA_VALIDATION";
  if (error instanceof Error) return error.name || "ERROR";
  return "UNKNOWN";
}

// Procesa UN candidato en su propia transaccion: relee, recalcula la decision,
// reclama la transicion con compare-and-set (updateMany condicional) y, solo si
// gana, sincroniza Tenant y crea la auditoria DENTRO de la misma transaccion.
// Los efectos externos (Notification/email) NO ocurren aqui: se disparan despues
// del commit, solo para las transiciones realmente aplicadas.
async function processCronCandidate(
  candidate: CronCandidate,
  now: Date,
  graceDays: number,
  actorUserId: string | null
): Promise<CronCandidateOutcome> {
  return prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.findFirst({
      where: { id: candidate.id, tenantId: candidate.tenantId },
      select: {
        id: true,
        tenantId: true,
        status: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        graceEndsAt: true,
      },
    });
    if (!sub) return { outcome: "SKIPPED_MISSING" };

    await runCronStep("AFTER_CRON_SUBSCRIPTION_READ", { subscriptionId: sub.id, tenantId: sub.tenantId });

    const decision = decideCronTransition(sub, now);
    if (decision.action === "PRESERVE") return { outcome: "PRESERVED", reason: decision.reason };
    if (decision.action === "INCONSISTENT") {
      return { outcome: "INCONSISTENT", reason: decision.reason, subscriptionId: sub.id, tenantId: sub.tenantId };
    }

    const graceEndsAt = decision.nextStatus === "GRACE_PERIOD" ? addDays(now, graceDays) : null;
    const subData: Prisma.SubscriptionUpdateManyMutationInput =
      decision.nextStatus === "GRACE_PERIOD"
        ? { status: "GRACE_PERIOD", graceEndsAt }
        : { status: "SUSPENDED" };

    await runCronStep("BEFORE_CRON_SUBSCRIPTION_CAS", { subscriptionId: sub.id, tenantId: sub.tenantId });

    // Compare-and-set: compara status y TODAS las fronteras temporales del
    // snapshot recien leido. Cualquier pago, webhook o accion administrativa que
    // haya cambiado la fila hace que `count` sea 0 y el cron ceda la transicion.
    const claimed = await tx.subscription.updateMany({
      where: {
        id: sub.id,
        tenantId: sub.tenantId,
        status: sub.status,
        currentPeriodEnd: sub.currentPeriodEnd,
        trialEndsAt: sub.trialEndsAt,
        graceEndsAt: sub.graceEndsAt,
      },
      data: subData,
    });
    if (claimed.count !== 1) return { outcome: "SKIPPED_CONCURRENT_CHANGE" };

    await runCronStep("BEFORE_CRON_TENANT_UPDATE", { subscriptionId: sub.id, tenantId: sub.tenantId });
    // Tenant y Subscription se confirman juntos: si esto falla, el CAS revierte.
    await tx.tenant.update({
      where: { id: sub.tenantId },
      data: { status: decision.nextStatus === "GRACE_PERIOD" ? "GRACE_PERIOD" : "SUSPENDED" },
    });

    await runCronStep("BEFORE_CRON_AUDIT_LOG", { subscriptionId: sub.id, tenantId: sub.tenantId });
    // Auditoria DENTRO de la misma transaccion (atomicidad): nunca hay transicion
    // sin auditoria ni auditoria de una transicion que no se confirmo. Se conserva
    // el action existente (TENANT_OVERDUE_RULES_APPLIED) con metadata por-tenant
    // compatible con la UI del super-admin (movedToGracePeriod/movedToSuspended).
    await registerAuditLog(
      {
        actorUserId,
        tenantId: sub.tenantId,
        action: AuditAction.TENANT_OVERDUE_RULES_APPLIED,
        targetType: "Subscription",
        targetId: sub.id,
        metadata: {
          transition: decision.transition,
          fromStatus: sub.status,
          toStatus: decision.nextStatus,
          movedToGracePeriod: decision.nextStatus === "GRACE_PERIOD" ? 1 : 0,
          movedToSuspended: decision.nextStatus === "SUSPENDED" ? 1 : 0,
          graceEndsAt: graceEndsAt ? graceEndsAt.toISOString() : null,
          tenantId: sub.tenantId,
        },
      },
      tx
    );

    const eventType = decision.nextStatus === "GRACE_PERIOD"
      ? BillingOutboxEventType.BILLING_GRACE_STARTED
      : BillingOutboxEventType.BILLING_SUSPENDED;
    const boundary = decision.transition === "GRACE_EXPIRED"
      ? sub.graceEndsAt
      : decision.transition === "TRIAL_EXPIRED"
        ? (sub.trialEndsAt ?? sub.currentPeriodEnd)
        : sub.currentPeriodEnd;
    if (!(boundary instanceof Date) || Number.isNaN(boundary.getTime())) {
      throw new Error("CRON_TRANSITION_BOUNDARY_INVALID");
    }
    const outbox = await createBillingOutboxIntentsForTransition(tx, {
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      eventType,
      boundary,
      graceDays: eventType === BillingOutboxEventType.BILLING_GRACE_STARTED ? graceDays : null,
    });

    return {
      outcome: "APPLIED",
      transition: decision.transition,
      nextStatus: decision.nextStatus,
      tenantId: sub.tenantId,
      subscriptionId: sub.id,
      outbox,
    };
  }, {
    timeout: CRON_CANDIDATE_TRANSACTION_TIMEOUT_MS,
  });
}

export interface CronRunOptions {
  tenantIds?: string[];
  /** Solo pruebas: reduce el limite total sin cambiar produccion. */
  batchLimit?: number;
  /** Solo pruebas: reduce los detalles diagnosticos sin cambiar produccion. */
  inconsistencyDetailLimit?: number;
}

type CronActionableCategory =
  | "activeExpired"
  | "trialExpired"
  | "trialFallbackExpired"
  | "graceExpired";

type CronActionableCounts = Record<CronActionableCategory, number>;

type CronExternalEffectError = {
  stage: "RECIPIENT_LOOKUP" | "NOTIFICATION" | "EMAIL";
  tenantId?: string;
  errorCode: string;
};

export interface CronExternalEffectsSummary {
  notificationTenantsAttempted: number;
  notificationAttempts: number;
  notificationSucceeded: number;
  notificationFailed: number;
  emailAttempts: number;
  emailSucceeded: number;
  emailFailed: number;
  errorCount: number;
  errorsTruncated: boolean;
  errors: CronExternalEffectError[];
}

function emptyExternalEffectsSummary(): CronExternalEffectsSummary {
  return {
    notificationTenantsAttempted: 0,
    notificationAttempts: 0,
    notificationSucceeded: 0,
    notificationFailed: 0,
    emailAttempts: 0,
    emailSucceeded: 0,
    emailFailed: 0,
    errorCount: 0,
    errorsTruncated: false,
    errors: [],
  };
}

function externalEffectsFromOutbox(dispatch: BillingOutboxDispatchSummary): CronExternalEffectsSummary {
  const errors = dispatch.errorDetails.slice(0, CRON_EXTERNAL_ERROR_DETAIL_LIMIT).map((detail) => ({
    stage: detail.channel === "IN_APP" ? "NOTIFICATION" as const : "EMAIL" as const,
    errorCode: detail.errorCode,
  }));
  const errorCount = dispatch.errors;
  return {
    notificationTenantsAttempted: dispatch.notificationTenantsAttempted,
    notificationAttempts: dispatch.inAppAttempts,
    notificationSucceeded: dispatch.completedInApp,
    notificationFailed: Math.max(0, dispatch.inAppAttempts - dispatch.completedInApp),
    emailAttempts: dispatch.emailAttempts,
    emailSucceeded: dispatch.completedEmail,
    emailFailed: Math.max(0, dispatch.emailAttempts - dispatch.completedEmail),
    errorCount,
    errorsTruncated: dispatch.errorDetailsTruncated || errorCount > errors.length,
    errors,
  };
}
function normalizeCronTenantIds(tenantIds: string[] | undefined): string[] | undefined {
  if (tenantIds === undefined) return undefined;
  if (!Array.isArray(tenantIds)) throw new TypeError("tenantIds debe ser una lista");

  const normalized = tenantIds.map((tenantId) => {
    if (typeof tenantId !== "string" || !tenantId.trim()) {
      throw new TypeError("tenantIds contiene un identificador invalido");
    }
    return tenantId.trim();
  });
  const unique = Array.from(new Set(normalized));
  if (unique.length > CRON_TENANT_SCOPE_LIMIT) {
    throw new RangeError(`tenantIds excede el limite de ${CRON_TENANT_SCOPE_LIMIT}`);
  }
  return unique;
}

function resolveTestOnlyLimit({
  value,
  fallback,
  minimum,
  maximum,
  label,
}: {
  value: number | undefined;
  fallback: number;
  minimum: number;
  maximum: number;
  label: string;
}): number {
  if (value === undefined) return fallback;
  if (process.env.NODE_ENV !== "test") throw new Error(`${label} solo esta disponible en pruebas`);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} debe estar entre ${minimum} y ${maximum}`);
  }
  return value;
}

function allocateCronBucketLimits(totalLimit: number): Record<CronActionableCategory, number> {
  const categories: CronActionableCategory[] = [
    "graceExpired",
    "activeExpired",
    "trialExpired",
    "trialFallbackExpired",
  ];
  const base = Math.floor(totalLimit / CRON_ACTIONABLE_BUCKETS);
  const remainder = totalLimit % CRON_ACTIONABLE_BUCKETS;
  return Object.fromEntries(
    categories.map((category, index) => [category, base + (index < remainder ? 1 : 0)])
  ) as Record<CronActionableCategory, number>;
}

function interleaveCronCandidateBuckets(
  buckets: Record<CronActionableCategory, CronCandidate[]>
): CronCandidate[] {
  const order: CronActionableCategory[] = [
    "graceExpired",
    "activeExpired",
    "trialExpired",
    "trialFallbackExpired",
  ];
  const maxLength = Math.max(...order.map((category) => buckets[category].length), 0);
  const candidates: CronCandidate[] = [];
  for (let index = 0; index < maxLength; index += 1) {
    for (const category of order) {
      const candidate = buckets[category][index];
      if (candidate) candidates.push(candidate);
    }
  }
  return candidates;
}

async function selectCronWork({
  now,
  scope,
  batchLimit,
  inconsistencyDetailLimit,
}: {
  now: Date;
  scope: Prisma.SubscriptionWhereInput;
  batchLimit: number;
  inconsistencyDetailLimit: number;
}) {
  const limits = allocateCronBucketLimits(batchLimit);
  return prisma.$transaction(
    async (tx) => {
      const [activeExpired, trialExpired, trialFallbackExpired, graceExpired, inconsistentTotal, inconsistentRows] =
        await Promise.all([
          tx.subscription.findMany({
            where: { ...scope, status: "ACTIVE", currentPeriodEnd: { lte: now } },
            select: { id: true, tenantId: true },
            orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
            take: limits.activeExpired,
          }),
          tx.subscription.findMany({
            where: { ...scope, status: "TRIAL", trialEndsAt: { lte: now } },
            select: { id: true, tenantId: true },
            orderBy: [{ trialEndsAt: "asc" }, { id: "asc" }],
            take: limits.trialExpired,
          }),
          tx.subscription.findMany({
            where: { ...scope, status: "TRIAL", trialEndsAt: null, currentPeriodEnd: { lte: now } },
            select: { id: true, tenantId: true },
            orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
            take: limits.trialFallbackExpired,
          }),
          tx.subscription.findMany({
            where: { ...scope, status: "GRACE_PERIOD", graceEndsAt: { lte: now } },
            select: { id: true, tenantId: true },
            orderBy: [{ graceEndsAt: "asc" }, { id: "asc" }],
            take: limits.graceExpired,
          }),
          tx.subscription.count({ where: { ...scope, status: "GRACE_PERIOD", graceEndsAt: null } }),
          tx.subscription.findMany({
            where: { ...scope, status: "GRACE_PERIOD", graceEndsAt: null },
            select: { id: true, tenantId: true },
            orderBy: { id: "asc" },
            take: inconsistencyDetailLimit,
          }),
        ]);

      const buckets = { activeExpired, trialExpired, trialFallbackExpired, graceExpired };
      const actionableByCategory = Object.fromEntries(
        Object.entries(buckets).map(([category, rows]) => [category, rows.length])
      ) as CronActionableCounts;

      return {
        candidates: interleaveCronCandidateBuckets(buckets),
        actionableByCategory,
        inconsistentTotal,
        inconsistentRows,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}

export interface CronOutboxCreationSummary {
  activeRecipients: number;
  planned: number;
  created: number;
  transitionsWithoutRecipients: number;
}
export interface CronRunSummary {
  // Compatibilidad hacia atras: la UI del super-admin y el toast leen estas dos.
  movedToGracePeriod: number;
  movedToSuspended: number;
  // Resumen estructurado del lote.
  examined: number;
  actionableExamined: number;
  actionableBatchLimit: number;
  actionableByCategory: CronActionableCounts;
  preserved: number;
  skippedConcurrentChange: number;
  inconsistencies: number;
  inconsistentGraceWithoutBoundary: number;
  inconsistentDetailsTruncated: boolean;
  errors: number;
  errorDetails: { subscriptionId: string; tenantId: string; errorCode: string }[];
  inconsistentDetails: { subscriptionId: string; tenantId: string; reason: string }[];
  externalEffects: CronExternalEffectsSummary;
  outboxCreation: CronOutboxCreationSummary;
  outboxDispatch: BillingOutboxDispatchSummary;
}

// `options.tenantIds` acota la corrida a un subconjunto de tenants. Produccion lo
// omite (barrido global, comportamiento sin cambios en ambas rutas que lo llaman);
// se normaliza, deduplica y limita antes de construir la consulta. Los limites
// reducidos solo se aceptan bajo NODE_ENV=test.
export async function applyOverdueLicenseRules(
  actorUserId: string | null,
  options: CronRunOptions = {}
): Promise<CronRunSummary> {
  const now = new Date();
  const graceDays = await getGracePeriodDays();
  const tenantIds = normalizeCronTenantIds(options.tenantIds);
  const batchLimit = resolveTestOnlyLimit({
    value: options.batchLimit,
    fallback: CRON_BATCH_LIMIT,
    minimum: CRON_ACTIONABLE_BUCKETS,
    maximum: CRON_BATCH_LIMIT,
    label: "batchLimit",
  });
  const inconsistencyDetailLimit = resolveTestOnlyLimit({
    value: options.inconsistencyDetailLimit,
    fallback: CRON_INCONSISTENCY_DETAIL_LIMIT,
    minimum: 1,
    maximum: CRON_INCONSISTENCY_DETAIL_LIMIT,
    label: "inconsistencyDetailLimit",
  });
  const scope: Prisma.SubscriptionWhereInput =
    tenantIds === undefined ? {} : { tenantId: { in: tenantIds } };

  // Seleccion coherente bajo un snapshot de lectura: cuatro buckets accionables
  // con cupos propios y diagnostico separado de GRACE sin frontera.
  const selection = await selectCronWork({ now, scope, batchLimit, inconsistencyDetailLimit });
  const candidates = selection.candidates;

  await runCronStep("AFTER_CRON_CANDIDATE_SELECTED", { candidateIds: candidates.map((c) => c.id) });

  const summary: CronRunSummary = {
    movedToGracePeriod: 0,
    movedToSuspended: 0,
    examined: candidates.length,
    actionableExamined: candidates.length,
    actionableBatchLimit: batchLimit,
    actionableByCategory: selection.actionableByCategory,
    preserved: 0,
    skippedConcurrentChange: 0,
    inconsistencies: selection.inconsistentTotal,
    inconsistentGraceWithoutBoundary: selection.inconsistentTotal,
    inconsistentDetailsTruncated: selection.inconsistentTotal > selection.inconsistentRows.length,
    errors: 0,
    errorDetails: [],
    inconsistentDetails: selection.inconsistentRows.map((row) => ({
      subscriptionId: row.id,
      tenantId: row.tenantId,
      reason: "GRACE_PERIOD_WITHOUT_BOUNDARY",
    })),
    externalEffects: emptyExternalEffectsSummary(),
    outboxCreation: { activeRecipients: 0, planned: 0, created: 0, transitionsWithoutRecipients: 0 },
    outboxDispatch: emptyBillingOutboxDispatchSummary(),
  };

  // Cada candidato se procesa de forma independiente: un error en uno NO revierte
  // las transiciones ya confirmadas de otros ni aborta el lote.
  for (const candidate of candidates) {
    let result: CronCandidateOutcome | { outcome: "ERROR"; subscriptionId: string; tenantId: string; errorCode: string };
    try {
      result = await processCronCandidate(candidate, now, graceDays, actorUserId);
    } catch (error) {
      result = {
        outcome: "ERROR",
        subscriptionId: candidate.id,
        tenantId: candidate.tenantId,
        errorCode: classifyCronError(error),
      };
    }

    switch (result.outcome) {
      case "APPLIED":
        if (result.nextStatus === "GRACE_PERIOD") summary.movedToGracePeriod += 1;
        else summary.movedToSuspended += 1;
        summary.outboxCreation.activeRecipients += result.outbox.activeRecipients;
        summary.outboxCreation.planned += result.outbox.planned;
        summary.outboxCreation.created += result.outbox.created;
        if (result.outbox.noActiveRecipients) summary.outboxCreation.transitionsWithoutRecipients += 1;
        break;
      case "PRESERVED":
        summary.preserved += 1;
        break;
      case "SKIPPED_CONCURRENT_CHANGE":
      case "SKIPPED_MISSING":
        summary.skippedConcurrentChange += 1;
        break;
      case "INCONSISTENT":
        summary.inconsistencies += 1;
        if (result.reason === "GRACE_PERIOD_WITHOUT_BOUNDARY") {
          summary.inconsistentGraceWithoutBoundary += 1;
        }
        if (summary.inconsistentDetails.length < inconsistencyDetailLimit) {
          summary.inconsistentDetails.push({
            subscriptionId: result.subscriptionId,
            tenantId: result.tenantId,
            reason: result.reason,
          });
        } else {
          summary.inconsistentDetailsTruncated = true;
        }
        break;
      case "ERROR":
        summary.errors += 1;
        summary.errorDetails.push({
          subscriptionId: result.subscriptionId,
          tenantId: result.tenantId,
          errorCode: result.errorCode,
        });
        break;
    }
  }

// El outbox se drena despues de confirmar todas las transiciones. Tambien se
  // procesan intenciones antiguas aunque esta corrida no haya movido licencias.
  try {
    summary.outboxDispatch = await dispatchBillingOutbox(
      tenantIds === undefined ? {} : { tenantIds }
    );
  } catch {
    summary.outboxDispatch = emptyBillingOutboxDispatchSummary();
    summary.outboxDispatch.errors = 1;
    summary.outboxDispatch.errorDetailsTruncated = true;
  }
  summary.externalEffects = externalEffectsFromOutbox(summary.outboxDispatch);

  return summary;
}
export async function getTenantLicenseSummary(tenantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: {
      payments: {
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });

  if (!subscription) return null;

  const nextPayment = subscription.payments.find((payment) => payment.status === "PENDING") || null;

  return {
    status: subscription.status,
    autoRenew: subscription.autoRenew,
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
    graceEndsAt: subscription.graceEndsAt,
    priceCents: subscription.priceCents,
    currency: subscription.currency,
    unitsSnapshot: subscription.unitsSnapshot,
    pendingUnitsSnapshot: subscription.pendingUnitsSnapshot,
    pendingPriceCents: subscription.pendingPriceCents,
    pendingCurrency: subscription.pendingCurrency,
    pendingPriceEffectiveAt: subscription.pendingPriceEffectiveAt,
    nextPaymentDueDate: nextPayment?.dueDate || subscription.currentPeriodEnd,
    recentPayments: subscription.payments.map((payment) => ({
      id: payment.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      provider: payment.provider,
      dueDate: payment.dueDate,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
    })),
  };
}

export function pricingRangesOverlap(
  left: { minUnits: number; maxUnits: number | null },
  right: { minUnits: number; maxUnits: number | null }
) {
  const leftMax = left.maxUnits ?? Number.POSITIVE_INFINITY;
  const rightMax = right.maxUnits ?? Number.POSITIVE_INFINITY;
  return left.minUnits <= rightMax && right.minUnits <= leftMax;
}

async function assertValidPricingRule(
  candidate: { id?: string; minUnits: number; maxUnits: number | null; priceCents: number },
  options: { willBeActive?: boolean } = {}
) {
  if (!Number.isSafeInteger(candidate.minUnits) || candidate.minUnits <= 0) {
    throw new Error("El inicio del rango debe ser un entero positivo");
  }
  if (candidate.maxUnits !== null && (!Number.isSafeInteger(candidate.maxUnits) || candidate.maxUnits <= candidate.minUnits)) {
    throw new Error("El final del rango debe ser un entero mayor que el inicio");
  }
  if (!Number.isSafeInteger(candidate.priceCents) || candidate.priceCents <= 0) {
    throw new Error("El precio debe ser un entero positivo");
  }

  const caps = await getPricingRuleCaps();
  if (candidate.priceCents < caps.minCents || candidate.priceCents > caps.maxCents) {
    throw new Error(`El precio debe estar entre ${formatMoneyFromCents(caps.minCents)} y ${formatMoneyFromCents(caps.maxCents)}`);
  }
  if (options.willBeActive === false) return;

  const otherRules = await prisma.pricingRule.findMany({
    where: candidate.id ? { id: { not: candidate.id }, isActive: true } : { isActive: true },
  });

  for (const other of otherRules) {
    if (pricingRangesOverlap(candidate, other)) {
      throw new Error("El rango se superpone con una regla activa existente");
    }
    if (candidate.minUnits > other.minUnits && candidate.priceCents < other.priceCents) {
      throw new Error(`Un conjunto de mas unidades no puede costar menos que el rango de ${other.minUnits}+ unidades (${formatMoneyFromCents(other.priceCents)})`);
    }
    if (candidate.minUnits < other.minUnits && candidate.priceCents > other.priceCents) {
      throw new Error(`Un conjunto de menos unidades no puede costar mas que el rango de ${other.minUnits}+ unidades (${formatMoneyFromCents(other.priceCents)})`);
    }
  }
}

export async function createPricingRule(
  actorUserId: string,
  input: { minUnits: number; maxUnits: number | null; priceCents: number; currency?: string }
) {
  await assertValidPricingRule({ minUnits: input.minUnits, maxUnits: input.maxUnits, priceCents: input.priceCents });

  const rule = await prisma.pricingRule.create({
    data: {
      minUnits: input.minUnits,
      maxUnits: input.maxUnits,
      priceCents: input.priceCents,
      currency: input.currency || "COP",
    },
  });

  await registerAuditLog({
    actorUserId,
    action: AuditAction.PRICING_RULE_CHANGED,
    targetType: "PricingRule",
    targetId: rule.id,
    metadata: { change: "created", minUnits: rule.minUnits, maxUnits: rule.maxUnits, priceCents: rule.priceCents },
  });

  return rule;
}

export async function updatePricingRule(
  actorUserId: string,
  ruleId: string,
  input: { minUnits?: number; maxUnits?: number | null; priceCents?: number; isActive?: boolean }
) {
  const existing = await prisma.pricingRule.findUniqueOrThrow({ where: { id: ruleId } });

  const data: { minUnits?: number; maxUnits?: number | null; priceCents?: number; isActive?: boolean } = {};
  if (input.minUnits !== undefined) data.minUnits = input.minUnits;
  if (input.maxUnits !== undefined) data.maxUnits = input.maxUnits;
  if (input.priceCents !== undefined) data.priceCents = input.priceCents;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  await assertValidPricingRule({
    id: ruleId,
    minUnits: data.minUnits ?? existing.minUnits,
    maxUnits: data.maxUnits !== undefined ? data.maxUnits : existing.maxUnits,
    priceCents: data.priceCents ?? existing.priceCents,
  }, { willBeActive: data.isActive ?? existing.isActive });

  const rule = await prisma.pricingRule.update({ where: { id: ruleId }, data });

  await registerAuditLog({
    actorUserId,
    action: AuditAction.PRICING_RULE_CHANGED,
    targetType: "PricingRule",
    targetId: rule.id,
    metadata: { change: "updated", ...data },
  });

  return rule;
}

export async function deletePricingRule(actorUserId: string, ruleId: string) {
  const rule = await prisma.pricingRule.delete({ where: { id: ruleId } });

  await registerAuditLog({
    actorUserId,
    action: AuditAction.PRICING_RULE_CHANGED,
    targetType: "PricingRule",
    targetId: ruleId,
    metadata: { change: "deleted", minUnits: rule.minUnits, maxUnits: rule.maxUnits, priceCents: rule.priceCents },
  });

  return { id: ruleId };
}

export function formatMoneyFromCents(amountCents: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

// Usa el mismo mapa que ya se muestra en admin/licencias, para que un mismo estado nunca
// se lea distinto en dos pantallas ("En mora" vs "Periodo de gracia" para GRACE_PERIOD).
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
};

export function getSubscriptionStatusLabel(status: SubscriptionStatus | PaymentStatus | string) {
  return SUBSCRIPTION_STATUS_LABEL[status] || PAYMENT_STATUS_LABEL[status] || status;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}
