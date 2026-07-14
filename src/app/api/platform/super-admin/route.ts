import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSuperAdminOverview } from "@/domains/platform/super-admin.service";
import { createTenantWithAdmin, updateTenantStatusForSuperAdmin, updateTenantDetails } from "@/domains/platform/tenant-admin.service";
import {
  renewSubscriptionWithSimulatedPayment,
  applyOverdueLicenseRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  updatePricingRuleCaps,
} from "@/domains/billing/billing.service";
import { upsertPlatformSetting } from "@/domains/platform/platform-setting.service";

function requireSuperAdmin(role?: string) {
  return role === "SUPER_ADMIN";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !requireSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const data = await getSuperAdminOverview(tenantId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !requireSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const body = await req.json();
  const action = body.action;

  try {
    if (action === "createTenant") {
      const result = await createTenantWithAdmin(session.user.id, {
        name: body.name,
        slug: body.slug || body.name,
        city: body.city,
        address: body.address,
        units: Number(body.units || 0),
        adminName: body.adminName,
        adminEmail: body.adminEmail,
        adminPhone: body.adminPhone,
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (action === "updateTenantStatus") {
      const result = await updateTenantStatusForSuperAdmin(session.user.id, body.tenantId, body.status);
      return NextResponse.json(result);
    }
    if (action === "renewSubscription") {
      const result = await renewSubscriptionWithSimulatedPayment({ actorUserId: session.user.id, tenantId: body.tenantId });
      return NextResponse.json(result);
    }
    if (action === "updateTenant") {
      const result = await updateTenantDetails(session.user.id, body.tenantId, {
        name: body.name,
        city: body.city,
        units: body.units !== undefined ? Number(body.units) : undefined,
      });
      return NextResponse.json(result);
    }
    if (action === "applyOverdueRules") {
      const result = await applyOverdueLicenseRules(session.user.id);
      return NextResponse.json(result);
    }
    if (action === "createPricingRule") {
      const result = await createPricingRule(session.user.id, {
        minUnits: Number(body.minUnits),
        maxUnits: body.maxUnits === null || body.maxUnits === "" || body.maxUnits === undefined ? null : Number(body.maxUnits),
        priceCents: Number(body.priceCents),
        currency: body.currency,
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (action === "updatePricingRule") {
      const result = await updatePricingRule(session.user.id, body.ruleId, {
        minUnits: body.minUnits !== undefined ? Number(body.minUnits) : undefined,
        maxUnits: body.maxUnits === undefined ? undefined : (body.maxUnits === null || body.maxUnits === "" ? null : Number(body.maxUnits)),
        priceCents: body.priceCents !== undefined ? Number(body.priceCents) : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      });
      return NextResponse.json(result);
    }
    if (action === "deletePricingRule") {
      const result = await deletePricingRule(session.user.id, body.ruleId);
      return NextResponse.json(result);
    }
    if (action === "updatePricingCaps") {
      const result = await updatePricingRuleCaps(session.user.id, {
        minCents: Math.round(Number(body.minCop) * 100),
        maxCents: Math.round(Number(body.maxCop) * 100),
      });
      return NextResponse.json(result);
    }
    if (action === "updateGraceDays") {
      const result = await upsertPlatformSetting({
        key: "gracePeriodDays",
        value: Number(body.graceDays),
        updatedById: session.user.id,
      });
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo completar la acción";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
