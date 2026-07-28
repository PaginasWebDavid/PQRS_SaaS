import {
  AuthorizationError,
  type AuthorizationRole,
} from "@/lib/authorization-core";

export function managementTenantPolicy({
  role,
  ownTenantId,
  requestedTenantId,
}: {
  role: AuthorizationRole;
  ownTenantId: string | null;
  requestedTenantId?: string | null;
}) {
  const requested = requestedTenantId?.trim() || null;

  if (role === "SUPER_ADMIN") {
    if (!requested) throw new AuthorizationError("TENANT_REQUIRED");
    return requested;
  }
  if (role !== "ADMIN" || !ownTenantId) {
    throw new AuthorizationError("FORBIDDEN");
  }
  if (requested && requested !== ownTenantId) {
    throw new AuthorizationError("RESOURCE_NOT_FOUND");
  }
  return ownTenantId;
}
