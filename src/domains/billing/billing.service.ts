import { AuditAction, PaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { upsertPlatformSetting } from "@/domains/platform/platform-setting.service";
import { SUBSCRIPTION_STATUS_LABEL } from "@/lib/design/licenseStatus";
import { createNotification, NotificationTypes, type NotificationType } from "@/domains/notifications/notification.service";
import { sendEmailSafe, renderEmailLayout } from "@/lib/email";

export const DEFAULT_TRIAL_DAYS = 15;
const BILLING_PERIOD_DAYS = 30;
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

export async function renewSubscriptionWithSimulatedPayment({
  actorUserId,
  tenantId,
}: {
  actorUserId: string;
  tenantId: string;
}) {
  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { name: true, units: true } } },
  });

  if (!subscription) {
    throw new Error("El tenant no tiene suscripción");
  }

  const price = subscription.pendingPriceCents !== null && subscription.pendingUnitsSnapshot !== null
    ? {
        units: subscription.pendingUnitsSnapshot,
        priceCents: subscription.pendingPriceCents,
        currency: subscription.pendingCurrency || subscription.currency,
      }
    : await calculatePriceForUnits(subscription.tenant.units);
  const now = new Date();
  const periodStart = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const periodEnd = addDays(periodStart, BILLING_PERIOD_DAYS);

  const [updated] = await prisma.$transaction(async (tx) => {
    const renewed = await tx.subscription.update({
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

    await tx.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE", cancelledAt: null },
    });

    return [renewed];
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.SUBSCRIPTION_RENEWED,
    targetType: "Subscription",
    targetId: updated.id,
    metadata: {
      tenantId,
      name: subscription.tenant.name,
      units: price.units,
      priceCents: price.priceCents,
      currency: price.currency,
      provider: "SIMULATED",
    },
  });

  return updated;
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
}: {
  actorUserId: string;
  tenantId: string;
  days: number;
  reason: string;
}) {
  if (!Number.isSafeInteger(days) || days <= 0 || days > 90) {
    throw new Error("Los dias de cortesia deben ser un entero entre 1 y 90");
  }
  if (!reason.trim()) {
    throw new Error("Debes indicar un motivo para la cortesia");
  }

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    include: { tenant: { select: { name: true } } },
  });
  if (!subscription) {
    throw new Error("El tenant no tiene suscripción");
  }

  const now = new Date();
  const periodStart = subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
  const periodEnd = addDays(periodStart, days);

  const [updated] = await prisma.$transaction(async (tx) => {
    const renewed = await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null,
        payments: {
          create: {
            tenantId,
            amountCents: 0,
            currency: subscription.currency,
            status: "APPROVED",
            provider: "SIMULATED",
            dueDate: now,
            paidAt: now,
            periodStart,
            periodEnd,
            externalReference: `courtesy-${now.toISOString()}`,
          },
        },
      },
    });

    await tx.tenant.update({
      where: { id: tenantId },
      data: { status: "ACTIVE", cancelledAt: null },
    });

    return [renewed];
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.SUBSCRIPTION_RENEWED,
    targetType: "Subscription",
    targetId: updated.id,
    metadata: {
      tenantId,
      name: subscription.tenant.name,
      courtesy: true,
      days,
      reason,
    },
  });

  return updated;
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
        paidAt: { gte: thisMonthStart, lt: nextMonthStart },
      },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.payment.aggregate({
      where: {
        status: "APPROVED",
        paidAt: { gte: lastMonthStart, lt: thisMonthStart },
      },
      _sum: { amountCents: true },
    }),
    prisma.payment.aggregate({
      where: { status: "APPROVED" },
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

export async function applyOverdueLicenseRules(actorUserId: string | null) {
  const now = new Date();
  const graceDays = await getGracePeriodDays();

  // Subscriptions whose current period already ended enter grace period.
  const overdue = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      currentPeriodEnd: { lt: now },
    },
    select: { id: true, tenantId: true },
  });

  if (overdue.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: overdue.map((s) => s.id) } },
      data: { status: "GRACE_PERIOD", graceEndsAt: addDays(now, graceDays) },
    });
    await prisma.tenant.updateMany({
      where: { id: { in: overdue.map((s) => s.tenantId) } },
      data: { status: "GRACE_PERIOD" },
    });
    await notifyTenantAdminsOfLicenseChange({
      tenantIds: overdue.map((s) => s.tenantId),
      type: NotificationTypes.LICENSE_EXPIRING,
      title: "Tu licencia entró en período de gracia",
      message: `Tu conjunto tiene ${graceDays} día(s) para regularizar el pago antes de que el servicio se suspenda.`,
      emailHeading: "Tu licencia entró en período de gracia",
      emailBodyHtml: `Detectamos que el pago de tu conjunto no se procesó a tiempo. Tienes <strong>${graceDays} día(s)</strong> para ponerte al día desde Licencias y pagos antes de que el servicio se suspenda.`,
      accent: "warning",
    });
  }

  // Subscriptions whose grace period already ended get suspended.
  const expired = await prisma.subscription.findMany({
    where: {
      status: "GRACE_PERIOD",
      graceEndsAt: { lt: now },
    },
    select: { id: true, tenantId: true },
  });

  if (expired.length > 0) {
    await prisma.subscription.updateMany({
      where: { id: { in: expired.map((s) => s.id) } },
      data: { status: "SUSPENDED" },
    });
    await prisma.tenant.updateMany({
      where: { id: { in: expired.map((s) => s.tenantId) } },
      data: { status: "SUSPENDED" },
    });
    await notifyTenantAdminsOfLicenseChange({
      tenantIds: expired.map((s) => s.tenantId),
      type: NotificationTypes.LICENSE_SUSPENDED,
      title: "Tu licencia fue suspendida",
      message: "El período de gracia terminó sin pago y el servicio quedó suspendido. Paga desde Licencias y pagos para reactivarlo.",
      emailHeading: "Tu licencia fue suspendida",
      emailBodyHtml: "El período de gracia terminó sin que se registrara el pago, así que el servicio de tu conjunto quedó suspendido. Puedes reactivarlo pagando desde Licencias y pagos en cualquier momento.",
      accent: "danger",
    });
  }

  await registerAuditLog({
    actorUserId,
    action: AuditAction.TENANT_OVERDUE_RULES_APPLIED,
    targetType: "Platform",
    metadata: { movedToGracePeriod: overdue.length, movedToSuspended: expired.length },
  });

  return { movedToGracePeriod: overdue.length, movedToSuspended: expired.length };
}

