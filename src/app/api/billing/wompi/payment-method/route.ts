import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertSessionClaimsCurrent, AuthorizationError, requireAuthenticatedUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import {
  getWompiAutomaticPaymentSetup,
  getWompiAutomaticPaymentState,
  revokeWompiPaymentMethod,
  setWompiAutomaticRenewal,
  WompiBillingError,
} from "@/domains/billing/wompi.service";

export const runtime = "nodejs";

async function requireBillingAdmin(): Promise<{ userId: string; tenantId: string }> {
  const session = await auth();
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
  if (error instanceof WompiBillingError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  }
  console.error("[billing/wompi/payment-method] unexpected error");
  return NextResponse.json({ error: "No se pudo actualizar el cobro automatico. Intentalo de nuevo." }, { status: 500 });
}

export async function GET(req: NextRequest) {
  try {
    const identity = await requireBillingAdmin();
    const payload = req.nextUrl.searchParams.get("setup") === "1"
      ? await getWompiAutomaticPaymentSetup(identity.tenantId)
      : await getWompiAutomaticPaymentState(identity.tenantId);
    return NextResponse.json(payload);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const identity = await requireBillingAdmin();
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).enabled !== "boolean") {
      throw new WompiBillingError("La solicitud de cobro automatico es invalida", "WOMPI_AUTORENEW_INPUT_INVALID");
    }
    return NextResponse.json(await setWompiAutomaticRenewal({
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      enabled: (body as Record<string, unknown>).enabled as boolean,
    }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE() {
  try {
    const identity = await requireBillingAdmin();
    return NextResponse.json(await revokeWompiPaymentMethod({ actorUserId: identity.userId, tenantId: identity.tenantId }));
  } catch (error) {
    return errorResponse(error);
  }
}
