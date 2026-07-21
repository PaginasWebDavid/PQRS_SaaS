import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTenantAuditLogPage } from "@/domains/platform/audit.service";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";
import { getTenantAccessResponse } from "@/lib/tenant-access-response";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["ADMIN", "CONSEJO"].includes(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const tenantAccessResponse = await getTenantAccessResponse(session);
  if (tenantAccessResponse) return tenantAccessResponse;

  const tenantId = getTenantIdFromSession(session);
  // CONSEJO es de solo lectura sobre PQRS/Reportes (asi se le comunica en la app);
  // no debe poder ver actividad de usuarios/facturacion aunque la pida por query param.
  const requestedCategory = req.nextUrl.searchParams.get("category") || "all";
  const category = session.user.role === "CONSEJO" ? "pqrs" : requestedCategory;
  const rawTake = req.nextUrl.searchParams.get("take") || "20";
  const rawSkip = req.nextUrl.searchParams.get("skip") || "0";
  const take = Number(rawTake);
  const skip = Number(rawSkip);

  if (!Number.isSafeInteger(take) || take < 1 || take > 50 || !Number.isSafeInteger(skip) || skip < 0) {
    return NextResponse.json({ error: "Paginacion invalida" }, { status: 400 });
  }

  const page = await getTenantAuditLogPage({ tenantId, category, take, skip });
  return NextResponse.json(page);
}
