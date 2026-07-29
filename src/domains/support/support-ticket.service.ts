import { AuditAction, Role, SupportTicketCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification } from "@/domains/notifications/notification.service";
import { sendEmailSafe, renderEmailLayout } from "@/lib/email";

function escapeSupportHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeEmailSubject(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 160);
}

// Categorias vigentes para tickets nuevos (Fase R1). TECNICO/FACTURACION/CUENTA/OTRO
// siguen existiendo en el enum solo por filas historicas; el codigo nuevo nunca
// las asigna. BILLING es exclusiva de ADMIN (categoria administrativa/comercial);
// RESIDENTE y CONSEJO solo ven problemas tecnicos de la plataforma.
export const RESIDENT_SUPPORT_CATEGORIES: SupportTicketCategory[] = ["TECHNICAL", "ACCESS", "PRIVACY_SECURITY"];
export const ADMIN_SUPPORT_CATEGORIES: SupportTicketCategory[] = ["TECHNICAL", "ACCESS", "PRIVACY_SECURITY", "BILLING"];

export function allowedSupportCategoriesForRole(role: Role | null | undefined): SupportTicketCategory[] {
  return role === "ADMIN" ? ADMIN_SUPPORT_CATEGORIES : RESIDENT_SUPPORT_CATEGORIES;
}

export function isAllowedSupportCategory(role: Role | null | undefined, category: unknown): category is SupportTicketCategory {
  return typeof category === "string" && allowedSupportCategoriesForRole(role).includes(category as SupportTicketCategory);
}

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

// ADMIN ve todos los tickets de SU tenant (propios y de otros miembros), nunca
// de otro conjunto. Sigue siendo solo lectura: responder/cerrar sigue siendo
// exclusivo de SUPER_ADMIN via listSupportTicketsForSuperAdmin/respondToSupportTicket.
export async function listSupportTicketsForTenantAdmin({ tenantId }: { tenantId: string }) {
  return prisma.supportTicket.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
}

const VALID_STATUSES = ["ABIERTA", "RESPONDIDA", "CERRADA"] as const;

export async function listSupportTicketsForSuperAdmin({ status, tenantId }: { status?: string; tenantId?: string }) {
  const validStatus = (VALID_STATUSES as readonly string[]).includes(status || "") ? (status as (typeof VALID_STATUSES)[number]) : undefined;
  return prisma.supportTicket.findMany({
    where: { ...(validStatus ? { status: validStatus } : {}), ...(tenantId ? { tenantId } : {}) },
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

  const safeName = escapeSupportHtml(ticket.createdBy.name);
  const safeSubject = escapeSupportHtml(ticket.subject);
  const safeResponse = escapeSupportHtml(response).replace(/\r?\n/g, "<br />");

  await sendEmailSafe({
    to: ticket.createdBy.email,
    subject: `Respuesta a tu solicitud: ${sanitizeEmailSubject(ticket.subject)}`,
    html: renderEmailLayout({
      accent: close ? "success" : "navy",
      eyebrow: "Soporte",
      heading: "Respondimos tu solicitud",
      bodyHtml: `
        <p>Hola <strong>${safeName}</strong>,</p>
        <p>Tu solicitud de soporte <strong>${safeSubject}</strong> fue respondida${close ? " y quedó cerrada" : ""}:</p>
        <div style="background:#F5F5F7;border-radius:12px;padding:16px 18px;margin:16px 0;color:#1D1D1F;">${safeResponse}</div>
      `,
      footerNote: "Puedes ver el historial completo de tus solicitudes en el Centro de ayuda dentro de la plataforma.",
    }),
    tenantId: ticket.tenantId,
    template: "support_ticket_response",
  });

  return updated;
}
