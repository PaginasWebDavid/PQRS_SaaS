import { InvitationStatus, Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { createInvitation, listInvitationsForTenant } from "@/domains/organizations/invitation.service";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const rawStatus = req.nextUrl.searchParams.get("status") || undefined;
  const status = rawStatus && Object.values(InvitationStatus).includes(rawStatus as InvitationStatus) ? (rawStatus as InvitationStatus) : undefined;
  const invitations = await listInvitationsForTenant({ tenantId, status });
  return NextResponse.json(invitations);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "RESIDENTE").toUpperCase() as Role;

  if (!email) {
    return NextResponse.json({ error: "Correo requerido" }, { status: 400 });
  }

  try {
    const result = await createInvitation({
      tenantId,
      email,
      role,
      invitedById: session.user.id,
      origin: req.headers.get("x-forwarded-for") || req.headers.get("user-agent") || "api",
    });

    return NextResponse.json({
      invitation: {
        id: result.invitation.id,
        email: result.invitation.email,
        role: result.invitation.role,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
      },
      invitationUrl: result.invitationUrl,
      email: result.emailResult,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la invitacion" }, { status: 400 });
  }
}
