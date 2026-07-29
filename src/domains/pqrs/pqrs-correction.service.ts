import { createHash } from "node:crypto";
import { AuditAction, Prisma, type PqrsWorkflowType, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRecord } from "./pqrs-security";
import {
  CORRECTABLE_PQRS_FIELDS,
  normalizeCorrectionPhase,
  normalizeCorrectionReason,
  normalizeCorrectionRoute,
  normalizeLocationNumber,
  normalizeOperationId,
  PqrsCorrectionValidationError,
  validateWorkflowPhase,
} from "./pqrs-correction-policy";

export class PqrsCorrectionError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "NO_CHANGES" | "CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "PqrsCorrectionError";
  }
}

type CorrectionInput = {
  tenantId: string;
  pqrsId: string;
  actorUserId: string;
  actorRole: Role;
  body: unknown;
  origin?: string | null;
};

type TechnicalValue = string | number | boolean | null;
type TechnicalChange = { before: TechnicalValue; after: TechnicalValue };

function technicalValue(value: unknown): TechnicalValue {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return String(value);
}

// Huella determinista del payload aplicado, sin el operationId. Reutilizar el
// mismo operationId con un payload distinto debe producir un hash distinto,
// para poder distinguir un reintento legitimo de un reuso incorrecto.
function requestFingerprint(body: Record<string, unknown>): string {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (key !== "operationId") rest[key] = body[key];
  }
  const sortedKeys = Object.keys(rest).sort();
  const canonical = JSON.stringify(sortedKeys.map((key) => [key, rest[key]]));
  return createHash("sha256").update(canonical).digest("hex");
}

