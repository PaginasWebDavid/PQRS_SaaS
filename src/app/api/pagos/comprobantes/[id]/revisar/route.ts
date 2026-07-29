import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { reviewReceipt, type ReceiptDecision } from "@/domains/payments/payment.service";

const VALID_DECISIONS = new Set(["APPROVED", "REJECTED"]);

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
  if (typeof record.decision !== "string" || !VALID_DECISIONS.has(record.decision)) {
    return NextResponse.json({ error: "Decision invalida" }, { status: 400 });
  }
  try {
    const receipt = await reviewReceipt({
      tenantId: identity.tenantId,
      actorUserId: identity.userId,
      receiptId: params.id,
      decision: record.decision as ReceiptDecision,
      amountCents: record.amountCents,
      paidAt: record.paidAt,
      reference: record.reference,
      rejectionReason: record.rejectionReason,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(receipt);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
