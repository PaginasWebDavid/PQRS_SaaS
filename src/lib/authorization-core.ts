export const AUTHORIZATION_ROLES = ["SUPER_ADMIN", "ADMIN", "CONSEJO", "RESIDENTE"] as const;
export type AuthorizationRole = (typeof AUTHORIZATION_ROLES)[number];
export type TenantRole = Exclude<AuthorizationRole, "SUPER_ADMIN">;
export type AuthorizationErrorCode =
  | "UNAUTHENTICATED"
  | "USER_INACTIVE"
  | "TENANT_REQUIRED"
  | "TENANT_INACTIVE"
  | "FORBIDDEN"
  | "RESOURCE_NOT_FOUND";
export type TenantStatusValue = "PENDING_PAYMENT" | "TRIAL" | "ACTIVE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED";
export type SubscriptionStatusValue = TenantStatusValue;

export interface AuthorizationSession {
  user?: {
    id?: string | null;
    role?: unknown;
    tenantId?: string | null;
    selectedTenantId?: string | null;
    selectedMembershipId?: string | null;
  } | null;
}
export interface AuthorizationMembershipRecord {
  id: string;
  tenantId: string;
  role: string;
  isActive: boolean;
  tenant: {
    id: string;
    status: TenantStatusValue;
    subscriptionStatus: SubscriptionStatusValue | null;
  };
}
export interface AuthorizationUserRecord {
  id: string;
  globalRole: string;
  isActive: boolean;
  membership: AuthorizationMembershipRecord | null;
}
export interface AuthorizationTenantRecord { id: string; status: TenantStatusValue }
export interface AuthorizationRepository {
  findUserById(userId: string, preferredTenantId: string | null): Promise<AuthorizationUserRecord | null>;
  findTenantById(tenantId: string): Promise<AuthorizationTenantRecord | null>;
}
export interface AuthorizedIdentity {
  userId: string;
  membershipId: string | null;
  role: AuthorizationRole;
  tenantId: string | null;
  tenantStatus: TenantStatusValue | null;
  subscriptionStatus: SubscriptionStatusValue | null;
}

const BLOCKED_TENANT_STATUSES = new Set<TenantStatusValue>(["PENDING_PAYMENT", "SUSPENDED", "CANCELLED"]);
const BLOCKED_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatusValue>(["PENDING_PAYMENT", "SUSPENDED", "CANCELLED"]);
const MESSAGES: Record<AuthorizationErrorCode, string> = {
  UNAUTHENTICATED: "Autenticacion requerida",
  USER_INACTIVE: "La cuenta no esta activa",
  TENANT_REQUIRED: "Debes seleccionar un conjunto activo",
  TENANT_INACTIVE: "El conjunto no tiene acceso activo",
  FORBIDDEN: "No autorizado",
  RESOURCE_NOT_FOUND: "Recurso no encontrado",
};
const STATUS: Record<AuthorizationErrorCode, number> = {
  UNAUTHENTICATED: 401, USER_INACTIVE: 403, TENANT_REQUIRED: 403,
  TENANT_INACTIVE: 403, FORBIDDEN: 403, RESOURCE_NOT_FOUND: 404,
};
export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;
  readonly status: number;
  constructor(code: AuthorizationErrorCode) {
    super(MESSAGES[code]); this.name = "AuthorizationError"; this.code = code; this.status = STATUS[code];
  }
}
export function isAuthorizationRole(role: unknown): role is AuthorizationRole {
  return typeof role === "string" && AUTHORIZATION_ROLES.includes(role as AuthorizationRole);
}
export function isSuperAdminRole(role: unknown): role is "SUPER_ADMIN" { return role === "SUPER_ADMIN" }
export function getAuthorizationFailure(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null;
  return { status: error.status, body: { error: error.message, code: error.code } };
}

