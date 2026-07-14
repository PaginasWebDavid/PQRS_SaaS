import { prisma } from "@/lib/prisma";
import { getGeneralSettings } from "@/domains/platform/platform-setting.service";

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function lastNMonths(n: number, now: Date) {
  const months: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({ key: `${start.getFullYear()}-${start.getMonth()}`, label: MONTH_LABELS[start.getMonth()], start, end });
  }
  return months;
}

function daysAgo(date: Date, now: Date) {
  return Math.floor((now.getTime() - date.getTime()) / 86400000);
}

export async function getPlatformAnalytics() {
  const now = new Date();
  const months = lastNMonths(6, now);
  const rangeStart = months[0].start;
  const { pqrsCloseSlaDays } = await getGeneralSettings();
  const slaWarnDays = Math.max(1, Math.round(pqrsCloseSlaDays / 2));

  const [
    payments,
    newTenants,
    closedPqrs,
    closeTimeBucketsRaw,
    openBacklogRaw,
    pqrsByTypeRaw,
    graceTenants,
    topSubscriptions,
    trialEndedSubs,
  ] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "APPROVED", paidAt: { gte: rangeStart } },
      select: { amountCents: true, paidAt: true },
    }),
    prisma.tenant.findMany({
      where: { createdAt: { gte: rangeStart } },
      select: { createdAt: true },
    }),
    prisma.pqrs.findMany({
      where: { estado: "TERMINADO", fechaCierre: { gte: rangeStart }, tiempoRespuestaCierre: { not: null } },
      select: { fechaCierre: true, tiempoRespuestaCierre: true },
    }),
    Promise.all([
      prisma.pqrs.count({ where: { estado: "TERMINADO", tiempoRespuestaCierre: { lt: slaWarnDays } } }),
      prisma.pqrs.count({ where: { estado: "TERMINADO", tiempoRespuestaCierre: { gte: slaWarnDays, lt: pqrsCloseSlaDays } } }),
      prisma.pqrs.count({ where: { estado: "TERMINADO", tiempoRespuestaCierre: { gte: pqrsCloseSlaDays } } }),
    ]),
    Promise.all([
      prisma.pqrs.count({ where: { estado: { in: ["EN_ESPERA", "EN_PROGRESO"] }, fechaRecibido: { lt: new Date(now.getTime() - pqrsCloseSlaDays * 86400000) } } }),
      prisma.pqrs.count({
        where: {
          estado: { in: ["EN_ESPERA", "EN_PROGRESO"] },
          fechaRecibido: { gte: new Date(now.getTime() - pqrsCloseSlaDays * 86400000), lt: new Date(now.getTime() - slaWarnDays * 86400000) },
        },
      }),
      prisma.pqrs.count({ where: { estado: { in: ["EN_ESPERA", "EN_PROGRESO"] }, fechaRecibido: { gte: new Date(now.getTime() - slaWarnDays * 86400000) } } }),
    ]),
    prisma.pqrs.groupBy({ by: ["tipoPqrs"], _count: true }),
    prisma.subscription.findMany({
      where: { status: "GRACE_PERIOD" },
      select: {
        tenantId: true,
        currentPeriodEnd: true,
        tenant: { select: { name: true } },
      },
    }),
    prisma.subscription.findMany({
      where: { status: { in: ["ACTIVE", "GRACE_PERIOD", "TRIAL"] } },
      select: { priceCents: true, currency: true, unitsSnapshot: true, tenant: { select: { name: true } } },
      orderBy: { priceCents: "desc" },
      take: 5,
    }),
    prisma.subscription.findMany({
      where: { trialEndsAt: { lt: now } },
      select: { status: true },
    }),
  ]);

  const mrrTrend = months.map((m) => {
    const sum = payments
      .filter((p) => p.paidAt && p.paidAt >= m.start && p.paidAt < m.end)
      .reduce((acc, p) => acc + p.amountCents, 0);
    return { month: m.label, revenueCents: sum };
  });

  const newTenantsTrend = months.map((m) => ({
    month: m.label,
    count: newTenants.filter((t) => t.createdAt >= m.start && t.createdAt < m.end).length,
  }));

  const closeTimeTrend = months.map((m) => {
    const inMonth = closedPqrs.filter((p) => p.fechaCierre && p.fechaCierre >= m.start && p.fechaCierre < m.end);
    if (inMonth.length === 0) return { month: m.label, avgDays: null as number | null };
    const avgDays = inMonth.reduce((acc, p) => acc + (p.tiempoRespuestaCierre || 0), 0) / inMonth.length;
    return { month: m.label, avgDays: Math.round(avgDays * 10) / 10 };
  });

  const [underWarn, betweenWarnAndSla, overSla] = closeTimeBucketsRaw;
  const closeTimeTotal = underWarn + betweenWarnAndSla + overSla;
  const closeTimeBuckets = [
    { label: `< ${slaWarnDays} días`, count: underWarn },
    { label: `${slaWarnDays}-${pqrsCloseSlaDays} días`, count: betweenWarnAndSla },
    { label: `+${pqrsCloseSlaDays} días`, count: overSla },
  ].map((b) => ({ ...b, percent: closeTimeTotal > 0 ? Math.round((b.count / closeTimeTotal) * 100) : 0 }));

  const [overSlaBacklog, betweenWarnAndSlaBacklog, underWarnBacklog] = openBacklogRaw;
  const backlogAging = [
    { label: `< ${slaWarnDays} días`, count: underWarnBacklog },
    { label: `${slaWarnDays}-${pqrsCloseSlaDays} días`, count: betweenWarnAndSlaBacklog },
    { label: `+${pqrsCloseSlaDays} días`, count: overSlaBacklog },
  ];

  const pqrsByType = pqrsByTypeRaw
    .map((row) => ({ tipo: row.tipoPqrs || "SIN_CLASIFICAR", count: row._count }))
    .sort((a, b) => b.count - a.count);

  const atRiskTenants = graceTenants
    .map((s) => ({
      tenantId: s.tenantId,
      name: s.tenant.name,
      moraDays: daysAgo(s.currentPeriodEnd, now),
    }))
    .sort((a, b) => b.moraDays - a.moraDays)
    .slice(0, 5);

  const topTenantsByRevenue = topSubscriptions.map((s) => ({
    name: s.tenant.name,
    units: s.unitsSnapshot,
    priceCents: s.priceCents,
    currency: s.currency,
  }));

  const convertedTrials = trialEndedSubs.filter((s) => s.status === "ACTIVE" || s.status === "GRACE_PERIOD").length;
  const lostTrials = trialEndedSubs.filter((s) => s.status === "SUSPENDED" || s.status === "CANCELLED").length;
  const trialConversionDenominator = convertedTrials + lostTrials;
  const trialConversionRatePercent = trialConversionDenominator > 0 ? Math.round((convertedTrials / trialConversionDenominator) * 100) : null;

  return {
    mrrTrend,
    newTenantsTrend,
    closeTimeTrend,
    closeTimeBuckets,
    backlogAging,
    pqrsByType,
    atRiskTenants,
    topTenantsByRevenue,
    trialConversion: { converted: convertedTrials, lost: lostTrials, ratePercent: trialConversionRatePercent },
  };
}
