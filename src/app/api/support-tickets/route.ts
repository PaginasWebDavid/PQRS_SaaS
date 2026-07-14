import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { createSupportTicket, listSupportTicketsForUser } from "@/domains/support/support-ticket.service";
import { isFeatureEnabled } from "@/domains/platform/platform-setting.service";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  const tickets = await listSupportTicketsForUser({ tenantId, userId: session.user.id });
  return NextResponse.json(tickets);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (session.user.role === "SUPER_ADMIN") {
    return NextResponse.json({ error: "No tiene permisos" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const supportEnabled = await isFeatureEnabled("supportTicketsEnabled");
  if (!supportEnabled) {
    return NextResponse.json({ error: "El centro de soporte está deshabilitado temporalmente. Intenta más tarde." }, { status: 403 });
  }

  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();

  if (!body.subject?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: "Asunto y mensaje son obligatorios" }, { status: 400 });
  }

  try {
    const ticket = await createSupportTicket({
      actorUserId: session.user.id,
      tenantId,
      subject: body.subject.trim(),
      message: body.message.trim(),
      category: ["TECNICO", "FACTURACION", "CUENTA", "OTRO"].includes(body.category) ? body.category : "OTRO",
    });
    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo crear la solicitud";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
