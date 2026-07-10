import { AuditAction, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { createInvitation } from "@/domains/organizations/invitation.service";
import { registerAuditLog } from "@/domains/platform/audit.service";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "RESIDENTE"].includes(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;
  const tenantId = getTenantIdFromSession(session);
  const current = await prisma.user.findFirst({ where: { id: session.user.id, tenantId } });
  if (!current) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  if (current.onboardingCompletedAt) return NextResponse.json({ user: current, alreadyCompleted: true });

  const body = await req.json();
  const name = String(body.name || current.name).trim();
  const phone = body.phone == null || body.phone === "" ? current.phone : String(body.phone).trim();
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Nombre invalido" }, { status: 400 });
  if (phone && !/^[+0-9 ()-]{7,25}$/.test(phone)) return NextResponse.json({ error: "Telefono invalido" }, { status: 400 });

  if (session.user.role === "ADMIN") {
    const tenantName = String(body.tenantName || "").trim();
    const city = String(body.city || "").trim();
    if (tenantName.length < 2) return NextResponse.json({ error: "Nombre del conjunto invalido" }, { status: 400 });
    await prisma.tenant.update({ where: { id: tenantId }, data: { name: tenantName, city: city || null } });
  }

  let invitationResult: { emailSent: boolean; error?: string | null } | null = null;
  if (session.user.role === "ADMIN" && body.inviteEmail) {
    try {
      const invitation = await createInvitation({
        tenantId, email: String(body.inviteEmail), role: String(body.inviteRole || "RESIDENTE").toUpperCase() as Role,
        invitedById: session.user.id, origin: "onboarding",
      });
      invitationResult = { emailSent: invitation.emailResult.ok, error: invitation.emailResult.ok ? undefined : invitation.emailResult.errorMessage };
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la invitacion" }, { status: 400 });
    }
  }

  const completedAt = new Date();
  const user = await prisma.user.update({
    where: { id: session.user.id }, data: { name, phone, onboardingCompletedAt: completedAt },
    select: { id: true, name: true, role: true, tenantId: true, onboardingCompletedAt: true },
  });
  await registerAuditLog({
    actorUserId: session.user.id, tenantId, action: AuditAction.ONBOARDING_COMPLETED,
    targetType: "User", targetId: session.user.id, origin: "onboarding", metadata: { role: session.user.role },
  });
  return NextResponse.json({ user, invitationResult });
}
