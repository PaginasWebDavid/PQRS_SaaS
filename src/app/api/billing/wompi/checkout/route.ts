import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertSessionClaimsCurrent, AuthorizationError, requireAuthenticatedUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import {
  createWompiCheckoutForTenant,
  getWompiAnnualCheckoutOffer,
  WompiBillingError,
} from "@/domains/billing/wompi.service";

export const runtime = "nodejs";

async function requireBillingAdmin(): Promise<{ userId: string; tenantId: string }> {
  const session = await auth();
  // Un conjunto PENDING_PAYMENT o SUSPENDED debe poder abrir el checkout para
  // pagar y recuperar acceso. El resto de APIs conserva requireTenantRole,
  // que exige licencia activa. Esta excepcion sigue comprobando sesion vigente,
  // membresia ADMIN activa y tenant seleccionado, y nunca permite CANCELLED.
  if (!session) throw new AuthorizationError("UNAUTHENTICATED");
  const identity = await requireAuthenticatedUser(session);
  assertSessionClaimsCurrent(session, identity);
  if (!identity.tenantId || !identity.membershipId) throw new AuthorizationError("TENANT_REQUIRED");
  if (identity.role !== "ADMIN") throw new AuthorizationError("FORBIDDEN");
  if (identity.tenantStatus === "CANCELLED" || identity.subscriptionStatus === "CANCELLED") {
    throw new AuthorizationError("TENANT_INACTIVE");
  }
  return { userId: identity.userId, tenantId: identity.tenantId };
}

function errorResponse(error: unknown) {
  const authorization = getAuthorizationErrorResponse(error);
  if (authorization) return authorization;
  if (error instanceof WompiBillingError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  console.error("[billing/wompi/checkout] unexpected error");
  return NextResponse.json({ error: "No se pudo iniciar el pago. Intentalo de nuevo." }, { status: 500 });
}

export async function GET() {
  try {
    const identity = await requireBillingAdmin();
    return NextResponse.json(await getWompiAnnualCheckoutOffer(identity.tenantId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireBillingAdmin();
    const body = await req.json().catch(() => null);
    const request = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const checkout = await createWompiCheckoutForTenant({
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      operationId: request.operationId,
      billingMode: request.billingMode,
    });
    return NextResponse.json(checkout);
  } catch (error) {
    return errorResponse(error);
  }
}
