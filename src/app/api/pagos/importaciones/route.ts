import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { listImportBatchesForTenant } from "@/domains/payments/payment-import.service";

export async function GET() {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "ADMIN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  try {
    const batches = await listImportBatchesForTenant({ tenantId: identity.tenantId });
    return NextResponse.json(batches);
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar las importaciones" }, { status: 500 });
  }
}
