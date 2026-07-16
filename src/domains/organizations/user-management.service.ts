import { AuditAction, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

const MANAGEABLE_ROLES: Role[] = ["ADMIN", "CONSEJO", "RESIDENTE"];

export async function updateManagedUser({
  tenantId, actorUserId, targetUserId, role, isActive, bloque, apto, origin,
}: {
  tenantId: string; actorUserId: string; targetUserId: string; role?: Role; isActive?: boolean;
  bloque?: number | null; apto?: number | null; origin?: string | null;
}) {
  if (role && !MANAGEABLE_ROLES.includes(role)) throw new Error("Rol invalido");
  if (targetUserId === actorUserId && ((role && role !== "ADMIN") || isActive === false)) throw new Error("No puedes cambiar tu propio rol ni desactivar tu cuenta");
  const target = await prisma.user.findFirst({ where: { id: targetUserId, tenantId }, select: { id: true, role: true, isActive: true } });
  if (!target) throw new Error("Usuario no encontrado");
  const user = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      ...(role ? { role } : {}), ...(isActive !== undefined ? { isActive } : {}),
      ...(bloque !== undefined ? { bloque } : {}), ...(apto !== undefined ? { apto } : {}),
    },
    select: { id: true, name: true, email: true, role: true, bloque: true, apto: true, phone: true, isActive: true, createdAt: true },
  });
  const action = isActive === false ? AuditAction.USER_DEACTIVATED : isActive === true ? AuditAction.USER_REACTIVATED : AuditAction.USER_UPDATED;
  await registerAuditLog({ actorUserId, tenantId, action, targetType: "User", targetId: targetUserId, origin, metadata: { before: target, after: { role: user.role, isActive: user.isActive } } });
  return user;
}
