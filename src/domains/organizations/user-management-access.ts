import type { Session } from "next-auth";
import {
  requireAuthenticatedUser,
  requireSuperAdminTenantTarget,
  requireTenantRole,
} from "@/lib/authorization";
import { managementTenantPolicy } from "@/domains/organizations/user-management-policy";

export async function resolveUserManagementAccess(
  session: Session | null,
  requestedTenantId?: string | null
) {
  const identity = await requireAuthenticatedUser(session);
  const tenantId = managementTenantPolicy({
    role: identity.role,
    ownTenantId: identity.tenantId,
    requestedTenantId,
  });

  if (identity.role === "SUPER_ADMIN") {
    const target = await requireSuperAdminTenantTarget(session, tenantId);
    return {
      actorUserId: target.identity.userId,
      actorRole: target.identity.role,
      tenantId: target.targetTenantId,
    } as const;
  }

  const admin = await requireTenantRole(session, "ADMIN");
  return {
    actorUserId: admin.userId,
    actorRole: admin.role,
    tenantId: admin.tenantId,
  } as const;
}