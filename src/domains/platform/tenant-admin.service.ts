import { prisma } from "@/lib/prisma";

export async function listTenantsForSuperAdmin() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          users: true,
          pqrs: true,
        },
      },
    },
  });
}