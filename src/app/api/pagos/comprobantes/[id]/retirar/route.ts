import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { withdrawReceipt } from "@/domains/payments/payment.service";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "RESIDENTE");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  try {
    const receipt = await withdrawReceipt({
      tenantId: identity.tenantId,
      membershipId: identity.membershipId,
      receiptId: params.id,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(receipt);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
