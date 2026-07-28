import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  resolveSelectedMembership,
  type MembershipOption,
} from "@/lib/tenant-selection";

export type ActiveMembership = MembershipOption & {
  isActive: true;
  bloque: number | null;
  apto: number | null;
  onboardingCompletedAt: Date | null;
  tenantStatus: string;
  subscriptionStatus: string | null;
};

export type UserMembershipContext = {
  userId: string;
  isActive: boolean;
  isSuperAdmin: boolean;
  memberships: ActiveMembership[];
  selectedMembership: ActiveMembership | null;
};

export async function getUserMembershipContext(
  userId: string,
  preferredTenantId?: string | null
): Promise<UserMembershipContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      memberships: {
        where: { isActive: true },
        orderBy: [{ tenant: { name: "asc" } }, { createdAt: "asc" }],
        select: {
          id: true,
          tenantId: true,
          role: true,
          isActive: true,
          bloque: true,
          apto: true,
          onboardingCompletedAt: true,
          tenant: {
            select: {
              name: true,
              status: true,
              subscription: { select: { status: true } },
            },
          },
        },
      },
    },
  });
  if (!user) return null;

  const isSuperAdmin = user.role === "SUPER_ADMIN";
  const memberships = isSuperAdmin
    ? []
    : user.memberships
        .filter(
          (
            membership
          ): membership is typeof membership & {
            role: Exclude<Role, "SUPER_ADMIN">;
          } => membership.role !== "SUPER_ADMIN"
        )
        .map((membership) => ({
          id: membership.id,
          tenantId: membership.tenantId,
          tenantName: membership.tenant.name,
          role: membership.role,
          isActive: true as const,
          bloque: membership.bloque,
          apto: membership.apto,
          onboardingCompletedAt: membership.onboardingCompletedAt,
          tenantStatus: membership.tenant.status,
          subscriptionStatus: membership.tenant.subscription?.status ?? null,
        }));

  return {
    userId: user.id,
    isActive: user.isActive,
    isSuperAdmin,
    memberships,
    selectedMembership: isSuperAdmin
      ? null
      : resolveSelectedMembership(memberships, preferredTenantId),
  };
}

export function publicMemberships(context: UserMembershipContext) {
  return context.memberships.map(({ id, tenantId, tenantName, role }) => ({
    id,
    tenantId,
    tenantName,
    role,
  }));
}
