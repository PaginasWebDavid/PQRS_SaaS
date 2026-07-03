import { prisma } from "@/lib/prisma";

export async function getPlatformStats() {
  const [totalTenants, activeTenants, suspendedTenants, trialTenants, totalUsers, totalPqrs, closedPqrs] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.tenant.count({ where: { status: "SUSPENDED" } }),
      prisma.tenant.count({ where: { status: "TRIAL" } }),
      prisma.user.count(),
      prisma.pqrs.count(),
      prisma.pqrs.count({ where: { estado: "TERMINADO" } }),
    ]);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    trialTenants,
    totalUsers,
    totalPqrs,
    closedPqrs,
  };
}