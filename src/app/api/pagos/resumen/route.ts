import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { getAggregateSummaryForTenant } from "@/domains/payments/payment.service";
import { mapPaymentError } from "@/domains/payments/payment-security";

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
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
