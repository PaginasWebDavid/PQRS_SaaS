import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { cancelInvitation } from "@/domains/organizations/invitation.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  try {
    const invitation = await cancelInvitation({
      tenantId: getTenantIdFromSession(session),
      invitationId: params.id,
      actorUserId: session.user.id,
      origin: req.headers.get("x-forwarded-for") || req.headers.get("user-agent") || "api",
    });
    return NextResponse.json(invitation);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo cancelar" }, { status: 400 });
  }
}
