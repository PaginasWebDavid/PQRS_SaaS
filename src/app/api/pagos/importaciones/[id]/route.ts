import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { getImportBatchForTenant } from "@/domains/payments/payment-import.service";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
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
    const batch = await getImportBatchForTenant({ tenantId: identity.tenantId, batchId: params.id });
    return NextResponse.json(batch);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
