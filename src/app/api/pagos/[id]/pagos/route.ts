import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { recordManualPayment } from "@/domains/payments/payment.service";

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
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  try {
    const payment = await recordManualPayment({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      chargeId: params.id,
      amountCents: record.amountCents,
      paidAt: record.paidAt,
      reference: record.reference,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(payment, { status: 201 });
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
