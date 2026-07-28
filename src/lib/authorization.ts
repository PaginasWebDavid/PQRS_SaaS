import { prisma } from "@/lib/prisma";
import {
  createAuthorizationService,
  type AuthorizationRepository,
} from "@/lib/authorization-core";

const authorizationRepository: AuthorizationRepository = {
  async findUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        tenantId: true,
        isActive: true,
        tenant: {
          select: {
            id: true,
            status: true,
            subscription: { select: { status: true } },
          },
        },
      },
    });

    if (!user) return null;
    return {
      id: user.id,
      role: user.role,
      tenantId: user.tenantId,
      isActive: user.isActive,
      tenant: user.tenant
        ? {
            id: user.tenant.id,
            status: user.tenant.status,
            subscriptionStatus: user.tenant.subscription?.status ?? null,
          }
        : null,
    };
  },

  async findTenantById(tenantId) {
    return prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });
  },
};

const authorizationService = createAuthorizationService(authorizationRepository);

export const requireAuthenticatedUser = authorizationService.requireAuthenticatedUser;
export const requireActiveTenantUser = authorizationService.requireActiveTenantUser;
export const requireTenantRole = authorizationService.requireTenantRole;
export const requireSuperAdmin = authorizationService.requireSuperAdmin;
export const requireSuperAdminTenantTarget =
  authorizationService.requireSuperAdminTenantTarget;

export {
  assertSameTenant,
  assertSessionClaimsCurrent,
  AuthorizationError,
  getAuthorizationFailure,
  isAuthorizationRole,
  isSuperAdminRole,
  tenantScopedWhere,
} from "@/lib/authorization-core";
export type {
  AuthorizationErrorCode,
  AuthorizedIdentity,
  AuthorizationRole,
  TenantRole,
} from "@/lib/authorization-core";
