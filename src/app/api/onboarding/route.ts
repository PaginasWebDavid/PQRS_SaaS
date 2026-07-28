import { AuditAction } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInvitation } from "@/domains/organizations/invitation.service";
import { ensureInvitableRole, mapInvitationError } from "@/domains/organizations/invitation-security";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { AuthorizationError, requireAuthenticatedUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";

export async function POST(req: NextRequest) {
  const session = await auth();
  let identity;
  try {
    identity = await requireAuthenticatedUser(session);
    if (!identity.tenantId || !identity.membershipId) throw new AuthorizationError("TENANT_REQUIRED");
    if (identity.role !== "ADMIN" && identity.role !== "RESIDENTE") throw new AuthorizationError("FORBIDDEN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error); if (response) return response; throw error;
  }
  const tenantId = identity.tenantId as string;
  const membershipId = identity.membershipId as string;
  const current = await prisma.tenantMembership.findFirst({
    where: { id: membershipId, userId: identity.userId, tenantId, isActive: true },
    include: { user: { select: { name: true, phone: true } } },
  });
  if (!current) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (current.onboardingCompletedAt) {
    return NextResponse.json({ user: flatten(current), alreadyCompleted: true });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  const record = body as Record<string, unknown>;
  const name = String(record.name || current.user.name).trim();
  const phone = record.phone == null || record.phone === "" ? current.user.phone : String(record.phone).trim();
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Nombre invalido" }, { status: 400 });
  if (phone && !/^[+0-9 ()-]{7,25}$/.test(phone)) return NextResponse.json({ error: "Telefono invalido" }, { status: 400 });

  let tenantName: string | undefined;
  let city: string | null | undefined;
  if (identity.role === "ADMIN") {
    tenantName = String(record.tenantName || "").trim();
    city = String(record.city || "").trim() || null;
    if (tenantName.length < 2 || tenantName.length > 160) return NextResponse.json({ error: "Nombre del conjunto invalido" }, { status: 400 });
    if (city && city.length > 120) return NextResponse.json({ error: "Ciudad invalida" }, { status: 400 });
  }
  let bloque: number | undefined;
  let apto: number | undefined;
  if (identity.role === "RESIDENTE") {
    bloque = Number(record.bloque ?? current.bloque);
    apto = Number(record.apto ?? current.apto);
    if (!Number.isInteger(bloque) || bloque < 1 || bloque > 999) return NextResponse.json({ error: "Bloque invalido" }, { status: 400 });
    if (!Number.isInteger(apto) || apto < 1 || apto > 9999) return NextResponse.json({ error: "Apartamento invalido" }, { status: 400 });
  }
  const completedAt = new Date();
  const user = await prisma.$transaction(async (tx) => {
    if (identity.role === "ADMIN") {
      const updatedTenant = await tx.tenant.updateMany({ where: { id: tenantId }, data: { name: tenantName, city } });
      if (updatedTenant.count !== 1) throw new AuthorizationError("RESOURCE_NOT_FOUND");
    }
    await tx.user.update({ where: { id: identity.userId }, data: { name, phone } });
    const updatedMembership = await tx.tenantMembership.updateMany({
      where: { id: membershipId, userId: identity.userId, tenantId, isActive: true },
      data: { onboardingCompletedAt: completedAt, ...(identity.role === "RESIDENTE" ? { bloque, apto } : {}) },
    });
    if (updatedMembership.count !== 1) throw new AuthorizationError("RESOURCE_NOT_FOUND");
    const stored = await tx.tenantMembership.findUniqueOrThrow({
      where: { id: membershipId },
      include: { user: { select: { id: true, name: true } } },
    });
    await registerAuditLog({
      actorUserId: identity.userId, tenantId, action: AuditAction.ONBOARDING_COMPLETED,
      targetType: "TenantMembership", targetId: membershipId, origin: "onboarding",
      metadata: { role: identity.role, userId: identity.userId },
    }, tx);
    return flatten(stored);
  });

  let invitationResult: { emailSent: boolean; error?: string } | null = null;
  if (identity.role === "ADMIN" && record.inviteEmail) {
    try {
      const invitation = await createInvitation({
        tenantId, email: String(record.inviteEmail), role: ensureInvitableRole(record.inviteRole ?? "RESIDENTE"),
        invitedById: identity.userId, origin: "onboarding",
      });
      invitationResult = { emailSent: invitation.emailResult.ok };
    } catch (error) {
      invitationResult = { emailSent: false, error: mapInvitationError(error).message };
    }
  }
  return NextResponse.json({ user, invitationResult });
}

function flatten(membership: {
  id: string; userId: string; tenantId: string; role: string; bloque: number | null; apto: number | null;
  onboardingCompletedAt: Date | null; user: { id?: string; name: string; phone?: string | null };
}) {
  return { id: membership.userId, membershipId: membership.id, name: membership.user.name, role: membership.role, tenantId: membership.tenantId, bloque: membership.bloque, apto: membership.apto, onboardingCompletedAt: membership.onboardingCompletedAt };
}