export function createAuthorizationService(repository: AuthorizationRepository) {
  async function requireAuthenticatedUser(session: AuthorizationSession | null | undefined): Promise<AuthorizedIdentity> {
    const userId = session?.user?.id;
    if (!userId) throw new AuthorizationError("UNAUTHENTICATED");
    const preferredTenantId = session?.user?.selectedTenantId ?? session?.user?.tenantId ?? null;
    const user = await repository.findUserById(userId, preferredTenantId);
    if (!user) throw new AuthorizationError("UNAUTHENTICATED");
    if (!user.isActive) throw new AuthorizationError("USER_INACTIVE");
    if (user.globalRole === "SUPER_ADMIN") {
      return { userId: user.id, membershipId: null, role: "SUPER_ADMIN", tenantId: null, tenantStatus: null, subscriptionStatus: null };
    }
    const membership = user.membership;
    if (!membership || !membership.isActive) throw new AuthorizationError("TENANT_REQUIRED");
    if (!isAuthorizationRole(membership.role) || membership.role === "SUPER_ADMIN") {
      throw new AuthorizationError("FORBIDDEN");
    }
    return {
      userId: user.id,
      membershipId: membership.id,
      role: membership.role,
      tenantId: membership.tenantId,
      tenantStatus: membership.tenant.status,
      subscriptionStatus: membership.tenant.subscriptionStatus,
    };
  }
  async function requireActiveTenantUser(session: AuthorizationSession | null | undefined) {
    const identity = await requireAuthenticatedUser(session);
    if (identity.role === "SUPER_ADMIN" || !identity.tenantId || !identity.membershipId || !identity.tenantStatus) {
      throw new AuthorizationError(identity.role === "SUPER_ADMIN" ? "FORBIDDEN" : "TENANT_REQUIRED");
    }
    if (BLOCKED_TENANT_STATUSES.has(identity.tenantStatus) ||
      (identity.subscriptionStatus !== null && BLOCKED_SUBSCRIPTION_STATUSES.has(identity.subscriptionStatus))) {
      throw new AuthorizationError("TENANT_INACTIVE");
    }
    return identity as AuthorizedIdentity & { membershipId: string; role: TenantRole; tenantId: string };
  }
  async function requireTenantRole(session: AuthorizationSession | null | undefined, ...allowedRoles: TenantRole[]) {
    const identity = await requireActiveTenantUser(session);
    if (!allowedRoles.includes(identity.role)) throw new AuthorizationError("FORBIDDEN");
    return identity;
  }
  async function requireSuperAdmin(session: AuthorizationSession | null | undefined) {
    const identity = await requireAuthenticatedUser(session);
    if (identity.role !== "SUPER_ADMIN") throw new AuthorizationError("FORBIDDEN");
    return identity;
  }
  async function requireSuperAdminTenantTarget(session: AuthorizationSession | null | undefined, targetTenantId: string | null | undefined) {
    const identity = await requireSuperAdmin(session);
    const normalizedTarget = targetTenantId?.trim();
    if (!normalizedTarget) throw new AuthorizationError("TENANT_REQUIRED");
    const tenant = await repository.findTenantById(normalizedTarget);
    if (!tenant) throw new AuthorizationError("RESOURCE_NOT_FOUND");
    return { identity, targetTenantId: tenant.id, targetTenantStatus: tenant.status };
  }
  return { requireAuthenticatedUser, requireActiveTenantUser, requireTenantRole, requireSuperAdmin, requireSuperAdminTenantTarget };
}

export function assertSessionClaimsCurrent(session: AuthorizationSession, identity: AuthorizedIdentity): void {
  const selected = session.user?.selectedTenantId ?? session.user?.tenantId ?? null;
  if (selected && selected !== identity.tenantId) throw new AuthorizationError("FORBIDDEN");
}
export function assertSameTenant(identity: AuthorizedIdentity, resourceTenantId: string | null | undefined): asserts identity is AuthorizedIdentity & { membershipId: string; role: TenantRole; tenantId: string } {
  if (identity.role === "SUPER_ADMIN" || !identity.tenantId || !resourceTenantId || identity.tenantId !== resourceTenantId) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND");
  }
}
export function tenantScopedWhere(identity: AuthorizedIdentity, resourceId: string) {
  if (identity.role === "SUPER_ADMIN" || !identity.tenantId) throw new AuthorizationError("FORBIDDEN");
  return { id: resourceId, tenantId: identity.tenantId };
}