// Avisa a los ADMIN activos de cada conjunto cuando su licencia entra en gracia o se
// suspende. Antes esto pasaba en silencio: el ADMIN solo se enteraba si entraba por su
// cuenta a revisar Licencias y pagos, lo que puede costar clientes por un pago fallido
// que nadie notó a tiempo.
async function notifyTenantAdminsOfLicenseChange({
  tenantIds,
  type,
  title,
  message,
  emailHeading,
  emailBodyHtml,
  accent,
}: {
  tenantIds: string[];
  type: NotificationType;
  title: string;
  message: string;
  emailHeading: string;
  emailBodyHtml: string;
  accent: "warning" | "danger";
}) {
  const adminRows = await prisma.user.findMany({
    where: { tenantId: { in: tenantIds }, role: "ADMIN", isActive: true },
    select: { id: true, email: true, tenantId: true },
  });
  const admins = adminRows.filter((admin): admin is typeof admin & { tenantId: string } => admin.tenantId !== null);

  await Promise.allSettled(
    admins.map((admin) =>
      createNotification({
        tenantId: admin.tenantId,
        userId: admin.id,
        type,
        title,
        message,
      })
    )
  );

  const appUrl = getAppUrl();
  await Promise.allSettled(
    admins.map((admin) =>
      sendEmailSafe({
        to: admin.email,
        subject: title,
        tenantId: admin.tenantId,
        template: "license-status-change",
        html: renderEmailLayout({
          accent,
          eyebrow: "Licencia",
          heading: emailHeading,
          bodyHtml: emailBodyHtml,
          cta: appUrl ? { label: "Ir a Licencias y pagos", url: `${appUrl}/admin/licencias` } : undefined,
        }),
      })
    )
  );
}

function getAppUrl() {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL;
  return appUrl ? appUrl.replace(/\/$/, "") : null;
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
