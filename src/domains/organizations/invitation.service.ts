import { AuditAction, InvitationStatus, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmailSafe, renderEmailLayout } from "@/lib/email";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotification, NotificationTypes } from "@/domains/notifications/notification.service";
import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import {
  ensureInvitableRole,
  escapeInvitationHtml,
  InvitationDomainError,
  mapInvitationError,
  MAX_BULK_INVITATIONS,
  normalizeInvitationEmail,
  validateInvitationAcceptance,
} from "@/domains/organizations/invitation-security";

const INVITATION_TOKEN_BYTES = 32;
const DEFAULT_EXPIRES_HOURS = 72;

export function createInvitationToken() {
  return crypto.randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function invitationUrl(token: string) {
  const baseUrl = process.env.APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${baseUrl}/invitacion?token=${encodeURIComponent(token)}`;
}

const INVITATION_ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Administrador",
  CONSEJO: "Consejo de Administración",
  RESIDENTE: "Residente",
};

async function sendInvitationEmail({
  tenantId,
  email,
  tenantName,
  role,
  token,
}: {
  tenantId: string;
  email: string;
  tenantName: string;
  role: Role;
  token: string;
}) {
  const url = invitationUrl(token);
  const safeTenantName = escapeInvitationHtml(tenantName);
  const subjectTenantName = tenantName.replace(/[\r\n]+/g, " ").slice(0, 160);
  return sendEmailSafe({
    tenantId,
    to: email,
    template: "invitation",
    subject: `Te invitaron a ${subjectTenantName} en PQRS Services`,
    html: renderEmailLayout({
      accent: "navy",
      eyebrow: "Invitación",
      heading: "Te invitaron a PQRS Services",
      bodyHtml: `
        <p>Has recibido una invitación para acceder a <strong>${safeTenantName}</strong> con el rol de <strong>${escapeInvitationHtml(INVITATION_ROLE_LABEL[role] || role)}</strong>.</p>
        <p>Crea tu contraseña para activar tu cuenta y empezar a usar la plataforma.</p>
      `,
      cta: { label: "Aceptar invitación", url },
      footerNote: "Si no esperabas esta invitación, puedes ignorar este mensaje — tu correo no quedará registrado.",
    }),
  });
}

export async function expirePendingInvitations(
  now = new Date(),
  tenantId?: string
) {
  const expired = await prisma.invitation.updateMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
      ...(tenantId ? { tenantId } : {}),
    },
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
  const safeRole = ensureInvitableRole(role);
  const normalizedEmail = normalizeInvitationEmail(email);
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  const lockKey = `invitation:${tenantId}:${normalizedEmail}`;
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) throw new InvitationDomainError("TENANT_NOT_FOUND");

    await tx.invitation.updateMany({
      where: {
        tenantId,
        email: { equals: normalizedEmail, mode: "insensitive" },
        status: "PENDING",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    });

    const existingUser = await tx.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
      select: { id: true, tenantId: true, role: true, isActive: true },
    });
    const reusableInactiveUser =
      existingUser &&
      existingUser.tenantId === tenantId &&
      existingUser.role !== "SUPER_ADMIN" &&
      !existingUser.isActive;
    if (existingUser && !reusableInactiveUser) {
      throw new InvitationDomainError("INVITATION_CONFLICT");
    }

    const duplicate = await tx.invitation.findFirst({
      where: {
        tenantId,
        email: { equals: normalizedEmail, mode: "insensitive" },
        status: "PENDING",
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (duplicate) throw new InvitationDomainError("INVITATION_CONFLICT");

    const invitation = await tx.invitation.create({
      data: {
        tenantId,
        email: normalizedEmail,
        role: safeRole,
        tokenHash,
        status: "PENDING",
        expiresAt,
        invitedById: invitedById ?? null,
      },
    });

    await registerAuditLog(
      {
        actorUserId: invitedById,
        tenantId,
        action: AuditAction.INVITATION_CREATED,
        targetType: "Invitation",
        targetId: invitation.id,
        origin,
        metadata: {
          email: normalizedEmail,
          role: safeRole,
          expiresAt: expiresAt.toISOString(),
        },
      },
      tx
    );

    return { invitation, tenant };
  });

  const emailResult = await sendInvitationEmail({
    tenantId,
    email: normalizedEmail,
    tenantName: created.tenant.name,
    role: safeRole,
    token,
  });

  if (invitedById) {
    await createNotification({
      tenantId,
      userId: invitedById,
      type: NotificationTypes.INVITATION_RECEIVED,
      title: emailResult.ok ? "Invitacion enviada" : "Invitacion creada",
      message: emailResult.ok
        ? `Se envio una invitacion a ${normalizedEmail}.`
        : `La invitacion para ${normalizedEmail} quedo pendiente de envio.`,
      resourceType: "Invitation",
      resourceId: created.invitation.id,
    }).catch(() => null);
  }

  return {
    invitation: created.invitation,
    token,
    invitationUrl: invitationUrl(token),
    emailResult,
  };
}
export type BulkInvitationResult = {
  email: string;
  ok: boolean;
  emailSent?: boolean;
  error?: string;
};

export async function createBulkInvitations({
  tenantId,
  emails,
  role,
  invitedById,
  origin,
}: {
  tenantId: string;
  emails: string[];
  role: Role;
  invitedById?: string | null;
  origin?: string | null;
}): Promise<BulkInvitationResult[]> {
  const safeRole = ensureInvitableRole(role);
  const uniqueEmails = Array.from(
    new Set(emails.map(normalizeInvitationEmail))
  );
  if (uniqueEmails.length > MAX_BULK_INVITATIONS) {
    throw new Error(
      `El lote supera el maximo de ${MAX_BULK_INVITATIONS} correos`
    );
  }

  // Atomicidad parcial deliberada: cada fila es una invitacion independiente.
  // Un fallo no revierte las filas ya creadas y cada resultado se devuelve sin
  // token, URL privada ni detalle de infraestructura.
  const results: BulkInvitationResult[] = [];
  for (const normalizedEmail of uniqueEmails) {
    try {
      const created = await createInvitation({
        tenantId,
        email: normalizedEmail,
        role: safeRole,
        invitedById,
        origin,
      });
      results.push({
        email: normalizedEmail,
        ok: true,
        emailSent: created.emailResult.ok,
      });
    } catch (error) {
      results.push({
        email: normalizedEmail,
        ok: false,
        error: mapInvitationError(error).message,
      });
    }
  }

  return results;
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
  const token = createInvitationToken();
  const tokenHash = hashInvitationToken(token);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + DEFAULT_EXPIRES_HOURS * 60 * 60 * 1000
  );

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Invitation"
      WHERE id = ${invitationId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    const invitation = await tx.invitation.findFirst({
      where: { id: invitationId, tenantId },
      include: { tenant: { select: { name: true } } },
    });
    if (!invitation) {
      throw new InvitationDomainError("INVITATION_NOT_FOUND");
    }
    if (invitation.status !== "PENDING") {
      throw new InvitationDomainError("INVITATION_UNAVAILABLE");
    }
    if (invitation.expiresAt <= now) {
      await tx.invitation.updateMany({
        where: {
          id: invitation.id,
          tenantId,
          status: "PENDING",
          expiresAt: { lte: now },
        },
        data: { status: "EXPIRED" },
      });
      await registerAuditLog(
        {
          actorUserId,
          tenantId,
          action: AuditAction.INVITATION_EXPIRED,
          targetType: "Invitation",
          targetId: invitation.id,
          origin,
          metadata: { role: invitation.role },
        },
        tx
      );
      return { kind: "expired" as const };
    }

    const rotated = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        tenantId,
        tokenHash: invitation.tokenHash,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: { tokenHash, expiresAt },
    });
    if (rotated.count !== 1) {
      throw new InvitationDomainError("INVITATION_UNAVAILABLE");
    }
    const updated = await tx.invitation.findFirstOrThrow({
      where: { id: invitation.id, tenantId, tokenHash },
    });

    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.INVITATION_RESENT,
        targetType: "Invitation",
        targetId: invitation.id,
        origin,
        metadata: { email: invitation.email, role: invitation.role },
      },
      tx
    );

    return {
      kind: "ready" as const,
      invitation: updated,
      tenantName: invitation.tenant.name,
    };
  });

  if (outcome.kind === "expired") {
    throw new InvitationDomainError("INVITATION_EXPIRED");
  }

  const emailResult = await sendInvitationEmail({
    tenantId,
    email: outcome.invitation.email,
    tenantName: outcome.tenantName,
    role: outcome.invitation.role,
    token,
  });
  return {
    invitation: outcome.invitation,
    token,
    invitationUrl: invitationUrl(token),
    emailResult,
  };
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
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Invitation"
      WHERE id = ${invitationId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
    const invitation = await tx.invitation.findFirst({
      where: { id: invitationId, tenantId },
    });
    if (!invitation) {
      throw new InvitationDomainError("INVITATION_NOT_FOUND");
    }
    if (invitation.status !== "PENDING") {
      throw new InvitationDomainError("INVITATION_UNAVAILABLE");
    }

    const cancelled = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        tenantId,
        tokenHash: invitation.tokenHash,
        status: "PENDING",
      },
      data: { status: "CANCELLED" },
    });
    if (cancelled.count !== 1) {
      throw new InvitationDomainError("INVITATION_UNAVAILABLE");
    }
    const updated = await tx.invitation.findFirstOrThrow({
      where: { id: invitation.id, tenantId, status: "CANCELLED" },
    });

    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.INVITATION_CANCELLED,
        targetType: "Invitation",
        targetId: invitation.id,
        origin,
        metadata: { email: invitation.email, role: invitation.role },
      },
      tx
    );

    return updated;
  });
}
export async function acceptInvitation({
  token,
  password,
  name,
  bloque,
  apto,
  acceptedLegal,
  origin,
}: {
  token: string;
  password: string;
  name: string;
  bloque?: number | null;
  apto?: number | null;
  acceptedLegal: boolean;
  origin?: string | null;
}) {
  if (typeof token !== "string" || token.length < 20 || token.length > 256) {
    throw new InvitationDomainError("INVALID_TOKEN");
  }
  const tokenHash = hashInvitationToken(token);
  const initial = await prisma.invitation.findUnique({ where: { tokenHash } });
  if (!initial) throw new InvitationDomainError("INVALID_TOKEN");

    const now = new Date();

  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM "Invitation"
      WHERE id = ${initial.id}
      FOR UPDATE
    `;
    const invitation = await tx.invitation.findUnique({ where: { tokenHash } });
    if (!invitation || invitation.id !== initial.id) {
      throw new InvitationDomainError("INVALID_TOKEN");
    }
    if (invitation.status === "ACCEPTED") {
      throw new InvitationDomainError("INVITATION_USED");
    }
    if (invitation.status === "CANCELLED") {
      throw new InvitationDomainError("INVITATION_CANCELLED");
    }
    if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
      if (invitation.status === "PENDING") {
        await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED" },
        });
        await registerAuditLog(
          {
            tenantId: invitation.tenantId,
            action: AuditAction.INVITATION_EXPIRED,
            targetType: "Invitation",
            targetId: invitation.id,
            origin,
            metadata: { role: invitation.role },
          },
          tx
        );
      }
      return { kind: "expired" as const };
    }

