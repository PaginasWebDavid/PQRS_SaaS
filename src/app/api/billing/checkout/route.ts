import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createMercadoPagoSubscriptionForTenant, disableAutoRenewForTenant } from "@/domains/billing/mercado-pago.service";
import { getTenantIdFromSession } from "@/domains/organizations/tenant.service";

function getAppUrl() {
  const appUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "";
  return appUrl.replace(/\/$/, "");
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = getTenantIdFromSession(session);
  const body = await req.json();
  const action = body.action;

  try {
    if (action === "createPreapproval") {
      const backUrl = body.backUrl ? `${getAppUrl()}${body.backUrl}` : undefined;
      const subscription = await createMercadoPagoSubscriptionForTenant({
        actorUserId: session.user.id,
        tenantId,
        backUrl,
      });
      return NextResponse.json({ initPoint: subscription.mercadoPagoInitPoint });
    }
    if (action === "disableAutoRenew") {
      const subscription = await disableAutoRenewForTenant({ actorUserId: session.user.id, tenantId });
      return NextResponse.json({ autoRenew: subscription.autoRenew });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la acción";
    console.error("[billing/checkout] Error", { action, message });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
