import { AuditAction, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deleteFromStorage } from "@/lib/storage";
import { normalizeCorrectionReason } from "./pqrs-correction-policy";

export class PqrsEvidenceError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID",
    message: string
  ) {
    super(message);
    this.name = "PqrsEvidenceError";
  }
}

type Cleanup = (path: string, access: { tenantId: string; folders: Array<"fotos" | "evidencias"> }) => Promise<void>;

function requireAdmin(role: Role) {
  if (role !== "ADMIN") throw new PqrsEvidenceError("FORBIDDEN", "No tiene permisos");
}

function reasonFrom(value: unknown) {
  try { return normalizeCorrectionReason(value); }
  catch { throw new PqrsEvidenceError("INVALID", "El motivo debe tener entre 10 y 500 caracteres"); }
}

export async function withdrawPqrsFileEvidence(input: {
  tenantId: string;
  pqrsId: string;
  actorUserId: string;
  actorRole: Role;
  reason: unknown;
  cleanup?: Cleanup;
}) {
  requireAdmin(input.actorRole);
  const reason = reasonFrom(input.reason);
  const result = await prisma.$transaction(async (tx) => {
    const membership = await tx.tenantMembership.findFirst({
      where: { tenantId: input.tenantId, userId: input.actorUserId, role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (!membership) throw new PqrsEvidenceError("NOT_FOUND", "Evidencia no encontrada");
    const pqrs = await tx.pqrs.findFirst({
      where: { id: input.pqrsId, tenantId: input.tenantId },
      select: {
        id: true,
        estado: true,
        evidenciaArchivoPath: true,
        evidenciaArchivoUrl: true,
        evidenciaArchivoData: true,
        evidenciaArchivoNombre: true,
        evidenciaArchivoTipo: true,
        evidenciaArchivoSize: true,
        evidenciaArchivoRetiradaAt: true,
      },
    });
    if (!pqrs || pqrs.evidenciaArchivoRetiradaAt || (!pqrs.evidenciaArchivoPath && !pqrs.evidenciaArchivoData && !pqrs.evidenciaArchivoUrl)) {
      throw new PqrsEvidenceError("NOT_FOUND", "Evidencia no encontrada");
    }
    const removedAt = new Date();
    await tx.pqrs.update({
      where: { id: pqrs.id },
      data: {
        evidenciaArchivoData: null,
        evidenciaArchivoUrl: null,
        evidenciaArchivoPath: null,
        // Se conserva en un campo privado (nunca leido fuera de este servicio)
        // para poder reintentar la limpieza fisica si el cleanup falla.
        evidenciaArchivoRetiroStoragePath: pqrs.evidenciaArchivoPath,
        evidenciaArchivoRetiradaAt: removedAt,
        evidenciaArchivoRetiradaPorId: input.actorUserId,
        evidenciaArchivoRetiroMotivo: reason,
      },
    });
    await tx.historialPqrs.create({
      data: {
        tenantId: input.tenantId,
        pqrsId: pqrs.id,
        estadoAntes: pqrs.estado,
        estadoDespues: pqrs.estado,
        nota: `Evidencia retirada por administracion: ${reason}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        action: AuditAction.PQRS_UPDATED,
        targetType: "PqrsEvidence",
        targetId: pqrs.id,
        resourceType: "Pqrs",
        resourceId: pqrs.id,
        origin: "admin-evidence-withdrawal",
        metadata: {
          event: "pqrs_file_evidence_withdrawn",
          reason,
          fileName: pqrs.evidenciaArchivoNombre,
          contentType: pqrs.evidenciaArchivoTipo,
          size: pqrs.evidenciaArchivoSize,
          hadStoredObject: Boolean(pqrs.evidenciaArchivoPath),
        },
      },
    });
    return { storagePath: pqrs.evidenciaArchivoPath, removedAt };
  });
  await cleanupStorage(result.storagePath, input.tenantId, ["evidencias"], input.cleanup, async () => {
    await prisma.pqrs.update({ where: { id: input.pqrsId }, data: { evidenciaArchivoRetiroStoragePath: null } });
  });
  return { removed: true, removedAt: result.removedAt };
}

export async function withdrawPqrsPhotoEvidence(input: {
  tenantId: string;
  pqrsId: string;
  photoId: string;
  actorUserId: string;
  actorRole: Role;
  reason: unknown;
  cleanup?: Cleanup;
}) {
  requireAdmin(input.actorRole);
  const reason = reasonFrom(input.reason);
  const result = await prisma.$transaction(async (tx) => {
    const membership = await tx.tenantMembership.findFirst({
      where: { tenantId: input.tenantId, userId: input.actorUserId, role: "ADMIN", isActive: true },
      select: { id: true },
    });
    if (!membership) throw new PqrsEvidenceError("NOT_FOUND", "Evidencia no encontrada");
    const photo = await tx.pqrsFoto.findFirst({
      where: { id: input.photoId, pqrsId: input.pqrsId, tenantId: input.tenantId, removedAt: null },
      select: {
        id: true,
        storagePath: true,
        data: true,
        url: true,
        nombre: true,
        tipo: true,
        size: true,
        pqrs: { select: { id: true, estado: true } },
      },
    });
    if (!photo || (!photo.storagePath && !photo.data && !photo.url)) {
      throw new PqrsEvidenceError("NOT_FOUND", "Evidencia no encontrada");
    }
    const removedAt = new Date();
    await tx.pqrsFoto.update({
      where: { id: photo.id },
      data: {
        data: null,
        url: null,
        storagePath: null,
        // Ver nota equivalente en withdrawPqrsFileEvidence.
        retiroStoragePath: photo.storagePath,
        removedAt,
        removedByUserId: input.actorUserId,
        removalReason: reason,
      },
    });
    await tx.historialPqrs.create({
      data: {
        tenantId: input.tenantId,
        pqrsId: photo.pqrs.id,
        estadoAntes: photo.pqrs.estado,
        estadoDespues: photo.pqrs.estado,
        nota: `Foto de evidencia retirada por administracion: ${reason}`,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        action: AuditAction.PQRS_UPDATED,
        targetType: "PqrsPhotoEvidence",
        targetId: photo.id,
        resourceType: "Pqrs",
        resourceId: photo.pqrs.id,
        origin: "admin-evidence-withdrawal",
        metadata: {
          event: "pqrs_photo_evidence_withdrawn",
          reason,
          photoId: photo.id,
          fileName: photo.nombre,
          contentType: photo.tipo,
          size: photo.size,
          hadStoredObject: Boolean(photo.storagePath),
        },
      },
    });
    return { storagePath: photo.storagePath, removedAt };
  });
  await cleanupStorage(result.storagePath, input.tenantId, ["fotos"], input.cleanup, async () => {
    await prisma.pqrsFoto.update({ where: { id: input.photoId }, data: { retiroStoragePath: null } });
  });
  return { removed: true, removedAt: result.removedAt };
}

async function cleanupStorage(
  path: string | null,
  tenantId: string,
  folders: Array<"fotos" | "evidencias">,
  cleanup: Cleanup = deleteFromStorage,
  onCleaned?: () => Promise<void>
) {
  if (!path) return;
  try {
    await cleanup(path, { tenantId, folders });
    // Limpieza confirmada: se puede liberar la referencia de reintento.
    await onCleaned?.();
  } catch {
    // El objeto queda referenciado en el tombstone privado para reintento; no
    // se revierte el retiro logico ya confirmado.
    console.error("[pqrs/evidence-withdrawal] No se pudo limpiar el objeto retirado");
  }
}

export function mapPqrsEvidenceError(error: unknown) {
  if (!(error instanceof PqrsEvidenceError)) return { status: 500, message: "No se pudo retirar la evidencia" };
  if (error.code === "FORBIDDEN") return { status: 403, message: "No tiene permisos" };
  if (error.code === "NOT_FOUND") return { status: 404, message: "Evidencia no encontrada" };
  return { status: 400, message: error.message };
}