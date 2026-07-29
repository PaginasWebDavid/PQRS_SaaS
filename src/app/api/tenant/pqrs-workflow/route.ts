import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";
import { updatePqrsWorkflowTypeForAdmin } from "@/domains/pqrs/pqrs-workflow.service";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }

  try {
    const tenant = await updatePqrsWorkflowTypeForAdmin({
      // El tenant SIEMPRE se deriva de la sesion; nunca se acepta uno enviado
      // por el cliente, para que un ADMIN no pueda reconfigurar otro conjunto.
      tenantId: getTenantIdFromSession(session),
      actorUserId: session.user.id,
      workflowType: (body as Record<string, unknown>).workflowType,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(tenant);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la configuracion" },
      { status: 400 }
    );
  }
}
