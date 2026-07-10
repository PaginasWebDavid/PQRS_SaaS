import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  actorUserId?: string | null;
  tenantId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  origin?: string | null;
  metadata?: Prisma.InputJsonValue;
};

function sanitizeMetadata(metadata?: Prisma.InputJsonValue): Prisma.InputJsonValue | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return metadata;

  const blocked = new Set(["password", "token", "tokenHash", "secret", "apiKey", "serviceRoleKey", "accessToken"]);
  const clean: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(metadata as Record<string, Prisma.InputJsonValue>)) {
    clean[key] = blocked.has(key) ? "[REDACTED]" : value;
  }

  return clean;
}

export async function registerAuditLog({
  actorUserId,
  tenantId,
  action,
  targetType,
  targetId,
  resourceType,
  resourceId,
  origin,
  metadata,
}: AuditInput) {
  const finalResourceType = resourceType ?? targetType ?? null;
  const finalResourceId = resourceId ?? targetId ?? null;

  return prisma.auditLog.create({
    data: {
      actorUserId,
      tenantId,
      action,
      targetType: targetType ?? finalResourceType,
      targetId: targetId ?? finalResourceId,
      resourceType: finalResourceType,
      resourceId: finalResourceId,
      origin,
      metadata: sanitizeMetadata(metadata),
    },
  });
}
