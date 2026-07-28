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

export type TenantStatusValue =
  | "PENDING_PAYMENT"
  | "TRIAL"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "CANCELLED";

export type SubscriptionStatusValue =
  | "PENDING_PAYMENT"
  | "TRIAL"
  | "ACTIVE"
  | "GRACE_PERIOD"
  | "SUSPENDED"
  | "CANCELLED";

export interface AuthorizationSession {
  user?: {
    id?: string | null;
    role?: unknown;
    tenantId?: string | null;
  } | null;
}

export interface AuthorizationUserRecord {
  id: string;
  role: string;
  tenantId: string | null;
  isActive: boolean;
  tenant: {
    id: string;
    status: TenantStatusValue;
    subscriptionStatus: SubscriptionStatusValue | null;
  } | null;
}

export interface AuthorizationTenantRecord {
  id: string;
  status: TenantStatusValue;
}

export interface AuthorizationRepository {
  findUserById(userId: string): Promise<AuthorizationUserRecord | null>;
  findTenantById(tenantId: string): Promise<AuthorizationTenantRecord | null>;
}

export interface AuthorizedIdentity {
  userId: string;
  role: AuthorizationRole;
  tenantId: string | null;
  tenantStatus: TenantStatusValue | null;
  subscriptionStatus: SubscriptionStatusValue | null;
}

const BLOCKED_TENANT_STATUSES = new Set<TenantStatusValue>([
  "PENDING_PAYMENT",
  "SUSPENDED",
  "CANCELLED",
]);
const BLOCKED_SUBSCRIPTION_STATUSES = new Set<SubscriptionStatusValue>([
  "PENDING_PAYMENT",
  "SUSPENDED",
  "CANCELLED",
]);

const AUTHORIZATION_MESSAGES: Record<AuthorizationErrorCode, string> = {
  UNAUTHENTICATED: "Autenticacion requerida",
  USER_INACTIVE: "La cuenta no esta activa",
  TENANT_REQUIRED: "El usuario no tiene un conjunto activo asignado",
  TENANT_INACTIVE: "El conjunto no tiene acceso activo",
  FORBIDDEN: "No autorizado",
  RESOURCE_NOT_FOUND: "Recurso no encontrado",
};

const AUTHORIZATION_STATUS: Record<AuthorizationErrorCode, number> = {
  UNAUTHENTICATED: 401,
  USER_INACTIVE: 403,
  TENANT_REQUIRED: 403,
  TENANT_INACTIVE: 403,
  FORBIDDEN: 403,
  RESOURCE_NOT_FOUND: 404,
};

export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;
  readonly status: number;

  constructor(code: AuthorizationErrorCode) {
    super(AUTHORIZATION_MESSAGES[code]);
    this.name = "AuthorizationError";
    this.code = code;
    this.status = AUTHORIZATION_STATUS[code];
  }
}

export function isAuthorizationRole(role: unknown): role is AuthorizationRole {
  return typeof role === "string" && AUTHORIZATION_ROLES.includes(role as AuthorizationRole);
}

export function isSuperAdminRole(role: unknown): role is "SUPER_ADMIN" {
  return role === "SUPER_ADMIN";
}

export function getAuthorizationFailure(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null;
  return {
    status: error.status,
    body: { error: error.message, code: error.code },
  };
}

export function createAuthorizationService(repository: AuthorizationRepository) {
  async function requireAuthenticatedUser(
    session: AuthorizationSession | null | undefined
  ): Promise<AuthorizedIdentity> {
    const userId = session?.user?.id;
    if (!userId) throw new AuthorizationError("UNAUTHENTICATED");

    const user = await repository.findUserById(userId);
    if (!user) throw new AuthorizationError("UNAUTHENTICATED");
    if (!user.isActive) throw new AuthorizationError("USER_INACTIVE");
    if (!isAuthorizationRole(user.role)) throw new AuthorizationError("FORBIDDEN");

    return {
      userId: user.id,
      role: user.role,
      tenantId: user.tenantId,
      tenantStatus: user.tenant?.status ?? null,
      subscriptionStatus: user.tenant?.subscriptionStatus ?? null,
    };
  }

  async function requireActiveTenantUser(
    session: AuthorizationSession | null | undefined
  ): Promise<AuthorizedIdentity & { role: TenantRole; tenantId: string }> {
    const identity = await requireAuthenticatedUser(session);
    if (identity.role === "SUPER_ADMIN") throw new AuthorizationError("FORBIDDEN");
    if (!identity.tenantId || !identity.tenantStatus) {
      throw new AuthorizationError("TENANT_REQUIRED");
    }
    if (
      BLOCKED_TENANT_STATUSES.has(identity.tenantStatus) ||
      (identity.subscriptionStatus !== null &&
        BLOCKED_SUBSCRIPTION_STATUSES.has(identity.subscriptionStatus))
    ) {
      throw new AuthorizationError("TENANT_INACTIVE");
    }

    return identity as AuthorizedIdentity & { role: TenantRole; tenantId: string };
  }

  async function requireTenantRole(
    session: AuthorizationSession | null | undefined,
    ...allowedRoles: TenantRole[]
  ) {
    const identity = await requireActiveTenantUser(session);
    if (!allowedRoles.includes(identity.role)) throw new AuthorizationError("FORBIDDEN");
    return identity;
  }

  async function requireSuperAdmin(session: AuthorizationSession | null | undefined) {
    const identity = await requireAuthenticatedUser(session);
    if (identity.role !== "SUPER_ADMIN") throw new AuthorizationError("FORBIDDEN");
    return identity;
  }

  async function requireSuperAdminTenantTarget(
    session: AuthorizationSession | null | undefined,
    targetTenantId: string | null | undefined
  ) {
    const identity = await requireSuperAdmin(session);
    const normalizedTarget = targetTenantId?.trim();
    if (!normalizedTarget) throw new AuthorizationError("TENANT_REQUIRED");
    const tenant = await repository.findTenantById(normalizedTarget);
    if (!tenant) throw new AuthorizationError("RESOURCE_NOT_FOUND");
    return { identity, targetTenantId: tenant.id, targetTenantStatus: tenant.status };
  }

  return {
    requireAuthenticatedUser,
    requireActiveTenantUser,
    requireTenantRole,
    requireSuperAdmin,
    requireSuperAdminTenantTarget,
  };
}

export function assertSessionClaimsCurrent(
  session: AuthorizationSession,
  identity: AuthorizedIdentity
): void {
  if (
    session.user?.role !== identity.role ||
    (session.user?.tenantId ?? null) !== identity.tenantId
  ) {
    throw new AuthorizationError("FORBIDDEN");
  }
}

export function assertSameTenant(
  identity: AuthorizedIdentity,
  resourceTenantId: string | null | undefined
): asserts identity is AuthorizedIdentity & { role: TenantRole; tenantId: string } {
  if (
    identity.role === "SUPER_ADMIN" ||
    !identity.tenantId ||
    !resourceTenantId ||
    identity.tenantId !== resourceTenantId
  ) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND");
  }
}

export function tenantScopedWhere(identity: AuthorizedIdentity, resourceId: string) {
  if (identity.role === "SUPER_ADMIN" || !identity.tenantId) {
    throw new AuthorizationError("FORBIDDEN");
  }
  return { id: resourceId, tenantId: identity.tenantId };
}