const input = validateInvitationAcceptance({
      token,
      password,
      name,
      role: invitation.role,
      bloque,
      apto,
      acceptedLegal,
    });
    const passwordHash = await bcrypt.hash(input.password, 10);
    const normalizedEmail = normalizeInvitationEmail(invitation.email);
    const claimed = await tx.invitation.updateMany({
      where: {
        id: invitation.id,
        tokenHash,
        status: "PENDING",
        expiresAt: { gt: now },
      },
      data: { status: "ACCEPTED", acceptedAt: now },
    });
    if (claimed.count !== 1) {
      throw new InvitationDomainError("INVITATION_UNAVAILABLE");
    }

    const existing = await tx.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    });
    if (
      existing &&
      (existing.tenantId !== invitation.tenantId ||
        existing.role === "SUPER_ADMIN" ||
        existing.isActive)
    ) {
      throw new InvitationDomainError("INVITATION_CONFLICT");
    }

    const legalAcceptedAt = now;
    const user = existing
      ? await tx.user.update({
          where: { id: existing.id },
          data: {
            email: normalizedEmail,
            name: input.name,
            password: passwordHash,
            role: invitation.role,
            tenantId: invitation.tenantId,
            bloque: input.bloque,
            apto: input.apto,
            isActive: true,
            onboardingCompletedAt: null,
            termsAcceptedAt: legalAcceptedAt,
            privacyAcceptedAt: legalAcceptedAt,
            termsVersion: LEGAL_DOCUMENT_VERSION,
            privacyVersion: LEGAL_DOCUMENT_VERSION,
          },
        })
      : await tx.user.create({
          data: {
            email: normalizedEmail,
            name: input.name,
            password: passwordHash,
            role: invitation.role,
            tenantId: invitation.tenantId,
            bloque: input.bloque,
            apto: input.apto,
            isActive: true,
            termsAcceptedAt: legalAcceptedAt,
            privacyAcceptedAt: legalAcceptedAt,
            termsVersion: LEGAL_DOCUMENT_VERSION,
            privacyVersion: LEGAL_DOCUMENT_VERSION,
          },
        });

    const accepted = await tx.invitation.findFirstOrThrow({
      where: {
        id: invitation.id,
        tokenHash,
        status: "ACCEPTED",
        acceptedAt: now,
      },
    });

    await registerAuditLog(
      {
        actorUserId: user.id,
        tenantId: invitation.tenantId,
        action: AuditAction.INVITATION_ACCEPTED,
        targetType: "Invitation",
        targetId: invitation.id,
        origin,
        metadata: {
          email: normalizedEmail,
          role: invitation.role,
          userId: user.id,
        },
      },
      tx
    );

    return { kind: "accepted" as const, user, invitation: accepted };
  });

  if (outcome.kind === "expired") {
    throw new InvitationDomainError("INVITATION_EXPIRED");
  }

  await createNotification({
    tenantId: outcome.invitation.tenantId,
    userId: outcome.user.id,
    type: NotificationTypes.INVITATION_RECEIVED,
    title: "Bienvenido a PQRS Services",
    message: "Tu cuenta fue activada correctamente.",
    resourceType: "Invitation",
    resourceId: outcome.invitation.id,
  }).catch(() => null);

  const admins = await prisma.user.findMany({
    where: {
      tenantId: outcome.invitation.tenantId,
      role: "ADMIN",
      isActive: true,
    },
    select: { id: true },
  });
  await Promise.allSettled(
    admins.map((admin) =>
      createNotification({
        tenantId: outcome.invitation.tenantId,
        userId: admin.id,
        type: NotificationTypes.INVITATION_ACCEPTED,
        title: "Invitacion aceptada",
        message: outcome.user.name + " acepto la invitacion.",
        resourceType: "User",
        resourceId: outcome.user.id,
      })
    )
  );

  const safeUserName = escapeInvitationHtml(outcome.user.name);
  await sendEmailSafe({
    tenantId: outcome.invitation.tenantId,
    to: outcome.user.email,
    template: "account_confirmation",
    subject: "Tu cuenta de PQRS Services esta activa",
    html: renderEmailLayout({
      accent: "success",
      eyebrow: "Cuenta activada",
      heading: "Tu cuenta ya esta lista",
      bodyHtml: `<p>Hola <strong>${safeUserName}</strong>,</p><p>Tu cuenta fue activada correctamente. Ya puedes iniciar sesion y empezar a usar la plataforma.</p>`,
      cta: {
        label: "Iniciar sesion",
        url: `${process.env.APP_URL || process.env.NEXTAUTH_URL || ""}/auth/login`,
      },
    }),
  });

  return { user: outcome.user, invitation: outcome.invitation };
}
export async function inspectInvitation(token: string) {
  if (typeof token !== "string" || token.length < 20 || token.length > 256) {
    throw new InvitationDomainError("INVALID_TOKEN");
  }
  const tokenHash = hashInvitationToken(token);
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash },
    include: { tenant: { select: { id: true, name: true } } },
  });
  if (!invitation) throw new InvitationDomainError("INVALID_TOKEN");
  if (invitation.status === "ACCEPTED") {
    throw new InvitationDomainError("INVITATION_USED");
  }
  if (invitation.status === "CANCELLED") {
    throw new InvitationDomainError("INVITATION_CANCELLED");
  }
  const now = new Date();
  if (invitation.status === "EXPIRED" || invitation.expiresAt <= now) {
    if (invitation.status === "PENDING") {
      await prisma.$transaction(async (tx) => {
        const expired = await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            tokenHash,
            status: "PENDING",
            expiresAt: { lte: now },
          },
          data: { status: "EXPIRED" },
        });
        if (expired.count === 1) {
          await registerAuditLog(
            {
              tenantId: invitation.tenantId,
              action: AuditAction.INVITATION_EXPIRED,
              targetType: "Invitation",
              targetId: invitation.id,
              origin: "invitation-inspection",
              metadata: { role: invitation.role },
            },
            tx
          );
        }
      });
    }
    throw new InvitationDomainError("INVITATION_EXPIRED");
  }
  return {
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
    tenant: invitation.tenant,
  };
}
export async function listInvitationsForTenant({
  tenantId,
  status,
  search,
  page = 1,
  pageSize = 25,
}: {
  tenantId: string;
  status?: InvitationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  await expirePendingInvitations(new Date(), tenantId);
  const where = {
    tenantId,
    ...(status ? { status } : {}),
    ...(search ? { email: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.invitation.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    }),
    prisma.invitation.count({ where }),
  ]);
  return { data, total };
}
