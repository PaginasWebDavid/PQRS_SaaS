import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { MAX_IMPORT_FILE_BYTES, mapPaymentError } from "@/domains/payments/payment-security";
import { processChargeImportFile } from "@/domains/payments/payment-import.service";

export async function POST(req: NextRequest) {
  const session = await auth();
  let identity;
  try {
    identity = await requireTenantRole(session, "ADMIN");
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Debes adjuntar un archivo Excel (.xlsx)" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: "Solo se permiten archivos .xlsx" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_IMPORT_FILE_BYTES) {
    return NextResponse.json({ error: "El archivo pesa demasiado o esta vacio" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const batch = await processChargeImportFile({
      tenantId: identity.tenantId,
      uploadedByUserId: identity.userId,
      fileName: file.name,
      buffer,
      origin: req.headers.get("x-forwarded-for") || "api",
    });
    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    const mapped = mapPaymentError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
