import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createMercadoPagoSubscriptionForTenant, disableAutoRenewForTenant } from "@/domains/billing/mercado-pago.service";
import { requireTenantRole } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";

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
  const tenantId = identity.tenantId;
  const body = await req.json();
  const action = body.action;

  try {
    if (action === "createPreapproval") {
      const backUrl = typeof body.backUrl === "string" ? body.backUrl : undefined;
      const subscription = await createMercadoPagoSubscriptionForTenant({
        actorUserId: identity.userId,
        tenantId,
        backUrl,
      });
      return NextResponse.json({ initPoint: subscription.mercadoPagoInitPoint });
    }
    if (action === "disableAutoRenew") {
      const subscription = await disableAutoRenewForTenant({ actorUserId: identity.userId, tenantId });
      return NextResponse.json({ autoRenew: subscription.autoRenew });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la acción";
    console.error("[billing/checkout] Error", { action, message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
