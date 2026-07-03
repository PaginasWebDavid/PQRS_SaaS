import { prisma } from "@/lib/prisma";
import { getPlatformStats } from "./platform-stats.service";
import { getTenantDetailForSuperAdmin, listTenantsForSuperAdmin } from "./tenant-admin.service";

export async function getSuperAdminOverview(selectedTenantId?: string | null) {
  const [stats, tenants, selectedTenant, recentAuditLogs] = await Promise.all([
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
  ]);

  return { stats, tenants, selectedTenant, recentAuditLogs };
}