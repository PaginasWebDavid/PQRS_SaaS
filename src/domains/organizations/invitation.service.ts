import { AuditAction, InvitationStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailSafe } from "@/lib/email";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification, NotificationTypes } from "@/domains/notifications/notification.service";

const INVITATION_TOKEN_BYTES = 32;
const DEFAULT_EXPIRES_HOURS = 72;
const INVITABLE_ROLES: Role[] = ["ADMIN", "ASISTENTE", "CONSEJO", "RESIDENTE"];

export function createInvitationToken() {
  return crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function invitationUrl(token: string) {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${baseUrl}/invitacion?token=${encodeURIComponent(token)}`;
}

function ensureInvitableRole(role: Role) {
  if (!INVITABLE_ROLES.includes(role)) {
    throw new Error("Rol no permitido para invitacion");
  }
}

async function sendInvitationEmail({
  tenantId,
  email,
  tenantName,
  token,
}: {
  tenantId: string;
  email: string;
  tenantName: string;
  token: string;
}) {
  const url = invitationUrl(token);
  return sendEmailSafe({
    tenantId,
    to: email,
    template: "invitation",
    subject: `Invitacion a PQRS Services - ${tenantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #122545;">Te invitaron a PQRS Services</h2>
        <p>Has recibido una invitacion para acceder a <strong>${tenantName}</strong>.</p>
        <p>Haz clic en el siguiente enlace para crear tu cuenta:</p>
        <p><a href="${url}" style="display:inline-block;background:#122545;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;">Aceptar invitacion</a></p>
        <p style="color:#666;font-size:13px;">Si no esperabas esta invitacion, puedes ignorar este mensaje.</p>
      </div>
    `,
  });
}

export async function expirePendingInvitations(now = new Date()) {
  const expired = await prisma.invitation.updateMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });

  return expired.count;
}

export async function createInvitation({
  tenantId,
  email,
  role,
  invitedById,
  expiresInHours = DEFAULT_EXPIRES_HOURS,
  origin,
}: {
  tenantId: string;
  email: string;
  role: Role;
  invitedById?: string | null;
  expiresInHours?: number;
  origin?: string | null;
}) {
  ensureInvitableRole(role);
  const normalizedEmail = normalizeEmail(email);
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new Error("Conjunto no encontrado");

  await expirePendingInvitations();

  const activeUser = await prisma.user.findFirst({
    where: { tenantId, email: normalizedEmail, isActive: true },
    select: { id: true },
  });
  if (activeUser) throw new Error("Este correo ya pertenece a un usuario activo del conjunto");
  const duplicate = await prisma.invitation.findFirst({
    where: { tenantId, email: normalizedEmail, status: "PENDING", expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (duplicate) throw new Error("Ya existe una invitacion pendiente para este correo");

  const invitation = await prisma.invitation.create({
    data: {
      tenantId,
      email: normalizedEmail,
      role,
      tokenHash,
      status: "PENDING",
      expiresAt,
      invitedById: invitedById ?? null,
    },
  });

  await registerAuditLog({
    actorUserId: invitedById,
    tenantId,
    action: AuditAction.INVITATION_CREATED,
    targetType: "Invitation",
    targetId: invitation.id,
    origin,
    metadata: { email: normalizedEmail, role, expiresAt: expiresAt.toISOString() },
  });

  const emailResult = await sendInvitationEmail({ tenantId, email: normalizedEmail, tenantName: tenant.name, token });

  if (invitedById) {
    await createNotification({
      tenantId,
      userId: invitedById,
      type: NotificationTypes.INVITATION_RECEIVED,
      title: "Invitacion enviada",
      message: `Se envio una invitacion a ${normalizedEmail}.`,
      resourceType: "Invitation",
      resourceId: invitation.id,
    }).catch(() => null);
  }

  return { invitation, token, invitationUrl: invitationUrl(token), emailResult };
}

export async function resendInvitation({
  tenantId,
  invitationId,
  actorUserId,
  origin,
}: {
  tenantId: string;
  invitationId: string;
  actorUserId?: string | null;
  origin?: string | null;
}) {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId },
    include: { tenant: { select: { name: true } } },
  });

  if (!invitation) throw new Error("Invitacion no encontrada");
  if (invitation.status !== "PENDING") throw new Error("Solo se pueden reenviar invitaciones pendientes");
  if (invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    throw new Error("La invitacion esta vencida");
  }

  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const updated = await prisma.invitation.update({
    where: { id: invitation.id },
    data: { tokenHash, expiresAt: new Date(Date.now() + DEFAULT_EXPIRES_HOURS * 60 * 60 * 1000) },
  });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.INVITATION_RESENT,
    targetType: "Invitation",
    targetId: invitation.id,
    origin,
    metadata: { email: invitation.email, role: invitation.role },
  });

  const emailResult = await sendInvitationEmail({ tenantId, email: invitation.email, tenantName: invitation.tenant.name, token });
  return { invitation: updated, token, invitationUrl: invitationUrl(token), emailResult };
}

export async function cancelInvitation({
  tenantId,
  invitationId,
  actorUserId,
  origin,
}: {
  tenantId: string;
  invitationId: string;
  actorUserId?: string | null;
  origin?: string | null;
}) {
  const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, tenantId } });
  if (!invitation) throw new Error("Invitacion no encontrada");
  if (invitation.status !== "PENDING") throw new Error("Solo se pueden cancelar invitaciones pendientes");

  const updated = await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "CANCELLED" } });

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.INVITATION_CANCELLED,
    targetType: "Invitation",
    targetId: invitation.id,
    origin,
    metadata: { email: invitation.email, role: invitation.role },
  });

  return updated;
}

export async function acceptInvitation({
  token,
  password,
  name,
  bloque,
  apto,
  origin,
}: {
  token: string;
  password: string;
  name: string;
  bloque?: number | null;
  apto?: number | null;
  origin?: string | null;
}) {
  if (!token || token.length < 20) throw new Error("Token de invitacion invalido");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error("La contrasena debe tener al menos 8 caracteres, una letra y un numero");
  }
  const tokenHash = hashInvitationToken(token);
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash } });

  if (!invitation) throw new Error("Invitacion no encontrada");
  if (invitation.status === "ACCEPTED") throw new Error("Esta invitacion ya fue utilizada");
  if (invitation.status === "CANCELLED") throw new Error("Esta invitacion fue cancelada");
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    await registerAuditLog({
      tenantId: invitation.tenantId,
      action: AuditAction.INVITATION_EXPIRED,
      targetType: "Invitation",
      targetId: invitation.id,
      origin,
      metadata: { email: invitation.email, role: invitation.role },
    });
    throw new Error("Esta invitacion esta vencida");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedEmail = normalizeEmail(invitation.email);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { email: normalizedEmail } });
    if (existing?.tenantId && existing.tenantId !== invitation.tenantId) throw new Error("El correo ya pertenece a otro conjunto");
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            name: name.trim() || existing.name,
            password: passwordHash,
            role: invitation.role,
            tenantId: invitation.tenantId,
            bloque: invitation.role === "RESIDENTE" ? bloque ?? existing.bloque : null,
            apto: invitation.role === "RESIDENTE" ? apto ?? existing.apto : null,
            isActive: true,
            onboardingCompletedAt: null,
          },
        })
      : await tx.user.create({
          data: {
            email: normalizedEmail,
            name: name.trim() || normalizedEmail.split("@")[0],
            password: passwordHash,
            role: invitation.role,
            tenantId: invitation.tenantId,
            bloque: invitation.role === "RESIDENTE" ? bloque ?? null : null,
            apto: invitation.role === "RESIDENTE" ? apto ?? null : null,
            isActive: true,
          },
        });

    const accepted = await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    return { user, invitation: accepted };
  });

  await registerAuditLog({
    actorUserId: result.user.id,
    tenantId: invitation.tenantId,
    action: AuditAction.INVITATION_ACCEPTED,
    targetType: "Invitation",
    targetId: invitation.id,
    origin,
    metadata: { email: normalizedEmail, role: invitation.role, userId: result.user.id },
  });

  await createNotification({
    tenantId: invitation.tenantId,
    userId: result.user.id,
    type: NotificationTypes.INVITATION_RECEIVED,
    title: "Bienvenido a PQRS Services",
    message: "Tu cuenta fue activada correctamente.",
    resourceType: "Invitation",
    resourceId: invitation.id,
  }).catch(() => null);

  const admins = await prisma.user.findMany({
    where: { tenantId: invitation.tenantId, role: "ADMIN", isActive: true },
    select: { id: true },
  });
  await Promise.allSettled(admins.map((admin) => createNotification({
    tenantId: invitation.tenantId,
    userId: admin.id,
    type: NotificationTypes.INVITATION_ACCEPTED,
    title: "Invitacion aceptada",
    message: result.user.name + " acepto la invitacion.",
    resourceType: "User",
    resourceId: result.user.id,
  })));
  await sendEmailSafe({
    tenantId: invitation.tenantId,
    to: result.user.email,
    template: "account_confirmation",
    subject: "Tu cuenta de PQRS Services esta activa",
    html: "<p>Tu cuenta fue activada correctamente. Ya puedes iniciar sesion.</p>",
  });

  return result;
}

export async function inspectInvitation(token: string) {
  if (!token || token.length < 20) throw new Error("Token de invitacion invalido");
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { tenant: { select: { id: true, name: true } } },
  });
  if (!invitation) throw new Error("Invitacion no encontrada");
  if (invitation.status === "ACCEPTED") throw new Error("Esta invitacion ya fue utilizada");
  if (invitation.status === "CANCELLED") throw new Error("Esta invitacion fue cancelada");
  if (invitation.status === "EXPIRED" || invitation.expiresAt < new Date()) {
    if (invitation.status !== "EXPIRED") {
      await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    }
    throw new Error("Esta invitacion esta vencida");
  }
  return { email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, tenant: invitation.tenant };
}

export async function listInvitationsForTenant({ tenantId, status }: { tenantId: string; status?: InvitationStatus }) {
  await expirePendingInvitations();
  return prisma.invitation.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      updatedAt: true,
      invitedBy: { select: { id: true, name: true, email: true } },
    },
  });
}



