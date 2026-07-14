import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

export const NotificationTypes = {
  INVITATION_RECEIVED: "INVITATION_RECEIVED",
  INVITATION_ACCEPTED: "INVITATION_ACCEPTED",
  PQRS_CREATED: "PQRS_CREATED",
  PQRS_UPDATED: "PQRS_UPDATED",
  PQRS_CLOSED: "PQRS_CLOSED",
  LICENSE_EXPIRING: "LICENSE_EXPIRING",
  LICENSE_SUSPENDED: "LICENSE_SUSPENDED",
  PAYMENT_APPROVED: "PAYMENT_APPROVED",
  SUPPORT_TICKET_RESPONDED: "SUPPORT_TICKET_RESPONDED",
} as const;

export type NotificationType = (typeof NotificationTypes)[keyof typeof NotificationTypes];

export async function createNotification({
  tenantId, userId, type, title, message, resourceType, resourceId,
}: {
  tenantId: string; userId: string; type: NotificationType | string; title: string; message: string;
  resourceType?: string | null; resourceId?: string | null;
}) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true }, select: { id: true } });
  if (!user) throw new Error("No se puede crear una notificacion para un usuario de otro conjunto");

  const notification = await prisma.notification.create({
    data: { tenantId, userId, type, title, message, resourceType: resourceType ?? null, resourceId: resourceId ?? null },
  });
  await registerAuditLog({
    tenantId, action: AuditAction.NOTIFICATION_CREATED, targetType: "Notification", targetId: notification.id,
    resourceType, resourceId, metadata: { type, userId, title },
  });
  return notification;
}

export async function listNotificationsForUser({ tenantId, userId }: { tenantId: string; userId: string }) {
  return prisma.notification.findMany({ where: { tenantId, userId }, orderBy: { createdAt: "desc" }, take: 50 });
}

export async function markNotificationRead({ tenantId, userId, notificationId }: { tenantId: string; userId: string; notificationId: string }) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, tenantId, userId } });
  if (!notification) throw new Error("Notificacion no encontrada para este usuario");
  return prisma.notification.update({ where: { id: notificationId }, data: { readAt: notification.readAt ?? new Date() } });
}

export async function markAllNotificationsRead({ tenantId, userId }: { tenantId: string; userId: string }) {
  const user = await prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } });
  if (!user) throw new Error("Usuario no encontrado en este conjunto");
  const readAt = new Date();
  const result = await prisma.notification.updateMany({ where: { tenantId, userId, readAt: null }, data: { readAt } });
  return { count: result.count, readAt };
}
