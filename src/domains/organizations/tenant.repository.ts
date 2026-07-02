import { PrismaClient } from "@prisma/client";
import {
  INITIAL_TENANT_ID,
  INITIAL_TENANT_NAME,
  INITIAL_TENANT_SLUG,
} from "./tenant.constants";

export async function ensureInitialTenant(prisma: PrismaClient) {
  return prisma.tenant.upsert({
    where: { id: INITIAL_TENANT_ID },
    update: {},
    create: {
      id: INITIAL_TENANT_ID,
      name: INITIAL_TENANT_NAME,
      slug: INITIAL_TENANT_SLUG,
      status: "ACTIVE",
    },
  });
}

export async function getTenantById(prisma: PrismaClient, tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
  });
}