export async function correctPqrs(input: CorrectionInput) {
  if (input.actorRole !== "ADMIN") throw new PqrsCorrectionError("FORBIDDEN", "No tiene permisos");
  if (!isRecord(input.body)) throw new PqrsCorrectionError("INVALID", "Cuerpo invalido");
  const body = input.body;
  if (Object.keys(body).some((key) => !CORRECTABLE_PQRS_FIELDS.has(key))) {
    throw new PqrsCorrectionError("INVALID", "Campos no permitidos");
  }

  let operationId: string;
  let reason: string;
  try {
    operationId = normalizeOperationId(body.operationId);
    reason = normalizeCorrectionReason(body.reason);
  } catch (error) {
    throw invalid(error);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`pqrs-correction:${input.tenantId}:${operationId}`}, 0))`;

      const actorMembership = await tx.tenantMembership.findFirst({
        where: { tenantId: input.tenantId, userId: input.actorUserId, role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (!actorMembership) throw new PqrsCorrectionError("NOT_FOUND", "PQRS no encontrada");

      const fingerprint = requestFingerprint(body);
      const previousCorrection = await tx.pqrsCorrection.findUnique({
        where: { tenantId_operationId: { tenantId: input.tenantId, operationId } },
        select: { id: true, pqrsId: true, requestHash: true },
      });
      if (previousCorrection) {
        if (previousCorrection.pqrsId !== input.pqrsId || previousCorrection.requestHash !== fingerprint) {
          throw new PqrsCorrectionError("CONFLICT", "La operacion no se puede reutilizar con datos distintos");
        }
        const existing = await tx.pqrs.findFirst({ where: { id: input.pqrsId, tenantId: input.tenantId } });
        if (!existing) throw new PqrsCorrectionError("NOT_FOUND", "PQRS no encontrada");
        return { pqrs: existing, correctionId: previousCorrection.id, idempotent: true };
      }

      const current = await tx.pqrs.findFirst({ where: { id: input.pqrsId, tenantId: input.tenantId } });
      if (!current) throw new PqrsCorrectionError("NOT_FOUND", "PQRS no encontrada");

      const update: Prisma.PqrsUncheckedUpdateInput = {};
      const changes: Record<string, TechnicalChange> = {};
      const setChange = (field: string, before: unknown, after: unknown) => {
        const normalizedBefore = technicalValue(before);
        const normalizedAfter = technicalValue(after);
        if (normalizedBefore === normalizedAfter) return;
        changes[field] = { before: normalizedBefore, after: normalizedAfter };
      };

      if (body.categoryId !== undefined) {
        if (typeof body.categoryId !== "string" || !body.categoryId.trim()) throw new PqrsCorrectionError("INVALID", "Categoria invalida");
        const category = await tx.pqrsCategory.findFirst({
          where: { id: body.categoryId.trim(), tenantId: input.tenantId, isActive: true },
        });
        if (!category) throw new PqrsCorrectionError("NOT_FOUND", "PQRS no encontrada");
        setChange("categoryId", current.categoryId, category.id);
        setChange("categorySnapshot", current.categorySnapshot, category.displayName);
        setChange("asunto", current.asunto, category.slug);
        update.categoryId = category.id;
        update.categorySnapshot = category.displayName;
        update.asunto = category.slug;
      }

      if (body.bloque !== undefined) {
        let bloque: number;
        try { bloque = normalizeLocationNumber(body.bloque, "Bloque", 999); } catch (error) { throw invalid(error); }
        setChange("bloque", current.bloque, bloque);
        update.bloque = bloque;
      }
      if (body.apto !== undefined) {
        let apto: number;
        try { apto = normalizeLocationNumber(body.apto, "Apartamento", 99999); } catch (error) { throw invalid(error); }
        setChange("apto", current.apto, apto);
        update.apto = apto;
      }

      if (body.gestionadoPorId !== undefined) {
        if (body.gestionadoPorId !== null && typeof body.gestionadoPorId !== "string") {
          throw new PqrsCorrectionError("INVALID", "Responsable invalido");
        }
        const responsibleId = body.gestionadoPorId as string | null;
        if (responsibleId) {
          const membership = await tx.tenantMembership.findFirst({
            where: { tenantId: input.tenantId, userId: responsibleId, role: "ADMIN", isActive: true },
            select: { userId: true },
          });
          if (!membership) throw new PqrsCorrectionError("NOT_FOUND", "PQRS no encontrada");
        }
        setChange("gestionadoPorId", current.gestionadoPorId, responsibleId);
        update.gestionadoPorId = responsibleId;
      }

      let workflowType: PqrsWorkflowType = current.workflowType;
      if (body.workflowType !== undefined) {
        if (body.workflowType !== "SIMPLE" && body.workflowType !== "MAINTENANCE") {
          throw new PqrsCorrectionError("INVALID", "Workflow invalido");
        }
        workflowType = body.workflowType;
        setChange("workflowType", current.workflowType, workflowType);
        update.workflowType = workflowType;
      }

      let faseActual = current.faseActual;
      if (body.faseActual !== undefined) {
        try { faseActual = normalizeCorrectionPhase(body.faseActual); } catch (error) { throw invalid(error); }
        setChange("faseActual", current.faseActual, faseActual);
        update.faseActual = faseActual;
      }

      let faseTipo = current.faseTipo;
      if (body.faseTipo !== undefined) {
        try { faseTipo = normalizeCorrectionRoute(body.faseTipo); } catch (error) { throw invalid(error); }
        setChange("faseTipo", current.faseTipo, faseTipo);
        update.faseTipo = faseTipo;
      }
      try { validateWorkflowPhase({ workflowType, faseActual, faseTipo }); } catch (error) { throw invalid(error); }

      const reopen = body.reopen === true;
      if (body.reopen !== undefined && typeof body.reopen !== "boolean") {
        throw new PqrsCorrectionError("INVALID", "Reapertura invalida");
      }
      if (reopen) {
        if (current.estado !== "TERMINADO") throw new PqrsCorrectionError("INVALID", "La PQRS no esta cerrada");
        setChange("estado", current.estado, "EN_PROGRESO");
        setChange("fechaCierre", current.fechaCierre, null);
        setChange("tiempoRespuestaCierre", current.tiempoRespuestaCierre, null);
        update.estado = "EN_PROGRESO";
        update.fechaCierre = null;
        update.tiempoRespuestaCierre = null;
      }

      if (Object.keys(changes).length === 0) throw new PqrsCorrectionError("NO_CHANGES", "No hay cambios reales");

      const updated = await tx.pqrs.update({ where: { id: current.id }, data: update });
      const correction = await tx.pqrsCorrection.create({
        data: {
          tenantId: input.tenantId,
          pqrsId: current.id,
          actorUserId: input.actorUserId,
          operationId,
          reason,
          changes: changes as Prisma.InputJsonValue,
          requestHash: fingerprint,
        },
      });
      const fields = Object.keys(changes);
      await tx.historialPqrs.create({
        data: {
          tenantId: input.tenantId,
          pqrsId: current.id,
          estadoAntes: current.estado,
          estadoDespues: updated.estado,
          nota: `Correccion administrativa: ${reason} Campos: ${fields.join(", ")}.`,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          tenantId: input.tenantId,
          action: AuditAction.PQRS_UPDATED,
          targetType: "PqrsCorrection",
          targetId: correction.id,
          resourceType: "Pqrs",
          resourceId: current.id,
          origin: input.origin || "admin-pqrs-correction",
          metadata: { operationId, fields, reason, changes },
        },
      });
      return { pqrs: updated, correctionId: correction.id, idempotent: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof PqrsCorrectionError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new PqrsCorrectionError("CONFLICT", "La PQRS cambio; intenta nuevamente");
    }
    throw error;
  }
}

function invalid(error: unknown) {
  return new PqrsCorrectionError(
    "INVALID",
    error instanceof PqrsCorrectionValidationError ? error.message : "Correccion invalida"
  );
}

export function mapPqrsCorrectionError(error: unknown) {
  if (!(error instanceof PqrsCorrectionError)) return { status: 500, message: "No se pudo corregir la PQRS" };
  if (error.code === "FORBIDDEN") return { status: 403, message: "No tiene permisos" };
  if (error.code === "NOT_FOUND") return { status: 404, message: "PQRS no encontrada" };
  if (error.code === "NO_CHANGES" || error.code === "CONFLICT") return { status: 409, message: error.message };
  return { status: 400, message: error.message };
}