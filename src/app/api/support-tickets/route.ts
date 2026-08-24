import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import {
  allowedSupportCategoriesForRole,
  createSupportTicket,
  isAllowedSupportCategory,
  listSupportTicketsForTenantAdmin,
  listSupportTicketsForUser,
} from "@/domains/support/support-ticket.service";
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
  // ADMIN ve todos los tickets de su propio conjunto (propios + de sus
  // residentes/consejo); RESIDENTE y CONSEJO solo ven los suyos.
  const tickets = session.user.role === "ADMIN"
    ? await listSupportTicketsForTenantAdmin({ tenantId })
    : await listSupportTicketsForUser({ tenantId, userId: session.user.id });
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
    return NextResponse.json({ error: "El centro de soporte está deshabilitado temporalmente. Intente más tarde." }, { status: 403 });
  }

  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();

  if (!body.subject?.trim() || !body.message?.trim()) {
    return NextResponse.json({ error: "Asunto y mensaje son obligatorios" }, { status: 400 });
  }

  if (!isAllowedSupportCategory(session.user.role, body.category)) {
    return NextResponse.json(
      { error: `Categoria invalida. Usa una de: ${allowedSupportCategoriesForRole(session.user.role).join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const ticket = await createSupportTicket({
      actorUserId: session.user.id,
      tenantId,
      subject: body.subject.trim(),
      message: body.message.trim(),
      category: body.category,
    });
    return NextResponse.json(ticket, { status: 201 });
  } catch (error) {
    console.error("[support-tickets] Unexpected create failure", {
      errorType: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json({ error: "No se pudo crear la solicitud" }, { status: 500 });
  }
}
