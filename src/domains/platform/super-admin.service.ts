import { prisma } from "@/lib/prisma";
import { getPlatformStats } from "./platform-stats.service";
import { getTenantDetailForSuperAdmin, listTenantsForSuperAdmin } from "./tenant-admin.service";
import { getBillingPlatformOverview, DEFAULT_GRACE_PERIOD_DAYS, getPricingRuleCaps } from "@/domains/billing/billing.service";
import { getIntegrationStatus, getGeneralSettings } from "./platform-setting.service";
import { founderSlotsRemaining, getPilotMetrics, validateCommercialPricingPolicy } from "@/domains/commercial/commercial.service";

export async function getSuperAdminOverview(selectedTenantId?: string | null) {
  const [stats, tenants, selectedTenant, recentAuditLogs, billing, pricingRules, recentPaymentsRaw, integrations, graceDaysSetting, pricingCaps, generalSettings] = await Promise.all([
    getPlatformStats(),
    listTenantsForSuperAdmin(),
    getTenantDetailForSuperAdmin(selectedTenantId),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        actor: { select: { name: true, email: true } },
      },
    }),
    getBillingPlatformOverview(),
    prisma.pricingRule.findMany({ orderBy: [{ type: "asc" }, { minUnits: "asc" }] }),
    prisma.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { tenant: { select: { name: true } } },
    }),
    getIntegrationStatus(),
    prisma.platformSetting.findUnique({ where: { key: "gracePeriodDays" } }),
    getPricingRuleCaps(),
    getGeneralSettings(),
  ]);

  const recentPayments = recentPaymentsRaw.map((p) => ({
    id: p.id,
    tenantName: p.tenant.name,
    amountCents: p.amountCents,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    concept: p.concept,
    listAmountCents: p.listAmountCents,
    discountBps: p.discountBps,
    createdAt: p.createdAt,
  }));

  const graceDays = typeof graceDaysSetting?.value === "number" ? graceDaysSetting.value : DEFAULT_GRACE_PERIOD_DAYS;

  const [commercialMetrics, founderSlots, pricingPolicy] = await Promise.all([
    selectedTenantId ? getPilotMetrics(selectedTenantId) : Promise.resolve(null),
    founderSlotsRemaining(),
    validateCommercialPricingPolicy(),
  ]);

  return { stats, tenants, selectedTenant, commercialMetrics, founderSlotsRemaining: founderSlots, pricingPolicy, recentAuditLogs, billing, pricingRules, recentPayments, integrations, graceDays, pricingCaps, generalSettings };
}
