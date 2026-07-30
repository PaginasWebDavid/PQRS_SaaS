import { NextRequest, NextResponse } from "next/server";
import type { ReceiptStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { listReceiptsForActor } from "@/domains/payments/payment.service";
import { mapPaymentError } from "@/domains/payments/payment-security";

const VALID_STATUSES = new Set(["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"]);

export async function GET(req: NextRequest) {
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
  const statusParam = req.nextUrl.searchParams.get("status");
  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return NextResponse.json({ error: "Estado invalido" }, { status: 400 });
  }
  try {
    const receipts = await listReceiptsForActor({
      tenantId: identity.tenantId,
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : undefined,
      status: (statusParam as ReceiptStatus) || undefined,
    });
    return NextResponse.json(receipts);
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
