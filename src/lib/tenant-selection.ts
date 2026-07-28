import { createHmac, timingSafeEqual } from "node:crypto";

export const SELECTED_TENANT_COOKIE = "pqrs-selected-tenant";

export type MembershipOption = {
  id: string;
  tenantId: string;
  role: "ADMIN" | "CONSEJO" | "RESIDENTE";
  tenantName: string;
};

export function resolveSelectedMembership<T extends MembershipOption>(
  memberships: T[],
  preferredTenantId: string | null | undefined
): T | null {
  if (memberships.length === 1) return memberships[0];
  if (memberships.length === 0 || !preferredTenantId) return null;
  return (
    memberships.find(
      (membership) => membership.tenantId === preferredTenantId
    ) ?? null
  );
}

export function signTenantSelection(userId: string, tenantId: string) {
  const payload = Buffer.from(
    JSON.stringify({ v: 1, userId, tenantId }),
    "utf8"
  ).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyTenantSelection(
  value: string | null | undefined,
  userId: string
) {
  if (!value) return null;
  const [payload, suppliedSignature, extra] = value.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as { v?: unknown; userId?: unknown; tenantId?: unknown };
    if (
      decoded.v !== 1 ||
      decoded.userId !== userId ||
      typeof decoded.tenantId !== "string" ||
      !decoded.tenantId
    ) {
      return null;
    }
    return decoded.tenantId;
  } catch {
    return null;
  }
}

function signature(payload: string) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no esta configurado");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
