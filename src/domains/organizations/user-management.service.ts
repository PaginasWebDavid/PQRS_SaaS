import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

const MANAGEABLE_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];

export async function updateManagedUser({
  tenantId,
  actorUserId,
  targetUserId,
  role,
  isActive,
  bloque,
  apto,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  targetUserId: string;
  role?: Role;
  isActive?: boolean;
  bloque?: number | null;
  apto?: number | null;
  origin?: string | null;
}) {
  if (role && !MANAGEABLE_ROLES.includes(role)) throw new Error("Rol invalido");
  bloque = normalizeLocation(bloque, "Bloque", 999);
  apto = normalizeLocation(apto, "Apartamento", 9999);
  if (
    targetUserId === actorUserId &&
    ((role && role !== "ADMIN") || isActive === false)
  ) {
    throw new Error("No puedes cambiar tu propio rol ni desactivar tu cuenta");
  }

  const user = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "User"
      WHERE id = ${targetUserId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    await tx.$queryRaw`
      SELECT id FROM "User"
      WHERE "tenantId" = ${tenantId} AND role = 'ADMIN' AND "isActive" = true
      FOR UPDATE
    `;

    const target = await tx.user.findFirst({
      where: { id: targetUserId, tenantId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target || !MANAGEABLE_ROLES.includes(target.role)) {
      throw new Error("Usuario no encontrado");
    }

    const effectiveRole = role ?? target.role;
    if (effectiveRole !== "RESIDENTE" && (bloque != null || apto != null)) {
      throw new Error("La ubicacion solo aplica a residentes");
    }
    if (
      target.role === "ADMIN" &&
      target.isActive &&
      ((role && role !== "ADMIN") || isActive === false)
    ) {
      const activeAdmins = await tx.user.count({
        where: { tenantId, role: "ADMIN", isActive: true },
      });
      if (activeAdmins <= 1) {
        throw new Error(
          "El conjunto debe conservar al menos un administrador activo"
        );
      }
    }

    const data = {
      ...(role ? { role } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(effectiveRole === "RESIDENTE"
        ? {
            ...(bloque !== undefined ? { bloque } : {}),
            ...(apto !== undefined ? { apto } : {}),
          }
        : role
          ? { bloque: null, apto: null }
          : {}),
    };
    const updated = await tx.user.updateMany({
      where: { id: targetUserId, tenantId },
      data,
    });
    if (updated.count !== 1) throw new Error("Usuario no encontrado");
    const user = await tx.user.findFirstOrThrow({
      where: { id: targetUserId, tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        bloque: true,
        apto: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action:
          isActive === false
            ? AuditAction.USER_DEACTIVATED
            : isActive === true
              ? AuditAction.USER_REACTIVATED
              : AuditAction.USER_UPDATED,
        targetType: "User",
        targetId: targetUserId,
        origin,
        metadata: {
          before: target,
          after: { role: user.role, isActive: user.isActive },
        },
      },
      tx
    );

    return user;
  });

  return user;
}

function normalizeLocation(
  value: number | null | undefined,
  label: string,
  max: number
) {
  if (value === undefined || value === null) return value;
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(label + " invalido");
  }
  return value;
}