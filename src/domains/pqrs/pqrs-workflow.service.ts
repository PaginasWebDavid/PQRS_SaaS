import { AuditAction, type PqrsWorkflowType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

const VALID_WORKFLOW_TYPES: PqrsWorkflowType[] = ["SIMPLE", "MAINTENANCE"];

export function isValidPqrsWorkflowType(value: unknown): value is PqrsWorkflowType {
  return typeof value === "string" && (VALID_WORKFLOW_TYPES as string[]).includes(value);
}

// Cambiar la plantilla del tenant NUNCA altera casos existentes: cada PQRS
// guarda su propio `workflowType` (snapshot inmutable tomado al crearse), asi
// que no hace falta bloquear el cambio ni revalidar casos activos aqui.
export async function updatePqrsWorkflowTypeForAdmin({
  tenantId,
  actorUserId,
  workflowType,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  workflowType: unknown;
  origin?: string | null;
}) {
  if (!isValidPqrsWorkflowType(workflowType)) {
    throw new Error("Plantilla de PQRS invalida");
  }

  const before = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { pqrsWorkflowType: true },
  });
  if (!before) throw new Error("Conjunto no encontrado");

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { pqrsWorkflowType: workflowType },
    select: { id: true, pqrsWorkflowType: true },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.TENANT_UPDATED,
    targetType: "Tenant",
    targetId: tenant.id,
    origin,
    metadata: { field: "pqrsWorkflowType", before: before.pqrsWorkflowType, after: tenant.pqrsWorkflowType },
  });

  return tenant;
}

export async function getPqrsWorkflowTypeForTenant(tenantId: string): Promise<PqrsWorkflowType> {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { pqrsWorkflowType: true },
  });
  return tenant.pqrsWorkflowType;
}

// Grafo de transiciones validas de `faseActual`, por plantilla. SIMPLE colapsa
// la gestion en una sola fase generica (1 = "En gestion") y permite cerrar
// desde ahi sin pasar por insumos/proveedor; MAINTENANCE conserva exactamente
// el flujo de 5 fases existente. No es un editor libre: son solo dos grafos
// fijos, elegidos por tenant.
export const VALID_NEXT_FASE_BY_WORKFLOW: Record<PqrsWorkflowType, Record<number, number[]>> = {
  MAINTENANCE: { 0: [1], 1: [2, 3], 2: [4], 3: [4], 4: [5] },
  SIMPLE: { 0: [1], 1: [5] },
};
