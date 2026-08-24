import { AuditAction, Role, SubscriptionStatus, TenantStatus } from "@prisma/client";
import { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getUserMembershipContext } from "@/lib/membership-context";
import { assertTenantId } from "./tenant.validator";
import { ensureInitialTenant } from "./tenant.repository";
import { INITIAL_TENANT_ID } from "./tenant.constants";
import { registerAuditLog } from "@/domains/platform/audit.service";

type TenantAccessUser = {
  id?: string;
  isActive?: boolean;
  role: Role | null;
  tenantId: string | null;
  selectedTenantId?: string | null;
  tenantStatus?: TenantStatus | null;
  subscriptionStatus?: SubscriptionStatus | null;
};

const BLOCKED_TENANT_STATUSES: TenantStatus[] = ["PENDING_PAYMENT", "SUSPENDED", "CANCELLED"];
const BLOCKED_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["PENDING_PAYMENT", "SUSPENDED", "CANCELLED"];

export function getTenantIdFromSession(session: Session): string {
  return assertTenantId(session.user.tenantId);
}
export function isTenantAccessBlocked(user: TenantAccessUser): boolean {
  if (user.isActive === false) return true;
  if (user.role === "SUPER_ADMIN") return false;
  if (!user.tenantId) return true;
  if (user.tenantStatus && BLOCKED_TENANT_STATUSES.includes(user.tenantStatus)) return true;
  if (user.subscriptionStatus && BLOCKED_SUBSCRIPTION_STATUSES.includes(user.subscriptionStatus)) return true;
  return false;
}
export function getTenantAccessBlockedMessage(user: TenantAccessUser): string {
  if (user.isActive === false) return "Tu cuenta se encuentra desactivada. Contacte al administrador de su conjunto.";
  if (!user.tenantId) return "Tu usuario no tiene una copropiedad asignada. Contacta al administrador de la plataforma.";
  if (user.tenantStatus === "CANCELLED" || user.subscriptionStatus === "CANCELLED") return "La licencia de esta copropiedad fue cancelada. Contacta al equipo administrador para reactivar el servicio.";
  if (user.tenantStatus === "PENDING_PAYMENT" || user.subscriptionStatus === "PENDING_PAYMENT") return "Debe completar el pago de su primera licencia para poder usar la plataforma.";
  return "La licencia de esta copropiedad se encuentra suspendida. Contacta al equipo administrador para reactivar el servicio.";
}
export async function refreshTenantAccessForUser(user: TenantAccessUser): Promise<TenantAccessUser> {
  const context = user.id ? await getUserMembershipContext(user.id, user.selectedTenantId ?? user.tenantId) : null;
  if (!context || !context.isActive) {
    return { ...user, tenantId: null, isActive: false, tenantStatus: null, subscriptionStatus: null };
  }
  if (context.isSuperAdmin) {
    return { ...user, role: "SUPER_ADMIN", tenantId: null, isActive: true, tenantStatus: null, subscriptionStatus: null };
  }
  const membership = context.selectedMembership;
  return {
    ...user,
    role: membership?.role ?? null,
    tenantId: membership?.tenantId ?? null,
    isActive: Boolean(membership),
    tenantStatus: (membership?.tenantStatus as TenantStatus | undefined) ?? null,
    subscriptionStatus: (membership?.subscriptionStatus as SubscriptionStatus | undefined) ?? null,
  };
}
export async function ensureDefaultTenant() { return ensureInitialTenant(prisma); }
export function getInitialTenantId() { return INITIAL_TENANT_ID; }
export async function updateTenantSettingsForAdmin({
  tenantId,
  actorUserId,
  name,
  city,
  address,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  name?: unknown;
  city?: unknown;
  address?: unknown;
  origin?: string | null;
}) {
  const normalizeRequired = (value: unknown, label: string, maxLength: number) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new Error(`${label} invalido`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maxLength) throw new Error(`${label} invalido`);
    return normalized;
  };
  const normalizeOptional = (value: unknown, label: string, maxLength: number) => {
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new Error(`${label} invalida`);
    const normalized = value.trim();
    if (normalized.length > maxLength) throw new Error(`${label} invalida`);
    return normalized || null;
  };

  const data = {
    name: normalizeRequired(name, "Nombre del conjunto", 120),
    city: normalizeOptional(city, "Ciudad", 120),
    address: normalizeOptional(address, "Direccion", 255),
  };

  if (data.name === undefined && data.city === undefined && data.address === undefined) {
    throw new Error("No hay cambios para guardar");
  }

  const before = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true, city: true, address: true },
  });
  if (!before) throw new Error("Conjunto no encontrado");

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data,
    select: { id: true, name: true, slug: true, city: true, address: true, units: true, status: true },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.TENANT_UPDATED,
    targetType: "Tenant",
    targetId: tenant.id,
    origin,
    metadata: {
      fields: Object.entries(data).filter(([, value]) => value !== undefined).map(([key]) => key),
      before: { name: before.name, city: before.city, address: before.address },
      after: { name: tenant.name, city: tenant.city, address: tenant.address },
    },
  });

  return tenant;
}
