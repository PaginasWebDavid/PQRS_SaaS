import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { MAX_RECEIPT_FILE_BYTES, mapPaymentError } from "@/domains/payments/payment-security";
import { uploadReceipt } from "@/domains/payments/payment.service";

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

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Debes adjuntar un archivo" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_RECEIPT_FILE_BYTES) {
    return NextResponse.json({ error: "El archivo pesa demasiado o esta vacio" }, { status: 400 });
  }
  const declaredAmountRaw = formData?.get("declaredAmountCents");

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const receipt = await uploadReceipt({
      tenantId: identity.tenantId,
      membershipId: identity.membershipId,
      uploadedByUserId: identity.userId,
      chargeId: params.id,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      declaredAmountCents: declaredAmountRaw ? Number(declaredAmountRaw) : undefined,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(receipt, { status: 201 });
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
