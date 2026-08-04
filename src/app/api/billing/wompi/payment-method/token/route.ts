import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { assertSessionClaimsCurrent, AuthorizationError, requireAuthenticatedUser } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { createWompiPaymentMethodForTenant, WompiBillingError } from "@/domains/billing/wompi.service";

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

function redirect(req: NextRequest, result: "enabled" | "error") {
  const url = new URL("/admin/licencias", req.url);
  url.searchParams.set("automaticPayment", result);
  return NextResponse.redirect(url, { status: 303 });
}

function isSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === req.nextUrl.origin;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) return redirect(req, "error");
    const identity = await requireBillingAdmin();
    const form = await req.formData();
    await createWompiPaymentMethodForTenant({
      actorUserId: identity.userId,
      tenantId: identity.tenantId,
      token: form.get("payment_source_token"),
      type: form.get("payment_source_type"),
      acceptedTerms: form.get("wompi_terms") === "accepted",
      acceptedPersonalData: form.get("wompi_personal_data") === "accepted",
    });
    return redirect(req, "enabled");
  } catch (error) {
    const authorization = getAuthorizationErrorResponse(error);
    if (authorization) return authorization;
    if (!(error instanceof WompiBillingError)) console.error("[billing/wompi/payment-method/token] unexpected error");
    return redirect(req, "error");
  }
}
