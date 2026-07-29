import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { cancelCharge } from "@/domains/payments/payment.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
    const charge = await cancelCharge({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      chargeId: params.id,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(charge);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
