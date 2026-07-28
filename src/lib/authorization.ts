import { prisma } from "@/lib/prisma";
import { resolveSelectedMembership } from "@/lib/tenant-selection";
import { createAuthorizationService, type AuthorizationRepository } from "@/lib/authorization-core";

const authorizationRepository: AuthorizationRepository = {
  async findUserById(userId, preferredTenantId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        memberships: {
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: {
            id: true, tenantId: true, role: true, isActive: true,
            tenant: { select: { id: true, status: true, subscription: { select: { status: true } } } },
          },
        },
      },
    });
    if (!user) return null;
    const eligible = user.role === "SUPER_ADMIN" ? [] : user.memberships
      .filter((membership) => membership.role !== "SUPER_ADMIN")
      .map((membership) => ({
        id: membership.id,
        tenantId: membership.tenantId,
        tenantName: membership.tenant.id,
        role: membership.role as "ADMIN" | "CONSEJO" | "RESIDENTE",
        isActive: membership.isActive,
        tenant: {
          id: membership.tenant.id,
          status: membership.tenant.status,
          subscriptionStatus: membership.tenant.subscription?.status ?? null,
        },
      }));
    return {
      id: user.id,
      globalRole: user.role,
      isActive: user.isActive,
      membership: resolveSelectedMembership(eligible, preferredTenantId),
    };
  },
  async findTenantById(tenantId) {
    return prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, status: true } });
  },
};
const service = createAuthorizationService(authorizationRepository);
export const requireAuthenticatedUser = service.requireAuthenticatedUser;
export const requireActiveTenantUser = service.requireActiveTenantUser;
export const requireTenantRole = service.requireTenantRole;
export const requireSuperAdmin = service.requireSuperAdmin;
export const requireSuperAdminTenantTarget = service.requireSuperAdminTenantTarget;
export { assertSameTenant, assertSessionClaimsCurrent, AuthorizationError, getAuthorizationFailure, isAuthorizationRole, isSuperAdminRole, tenantScopedWhere } from "@/lib/authorization-core";
export type { AuthorizationErrorCode, AuthorizedIdentity, AuthorizationRole, TenantRole } from "@/lib/authorization-core";