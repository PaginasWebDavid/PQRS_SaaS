import { Role, SubscriptionStatus, TenantStatus } from "@prisma/client";
import { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { assertTenantId } from "./tenant.validator";
import { ensureInitialTenant } from "./tenant.repository";
import { INITIAL_TENANT_ID } from "./tenant.constants";

type TenantAccessUser = {
  role: Role;
  tenantId: string | null;
  tenantStatus?: TenantStatus | null;
  subscriptionStatus?: SubscriptionStatus | null;
};

const BLOCKED_TENANT_STATUSES: TenantStatus[] = ["SUSPENDED", "CANCELLED"];
const BLOCKED_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["SUSPENDED", "CANCELLED"];

export function getTenantIdFromSession(session: Session): string {
  return assertTenantId(session.user.tenantId);
}

export function isTenantAccessBlocked(user: TenantAccessUser): boolean {
  if (user.role === "SUPER_ADMIN") return false;
  if (!user.tenantId) return true;
  if (user.tenantStatus && BLOCKED_TENANT_STATUSES.includes(user.tenantStatus)) return true;
  if (user.subscriptionStatus && BLOCKED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus)) return true;
  return false;
}

export function getTenantAccessBlockedMessage(user: TenantAccessUser): string {
  if (!user.tenantId) {
    return "Tu usuario no tiene una copropiedad asignada. Contacta al administrador de la plataforma.";
  }

  if (user.tenantStatus === "CANCELLED" || user.subscriptionStatus === "CANCELLED") {
    return "La licencia de esta copropiedad fue cancelada. Contacta al equipo administrador para reactivar el servicio.";
  }

  return "La licencia de esta copropiedad se encuentra suspendida. Contacta al equipo administrador para reactivar el servicio.";
}

export async function refreshTenantAccessForUser(user: TenantAccessUser): Promise<TenantAccessUser> {
  if (user.role === "SUPER_ADMIN" || !user.tenantId) return user;

  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenantId },
    select: {
      status: true,
      subscription: { select: { status: true } },
    },
  });

  return {
    ...user,
    tenantStatus: tenant?.status ?? null,
    subscriptionStatus: tenant?.subscription?.status ?? null,
  };
}

export async function ensureDefaultTenant() {
  return ensureInitialTenant(prisma);
}

export function getInitialTenantId() {
  return INITIAL_TENANT_ID;
}