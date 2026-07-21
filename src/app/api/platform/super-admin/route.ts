import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getSuperAdminOverview } from "@/domains/platform/super-admin.service";
import { createTenantWithAdmin, updateTenantStatusForSuperAdmin, updateTenantDetails } from "@/domains/platform/tenant-admin.service";
import { resendInvitation } from "@/domains/organizations/invitation.service";
import {
  renewSubscriptionWithSimulatedPayment,
  grantCourtesyExtension,
  applyOverdueLicenseRules,
  createPricingRule,
  updatePricingRule,
  deletePricingRule,
  updatePricingRuleCaps,
} from "@/domains/billing/billing.service";
import { upsertPlatformSetting } from "@/domains/platform/platform-setting.service";

const identifierSchema = z.string().trim().min(1).max(128);
const positiveIntegerSchema = z.coerce.number().int().positive();
const optionalTextSchema = z.string().trim().max(250).optional();
const optionalPositiveIntegerSchema = positiveIntegerSchema.optional();
const nullablePositiveIntegerSchema = z
  .union([positiveIntegerSchema, z.null(), z.literal("")])
  .transform((value) => (value === "" ? null : value));

const createTenantSchema = z.object({
  action: z.literal("createTenant"),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(160).optional(),
  city: optionalTextSchema,
  address: optionalTextSchema,
  units: positiveIntegerSchema,
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().trim().email().max(320),
  adminPhone: z.string().trim().max(30).optional(),
});

const tenantStatusSchema = z.object({
  action: z.literal("updateTenantStatus"),
  tenantId: identifierSchema,
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
});

const tenantIdSchema = z.object({
  action: z.literal("renewSubscription"),
  tenantId: identifierSchema,
});

const courtesyExtensionSchema = z.object({
  action: z.literal("grantCourtesyExtension"),
  tenantId: identifierSchema,
  days: z.coerce.number().int().min(1).max(90),
  reason: z.string().trim().min(1).max(250),
});

const updateTenantSchema = z
  .object({
    action: z.literal("updateTenant"),
    tenantId: identifierSchema,
    name: z.string().trim().min(1).max(160).optional(),
    city: optionalTextSchema,
    units: optionalPositiveIntegerSchema,
  })
  .refine((data) => data.name !== undefined || data.city !== undefined || data.units !== undefined, {
    message: "Debes enviar al menos un campo para actualizar",
  });

const createPricingRuleSchema = z.object({
  action: z.literal("createPricingRule"),
  minUnits: positiveIntegerSchema,
  maxUnits: nullablePositiveIntegerSchema,
  priceCents: positiveIntegerSchema,
  currency: z.string().trim().length(3).optional(),
});

const updatePricingRuleSchema = z
  .object({
    action: z.literal("updatePricingRule"),
    ruleId: identifierSchema,
    minUnits: optionalPositiveIntegerSchema,
    maxUnits: nullablePositiveIntegerSchema.optional(),
    priceCents: optionalPositiveIntegerSchema,
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.minUnits !== undefined || data.maxUnits !== undefined || data.priceCents !== undefined || data.isActive !== undefined,
    { message: "Debes enviar al menos un cambio para la regla" }
  );

const pricingRuleIdSchema = z.object({
  action: z.literal("deletePricingRule"),
  ruleId: identifierSchema,
});

const pricingCapsSchema = z.object({
  action: z.literal("updatePricingCaps"),
  minCop: positiveIntegerSchema,
  maxCop: positiveIntegerSchema,
});

const graceDaysSchema = z.object({
  action: z.literal("updateGraceDays"),
  graceDays: positiveIntegerSchema.max(365),
});

const resendInvitationSchema = z.object({
  action: z.literal("resendTenantInvitation"),
  tenantId: identifierSchema,
  invitationId: identifierSchema,
});

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

  try {
    const body: unknown = await req.json();
    const action = z.object({ action: z.string().trim() }).parse(body).action;

    if (action === "createTenant") {
      const input = createTenantSchema.parse(body);
      const result = await createTenantWithAdmin(session.user.id, {
        ...input,
        slug: input.slug || input.name,
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (action === "updateTenantStatus") {
      const input = tenantStatusSchema.parse(body);
      const result = await updateTenantStatusForSuperAdmin(session.user.id, input.tenantId, input.status);
      return NextResponse.json(result);
    }
    if (action === "renewSubscription") {
      const input = tenantIdSchema.parse(body);
      const result = await renewSubscriptionWithSimulatedPayment({ actorUserId: session.user.id, tenantId: input.tenantId });
      return NextResponse.json(result);
    }
    if (action === "grantCourtesyExtension") {
      const input = courtesyExtensionSchema.parse(body);
      const result = await grantCourtesyExtension({
        actorUserId: session.user.id,
        tenantId: input.tenantId,
        days: input.days,
        reason: input.reason,
      });
      return NextResponse.json(result);
    }
    if (action === "updateTenant") {
      const input = updateTenantSchema.parse(body);
      const result = await updateTenantDetails(session.user.id, input.tenantId, {
        name: input.name,
        city: input.city,
        units: input.units,
      });
      return NextResponse.json(result);
    }
    if (action === "applyOverdueRules") {
      const result = await applyOverdueLicenseRules(session.user.id);
      return NextResponse.json(result);
    }
    if (action === "createPricingRule") {
      const input = createPricingRuleSchema.parse(body);
      const result = await createPricingRule(session.user.id, {
        ...input,
        currency: input.currency?.toUpperCase(),
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (action === "updatePricingRule") {
      const input = updatePricingRuleSchema.parse(body);
      const result = await updatePricingRule(session.user.id, input.ruleId, {
        minUnits: input.minUnits,
        maxUnits: input.maxUnits,
        priceCents: input.priceCents,
        isActive: input.isActive,
      });
      return NextResponse.json(result);
    }
    if (action === "deletePricingRule") {
      const input = pricingRuleIdSchema.parse(body);
      const result = await deletePricingRule(session.user.id, input.ruleId);
      return NextResponse.json(result);
    }
    if (action === "updatePricingCaps") {
      const input = pricingCapsSchema.parse(body);
      const result = await updatePricingRuleCaps(session.user.id, {
        minCents: input.minCop * 100,
        maxCents: input.maxCop * 100,
      });
      return NextResponse.json(result);
    }
    if (action === "resendTenantInvitation") {
      const input = resendInvitationSchema.parse(body);
      const result = await resendInvitation({
        tenantId: input.tenantId,
        invitationId: input.invitationId,
        actorUserId: session.user.id,
        origin: req.headers.get("x-forwarded-for") || "super-admin",
      });
      return NextResponse.json({ email: result.emailResult });
    }
    if (action === "updateGraceDays") {
      const input = graceDaysSchema.parse(body);
      const result = await upsertPlatformSetting({
        key: "gracePeriodDays",
        value: input.graceDays,
        updatedById: session.user.id,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Datos invalidos" : error instanceof Error ? error.message : "No se pudo completar la accion";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}