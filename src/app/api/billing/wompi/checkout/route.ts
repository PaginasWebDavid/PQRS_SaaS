import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { createWompiCheckoutForTenant, WompiBillingError } from "@/domains/billing/wompi.service";

export const runtime = "nodejs";

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

  const body = await req.json().catch(() => null);
  try {
    const checkout = await createWompiCheckoutForTenant({
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      operationId: body && typeof body === "object" ? (body as Record<string, unknown>).operationId : undefined,
    });
    return NextResponse.json(checkout);
  } catch (error) {
    if (error instanceof WompiBillingError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    console.error("[billing/wompi/checkout] unexpected error");
    return NextResponse.json({ error: "No se pudo iniciar el pago. Intentalo de nuevo." }, { status: 500 });
  }
}
