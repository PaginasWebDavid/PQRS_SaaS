import { prisma } from "@/lib/prisma";
import { getPlatformStats } from "./platform-stats.service";
import { listTenantsForSuperAdmin } from "./tenant-admin.service";

export async function getSuperAdminOverview() {
  const [stats, tenants, recentAuditLogs] = await Promise.all([
    getPlatformStats(),
    listTenantsForSuperAdmin(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: {
        actor: { select: { name: true, email: true } },
      },
    }),
  ]);

  return { stats, tenants, recentAuditLogs };
}