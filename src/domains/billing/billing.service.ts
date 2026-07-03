import { AuditAction, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

const DEFAULT_TRIAL_DAYS = 15;
const BILLING_PERIOD_DAYS = 30;
const RENEWAL_WINDOW_DAYS = 15;

export async function calculatePriceForUnits(units: number) {
  const normalizedUnits = Math.max(1, units);
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

export async function renewSubscriptionWithSimulatedPayment({
  actorUserId,
  tenantId,
}: {
  actorUserId: string;
  tenantId: string;
}) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { units: true } } },
  });

  if (!subscription) {
    throw new Error("El tenant no tiene suscripción");
  }

  const price = await calculatePriceForUnits(subscription.tenant.units);
  const now = new Date();
  const periodStart = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const periodEnd = addDays(periodStart, BILLING_PERIOD_DAYS);

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "ACTIVE",
      unitsSnapshot: price.units,
      priceCents: price.priceCents,
      currency: price.currency,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      graceEndsAt: null,
      payments: {
        create: {
          tenantId,
          amountCents: price.priceCents,
          currency: price.currency,
          status: "APPROVED",
          provider: "SIMULATED",
          dueDate: now,
          paidAt: now,
          periodStart,
          periodEnd,
          externalReference: `simulated-renewal-${now.toISOString()}`,
        },
      },
    },
  });

  await registerAuditLog({
    actorUserId,
    action: AuditAction.SUBSCRIPTION_RENEWED,
    targetType: "Subscription",
    targetId: updated.id,
    metadata: {
      tenantId,
      units: price.units,
      priceCents: price.priceCents,
      currency: price.currency,
      provider: "SIMULATED",
    },
  });

  return updated;
}

export async function getBillingPlatformOverview() {
  const now = new Date();
  const renewalLimit = addDays(now, RENEWAL_WINDOW_DAYS);

  const [approvedPayments, pendingPayments, upcomingRenewals, activeLicenses] = await Promise.all([
    prisma.payment.aggregate({
      where: {
        status: "APPROVED",
        paidAt: { gte: startOfMonth(now), lt: startOfNextMonth(now) },
      },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.payment.count({ where: { status: "PENDING" } }),
    prisma.subscription.count({
      where: {
        status: { in: ["TRIAL", "ACTIVE", "GRACE_PERIOD"] },
        currentPeriodEnd: { gte: now, lte: renewalLimit },
      },
    }),
    prisma.subscription.count({ where: { status: { in: ["TRIAL", "ACTIVE"] } } }),
  ]);

  return {
    monthlyRevenueCents: approvedPayments._sum.amountCents || 0,
    monthlyApprovedPayments: approvedPayments._count,
    pendingPayments,
    upcomingRenewals,
    activeLicenses,
  };
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
    currentPeriodEnd: subscription.currentPeriodEnd,
    trialEndsAt: subscription.trialEndsAt,
    graceEndsAt: subscription.graceEndsAt,
    priceCents: subscription.priceCents,
    currency: subscription.currency,
    unitsSnapshot: subscription.unitsSnapshot,
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

export function formatMoneyFromCents(amountCents: number, currency = "COP") {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

export function getSubscriptionStatusLabel(status: SubscriptionStatus | PaymentStatus | string) {
  const labels: Record<string, string> = {
    TRIAL: "Trial",
    ACTIVE: "Activa",
    GRACE_PERIOD: "Periodo de gracia",
    SUSPENDED: "Suspendida",
    CANCELLED: "Cancelada",
    PENDING: "Pendiente",
    APPROVED: "Aprobado",
    REJECTED: "Rechazado",
  };

  return labels[status] || status;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function startOfNextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}
