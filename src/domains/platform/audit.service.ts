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

export const AUDIT_CATEGORIES: Record<string, AuditAction[]> = {
  conjuntos: [
    AuditAction.TENANT_CREATED,
    AuditAction.TENANT_SUSPENDED,
    AuditAction.TENANT_REACTIVATED,
    AuditAction.TENANT_CANCELLED,
    AuditAction.TENANT_UPDATED,
    AuditAction.TENANT_OVERDUE_RULES_APPLIED,
  ],
  facturacion: [
    AuditAction.SUBSCRIPTION_CREATED,
    AuditAction.SUBSCRIPTION_RENEWED,
    AuditAction.PAYMENT_SIMULATED,
    AuditAction.MERCADO_PAGO_SUBSCRIPTION_CREATED,
    AuditAction.MERCADO_PAGO_WEBHOOK_PROCESSED,
    AuditAction.SUBSCRIPTION_AUTO_RENEW_DISABLED,
    AuditAction.SUBSCRIPTION_AUTO_RENEW_ENABLED,
    AuditAction.SUBSCRIPTION_PAYMENT_FAILED,
  ],
  administracion: [AuditAction.PLATFORM_SETTING_CHANGED, AuditAction.PRICING_RULE_CHANGED],
  usuarios: [
    AuditAction.INVITATION_CREATED,
    AuditAction.INVITATION_RESENT,
    AuditAction.INVITATION_ACCEPTED,
    AuditAction.INVITATION_CANCELLED,
    AuditAction.INVITATION_EXPIRED,
    AuditAction.USER_UPDATED,
    AuditAction.USER_DEACTIVATED,
    AuditAction.USER_REACTIVATED,
    AuditAction.ONBOARDING_COMPLETED,
    AuditAction.PROFILE_UPDATED,
  ],
  pqrs: [AuditAction.PQRS_CREATED, AuditAction.PQRS_UPDATED, AuditAction.PQRS_CLOSED],
  notificaciones: [AuditAction.NOTIFICATION_CREATED, AuditAction.EMAIL_SENT, AuditAction.EMAIL_FAILED],
  soporte: [AuditAction.SUPPORT_TICKET_CREATED, AuditAction.SUPPORT_TICKET_RESPONDED, AuditAction.SUPPORT_TICKET_CLOSED],
};

export async function getAuditCategoryCounts() {
  const entries = await Promise.all(
    Object.entries(AUDIT_CATEGORIES).map(async ([key, actions]) => [key, await prisma.auditLog.count({ where: { action: { in: actions } } })] as const)
  );
  const total = await prisma.auditLog.count();
  return { total, ...Object.fromEntries(entries) };
}

export async function getAuditLogPage({ category, take, skip }: { category?: string; take: number; skip: number }) {
  const where = category && category !== "all" && AUDIT_CATEGORIES[category] ? { action: { in: AUDIT_CATEGORIES[category] } } : {};
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { entries, total };
}

const TENANT_AUDIT_CATEGORIES: Record<string, AuditAction[]> = {
  pqrs: AUDIT_CATEGORIES.pqrs,
  usuarios: AUDIT_CATEGORIES.usuarios,
  licencia: [...AUDIT_CATEGORIES.facturacion, AuditAction.TENANT_SUSPENDED, AuditAction.TENANT_REACTIVATED, AuditAction.TENANT_CANCELLED],
};

export async function getTenantAuditLogPage({
  tenantId,
  category,
  take,
  skip,
}: {
  tenantId: string;
  category?: string;
  take: number;
  skip: number;
}) {
  const categoryFilter = category && category !== "all" && TENANT_AUDIT_CATEGORIES[category]
    ? { action: { in: TENANT_AUDIT_CATEGORIES[category] } }
    : {};
  const where = { tenantId, ...categoryFilter };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  return { entries, total };
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
