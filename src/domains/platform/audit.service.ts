import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type AuditInput = {
  actorUserId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function registerAuditLog({
  actorUserId,
  action,
  targetType,
  targetId,
  metadata,
}: AuditInput) {
  return prisma.auditLog.create({
    data: {
      actorUserId,
      action,
      targetType,
      targetId,
      metadata,
    },
  });
}