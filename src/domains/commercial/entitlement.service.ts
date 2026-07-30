import { AuditAction, Prisma, TenantFeature, TenantFeatureStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { commercialRequestHash, normalizeCommercialOperationId } from "./commercial-policy";
import { runCommercialTransaction } from "./commercial-transaction";

export class FeatureUnavailableError extends Error {
  constructor() {
    super("Modulo no disponible para este conjunto");
    this.name = "FeatureUnavailableError";
  }
}

export async function listTenantEntitlements(tenantId: string) {
  return prisma.tenantFeatureEntitlement.findMany({ where: { tenantId }, orderBy: { feature: "asc" } });
}

export async function tenantFeatureMap(tenantId: string) {
  const rows = await listTenantEntitlements(tenantId);
  return {
    reservations: rows.some((row) => row.feature === "RESERVATIONS" && row.status === "ACTIVE"),
    residentPayments: rows.some((row) => row.feature === "RESIDENT_PAYMENTS" && row.status === "ACTIVE"),
    details: rows,
  };
}

export async function assertTenantFeatureActive(tenantId: string, feature: TenantFeature) {
  const entitlement = await prisma.tenantFeatureEntitlement.findUnique({ where: { tenantId_feature: { tenantId, feature } } });
  if (entitlement?.status !== "ACTIVE") throw new FeatureUnavailableError();
  return entitlement;
}

export async function setTenantFeatureEntitlement(input: {
  actorUserId: string;
  tenantId: string;
  feature: TenantFeature;
  status: TenantFeatureStatus;
  reason: string;
  operationId: string;
  priceCents?: number | null;
}) {
  if (!input.reason.trim()) throw new Error("Debes indicar el motivo del cambio");
  if (input.priceCents != null && (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0)) throw new Error("Precio de add-on invalido");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("SET_ENTITLEMENT", { feature: input.feature, status: input.status, reason: input.reason.trim(), priceCents: input.priceCents ?? null });

  return runCommercialTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial:${input.tenantId}:${operationId}`}, 0))`;
    const previousOperation = await tx.commercialOperation.findUnique({ where: { tenantId_operationId: { tenantId: input.tenantId, operationId } } });
    if (previousOperation) {
      if (previousOperation.action !== "SET_ENTITLEMENT" || previousOperation.requestHash !== requestHash) throw new Error("El operationId ya fue usado con datos distintos");
      return tx.tenantFeatureEntitlement.findUniqueOrThrow({ where: { tenantId_feature: { tenantId: input.tenantId, feature: input.feature } } });
    }
    const before = await tx.tenantFeatureEntitlement.findUnique({ where: { tenantId_feature: { tenantId: input.tenantId, feature: input.feature } } });
    const entitlement = await tx.tenantFeatureEntitlement.upsert({
      where: { tenantId_feature: { tenantId: input.tenantId, feature: input.feature } },
      create: { tenantId: input.tenantId, feature: input.feature, status: input.status, priceCents: input.priceCents ?? null, effectiveAt: new Date(), updatedById: input.actorUserId, reason: input.reason.trim() },
      update: { status: input.status, priceCents: input.priceCents ?? null, effectiveAt: new Date(), updatedById: input.actorUserId, reason: input.reason.trim() },
    });
    await registerAuditLog({ actorUserId: input.actorUserId, tenantId: input.tenantId, action: AuditAction.TENANT_FEATURE_CHANGED, targetType: "TenantFeatureEntitlement", targetId: entitlement.id, metadata: { operationId, feature: input.feature, before: before ? { status: before.status, priceCents: before.priceCents } : null, after: { status: entitlement.status, priceCents: entitlement.priceCents }, reason: input.reason.trim() } }, tx);
    await tx.commercialOperation.create({ data: { tenantId: input.tenantId, operationId, action: "SET_ENTITLEMENT", requestHash, actorUserId: input.actorUserId, result: { entitlementId: entitlement.id } as Prisma.InputJsonValue } });
    return entitlement;
  });
}
