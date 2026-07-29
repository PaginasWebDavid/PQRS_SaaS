import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { getAggregateSummaryForTenant } from "@/domains/payments/payment.service";

export async function GET() {
  const session = await auth();
  let identity;
  try {
    identity = await requireActiveTenantUser(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  if (identity.role !== "ADMIN" && identity.role !== "CONSEJO") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    const summary = await getAggregateSummaryForTenant({ tenantId: identity.tenantId });
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json({ error: "No se pudo cargar el resumen" }, { status: 500 });
  }
}
