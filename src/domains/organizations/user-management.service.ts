import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

const MANAGEABLE_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];

export async function updateManagedUser({
  tenantId, actorUserId, targetUserId, role, isActive, bloque, apto, origin,
}: {
  tenantId: string; actorUserId: string; targetUserId: string; role?: Role;
  isActive?: boolean; bloque?: number | null; apto?: number | null; origin?: string | null;
}) {
  if (role && !MANAGEABLE_ROLES.includes(role)) throw new Error("Rol invalido");
  bloque = normalizeLocation(bloque, "Bloque", 999);
  apto = normalizeLocation(apto, "Apartamento", 9999);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "TenantMembership"
      WHERE "userId" = ${targetUserId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM "TenantMembership"
      WHERE "tenantId" = ${tenantId} AND role = 'ADMIN' AND "isActive" = true
      FOR UPDATE
    `;
    const target = await tx.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: targetUserId, tenantId } },
      select: { id: true, userId: true, role: true, isActive: true },
    });
    if (!target || !MANAGEABLE_ROLES.includes(target.role)) throw new Error("Usuario no encontrado");
    if (target.userId === actorUserId && ((role && role !== "ADMIN") || isActive === false)) {
      throw new Error("No puedes cambiar tu propio rol ni desactivar tu membresia");
    }
    const effectiveRole = role ?? target.role;
    if (effectiveRole !== "RESIDENTE" && (bloque != null || apto != null)) {
      throw new Error("La ubicacion solo aplica a residentes");
    }
    if (target.role === "ADMIN" && target.isActive && ((role && role !== "ADMIN") || isActive === false)) {
      const activeAdmins = await tx.tenantMembership.count({
        where: { tenantId, role: "ADMIN", isActive: true },
      });
      if (activeAdmins <= 1) throw new Error("El conjunto debe conservar al menos un administrador activo");
    }
    const updated = await tx.tenantMembership.updateMany({
      where: { id: target.id, userId: targetUserId, tenantId },
      data: {
        ...(role ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(effectiveRole === "RESIDENTE"
          ? { ...(bloque !== undefined ? { bloque } : {}), ...(apto !== undefined ? { apto } : {}) }
          : role ? { bloque: null, apto: null } : {}),
      },
    });
    if (updated.count !== 1) throw new Error("Usuario no encontrado");
    const membership = await tx.tenantMembership.findUniqueOrThrow({
      where: { id: target.id },
      select: {
        id: true, role: true, bloque: true, apto: true, isActive: true, createdAt: true,
        user: { select: { id: true, name: true, email: true, phone: true, image: true } },
      },
    });
    await registerAuditLog({
      actorUserId, tenantId,
      action: isActive === false ? AuditAction.USER_DEACTIVATED : isActive === true ? AuditAction.USER_REACTIVATED : AuditAction.USER_UPDATED,
      targetType: "TenantMembership", targetId: membership.id, origin,
      metadata: { userId: targetUserId, before: target, after: { role: membership.role, isActive: membership.isActive } },
    }, tx);
    return flattenMembership(membership);
  });
}

function flattenMembership(membership: {
  id: string; role: Role; bloque: number | null; apto: number | null; isActive: boolean; createdAt: Date;
  user: { id: string; name: string; email: string; phone: string | null; image: string | null };
}) {
  return { ...membership.user, membershipId: membership.id, role: membership.role, bloque: membership.bloque, apto: membership.apto, isActive: membership.isActive, createdAt: membership.createdAt };
}
function normalizeLocation(value: number | null | undefined, label: string, max: number) {
  if (value === undefined || value === null) return value;
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(label + " invalido");
  return value;
}