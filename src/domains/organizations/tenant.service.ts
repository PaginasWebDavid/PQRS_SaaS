import { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertTenantId } from "./tenant.validator";
import { ensureInitialTenant } from "./tenant.repository";
import { INITIAL_TENANT_ID } from "./tenant.constants";

export function getTenantIdFromSession(session: Session): string {
  return assertTenantId(session.user.tenantId);
}

export async function ensureDefaultTenant() {
  return ensureInitialTenant(prisma);
}

export function getInitialTenantId() {
  return INITIAL_TENANT_ID;
}