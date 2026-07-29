import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { getChargeForActor } from "@/domains/payments/payment.service";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  let identity;
  try {
    identity = await requireActiveTenantUser(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  if (identity.role === "CONSEJO") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    const charge = await getChargeForActor({
      tenantId: identity.tenantId,
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : null,
      chargeId: params.id,
    });
    return NextResponse.json(charge);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
