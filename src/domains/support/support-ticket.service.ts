import { AuditAction, SupportTicketCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification } from "@/domains/notifications/notification.service";
import { sendEmailSafe } from "@/lib/email";

export async function createSupportTicket({
  actorUserId,
  tenantId,
  subject,
  message,
  category,
}: {
  actorUserId: string;
  tenantId: string;
  subject: string;
  message: string;
  category: SupportTicketCategory;
}) {
  const ticket = await prisma.supportTicket.create({
    data: { tenantId, createdByUserId: actorUserId, subject, message, category },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.SUPPORT_TICKET_CREATED,
    targetType: "SupportTicket",
    targetId: ticket.id,
    metadata: { subject, category },
  });

  return ticket;
}

export async function listSupportTicketsForUser({ tenantId, userId }: { tenantId: string; userId: string }) {
  return prisma.supportTicket.findMany({
    where: { tenantId, createdByUserId: userId },
    orderBy: { createdAt: "desc" },
  });
}

const VALID_STATUSES = ["ABIERTA", "RESPONDIDA", "CERRADA"] as const;

export async function listSupportTicketsForSuperAdmin({ status }: { status?: string }) {
  const validStatus = (VALID_STATUSES as readonly string[]).includes(status || "") ? (status as (typeof VALID_STATUSES)[number]) : undefined;
  return prisma.supportTicket.findMany({
    where: validStatus ? { status: validStatus } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      tenant: { select: { name: true } },
      createdBy: { select: { name: true, email: true } },
    },
  });
}

export async function getSupportTicketCounts() {
  const [abierta, respondida, cerrada, total] = await Promise.all([
    prisma.supportTicket.count({ where: { status: "ABIERTA" } }),
    prisma.supportTicket.count({ where: { status: "RESPONDIDA" } }),
    prisma.supportTicket.count({ where: { status: "CERRADA" } }),
    prisma.supportTicket.count(),
  ]);
  return { abierta, respondida, cerrada, total };
}

export async function respondToSupportTicket({
  actorUserId,
  ticketId,
  response,
  close,
}: {
  actorUserId: string;
  ticketId: string;
  response: string;
  close: boolean;
}) {
  const ticket = await prisma.supportTicket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { createdBy: { select: { id: true, name: true, email: true } }, tenant: { select: { id: true, name: true } } },
  });

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      response,
      respondedAt: new Date(),
      respondedByUserId: actorUserId,
      status: close ? "CERRADA" : "RESPONDIDA",
    },
  });

  await registerAuditLog({
    actorUserId,
    tenantId: ticket.tenantId,
    action: close ? AuditAction.SUPPORT_TICKET_CLOSED : AuditAction.SUPPORT_TICKET_RESPONDED,
    targetType: "SupportTicket",
    targetId: ticket.id,
    metadata: { subject: ticket.subject, tenantName: ticket.tenant.name },
  });

  await createNotification({
    tenantId: ticket.tenantId,
    userId: ticket.createdByUserId,
    type: "SUPPORT_TICKET_RESPONDED",
    title: "Respondieron tu solicitud de soporte",
    message: `${ticket.subject}: ${response}`,
    resourceType: "SupportTicket",
    resourceId: ticket.id,
  });

  await sendEmailSafe({
    to: ticket.createdBy.email,
    subject: `Respuesta a tu solicitud: ${ticket.subject}`,
    html: `<p>Hola ${ticket.createdBy.name},</p><p>Tu solicitud de soporte <strong>${ticket.subject}</strong> fue respondida:</p><blockquote>${response}</blockquote>`,
    tenantId: ticket.tenantId,
    template: "support_ticket_response",
  });

  return updated;
}
