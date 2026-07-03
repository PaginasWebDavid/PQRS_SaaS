import { prisma } from "@/lib/prisma";

export async function getPlatformStats() {
  const [totalTenants, activeTenants, suspendedTenants, totalUsers, totalPqrs, closedPqrs] =
    await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: "ACTIVE" } }),
      prisma.tenant.count({ where: { status: "SUSPENDED" } }),
      prisma.user.count(),
      prisma.pqrs.count(),
      prisma.pqrs.count({ where: { estado: "TERMINADO" } }),
    ]);

  return {
    totalTenants,
    activeTenants,
    suspendedTenants,
    totalUsers,
    totalPqrs,
    closedPqrs,
  };
}