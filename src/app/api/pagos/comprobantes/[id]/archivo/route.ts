import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireActiveTenantUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapPaymentError } from "@/domains/payments/payment-security";
import { getReceiptFileForActor } from "@/domains/payments/payment.service";

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
  if (identity.role !== "ADMIN" && identity.role !== "RESIDENTE") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    const file = await getReceiptFileForActor({
      tenantId: identity.tenantId,
      actorRole: identity.role,
      membershipId: identity.role === "RESIDENTE" ? identity.membershipId : null,
      receiptId: params.id,
    });
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalFileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
