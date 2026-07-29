import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { reversePayment } from "@/domains/payments/payment.service";

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
  const body = await req.json().catch(() => null);
  const record = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  try {
    const payment = await reversePayment({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      paymentId: params.id,
      reason: record.reason,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(payment);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
