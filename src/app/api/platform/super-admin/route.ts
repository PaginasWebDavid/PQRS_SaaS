import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getSuperAdminOverview } from "@/domains/platform/super-admin.service";
import { updateTenantStatusForSuperAdmin, updateTenantDetails } from "@/domains/platform/tenant-admin.service";
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
import { requireSuperAdmin, requireSuperAdminTenantTarget } from "@/lib/authorization";
import { getAuthorizationErrorResponse } from "@/lib/authorization-response";
import { mapInvitationError, publicInvitationEmailResult } from "@/domains/organizations/invitation-security";
import {
  cancelCommercialProcess,
  confirmPilotPayment,
  convertPilot,
  correctCommercialProfile,
  createPaidPilotTenant,
  extendPilotExceptionally,
  markPilotNotConverted,
  markReferralCommissionPaid,
  startPilot,
  startPilotEvaluation,
  updateImplementationStatus,
  updatePilotChecklist,
  validateCommercialPricingPolicy,
} from "@/domains/commercial/commercial.service";
import { setTenantFeatureEntitlement } from "@/domains/commercial/entitlement.service";

const identifierSchema = z.string().trim().min(1).max(128);
const positiveIntegerSchema = z.coerce.number().int().positive();
const optionalTextSchema = z.string().trim().max(250).optional();
const optionalPositiveIntegerSchema = positiveIntegerSchema.optional();
const nullablePositiveIntegerSchema = z
  .union([positiveIntegerSchema, z.null(), z.literal("")])
  .transform((value) => (value === "" ? null : value));

const createTenantSchema = z.object({
  action: z.literal("createTenant"),
  operationId: identifierSchema,
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().max(160).optional(),
  city: optionalTextSchema,
  address: optionalTextSchema,
  units: positiveIntegerSchema,
  adminName: z.string().trim().min(1).max(120),
  adminEmail: z.string().trim().email().max(320),
  adminPhone: z.string().trim().max(30).optional(),
  implementationType: z.enum(["STANDARD", "ASSISTED"]).default("STANDARD"),
  referralName: z.string().trim().max(160).optional(),
  referralContact: z.string().trim().max(200).optional(),
  referralAgreementType: z.enum(["NONE", "GENERAL", "FOUNDER_EXCEPTION"]).default("NONE"),
  reservationsEnabled: z.boolean().default(false),
  residentPaymentsEnabled: z.boolean().default(false),
  pilotPriceCents: optionalPositiveIntegerSchema,
  monthlyPriceCents: optionalPositiveIntegerSchema,
  manualQuoteReason: z.string().trim().max(500).optional(),
  nextAction: z.string().trim().max(250).optional(),
  nextActionDueAt: z.coerce.date().optional(),
});

const tenantStatusSchema = z.object({
  action: z.literal("updateTenantStatus"),
  tenantId: identifierSchema,
  status: z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]),
});

const tenantIdSchema = z.object({
  action: z.literal("renewSubscription"),
  tenantId: identifierSchema,
  idempotencyKey: z.string().uuid(),
});

const courtesyExtensionSchema = z.object({
  action: z.literal("grantCourtesyExtension"),
  tenantId: identifierSchema,
  days: z.coerce.number().int().min(1).max(90),
  reason: z.string().trim().min(1).max(250),
  idempotencyKey: z.string().uuid(),
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
  type: z.enum(["MONTHLY", "PILOT"]).default("MONTHLY"),
  minUnits: positiveIntegerSchema,
  maxUnits: nullablePositiveIntegerSchema,
  priceCents: positiveIntegerSchema,
  currency: z.string().trim().length(3).optional(),
});

const commercialBaseSchema = z.object({ tenantId: identifierSchema, operationId: identifierSchema });
const confirmPilotPaymentSchema = commercialBaseSchema.extend({ action: z.literal("confirmPilotPayment"), amountCents: positiveIntegerSchema, paidAt: z.coerce.date().optional(), manualReference: z.string().trim().min(1).max(160) });
const checklistSchema = commercialBaseSchema.extend({ action: z.literal("updatePilotChecklist"), field: z.enum(["documentsAcceptedAt", "residentBaseReceivedAt", "categoriesConfiguredAt", "trainingCompletedAt", "smokeTestApprovedAt", "launchCommunicationSentAt"]), completed: z.boolean() });
const startPilotSchema = commercialBaseSchema.extend({ action: z.literal("startPilot"), realUseStartsAt: z.coerce.date().optional(), exceptionReason: z.string().trim().max(500).optional() });
const evaluationSchema = commercialBaseSchema.extend({ action: z.literal("startPilotEvaluation"), notes: z.string().trim().max(2000).optional(), supportMinutes: z.coerce.number().int().min(0).optional(), outsideRequests: z.coerce.number().int().min(0).optional(), meetings: z.coerce.number().int().min(0).optional() });
const convertSchema = commercialBaseSchema.extend({ action: z.literal("convertPilot"), billingMode: z.enum(["MONTHLY", "ANNUAL"]), amountCents: positiveIntegerSchema, paidAt: z.coerce.date().optional(), manualReference: z.string().trim().min(1).max(160), discountBps: z.coerce.number().int().min(0).max(500).optional(), discountReason: z.string().trim().max(500).optional(), discountStartsAt: z.coerce.date().optional(), discountEndsAt: z.coerce.date().optional() });
const reasonSchema = commercialBaseSchema.extend({ reason: z.string().trim().min(1).max(500) });
const notConvertedSchema = reasonSchema.extend({ action: z.literal("markPilotNotConverted") });
const cancelCommercialSchema = reasonSchema.extend({ action: z.literal("cancelCommercialProcess") });
const extendPilotSchema = reasonSchema.extend({ action: z.literal("extendPilot"), days: z.coerce.number().int().min(1).max(30) });
const entitlementSchema = reasonSchema.extend({ action: z.literal("setTenantFeature"), feature: z.enum(["RESERVATIONS", "RESIDENT_PAYMENTS"]), status: z.enum(["DISABLED", "SETUP", "ACTIVE", "SUSPENDED"]), priceCents: z.union([z.coerce.number().int().min(0), z.null()]).optional() });
const implementationSchema = reasonSchema.extend({ action: z.literal("updateImplementationStatus"), status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]) });
const referralPaidSchema = commercialBaseSchema.extend({ action: z.literal("markReferralCommissionPaid"), reference: z.string().trim().min(1).max(160), paidAt: z.coerce.date().optional() });
const correctionSchema = reasonSchema.extend({
  action: z.literal("correctCommercialProfile"),
  changes: z.record(
    z.string(),
    z.union([z.string().max(2000), z.coerce.date(), z.coerce.number().int().positive(), z.null()])
  ),
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


export async function GET(req: NextRequest) {
  const session = await auth();
  try {
    await requireSuperAdmin(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const data = await getSuperAdminOverview(tenantId);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  let superAdmin;
  try {
    superAdmin = await requireSuperAdmin(session);
  } catch (error) {
    const response = getAuthorizationErrorResponse(error);
    if (response) return response;
    throw error;
  }

  try {
    const body: unknown = await req.json();
    const action = z.object({ action: z.string().trim() }).parse(body).action;

    if (action === "createTenant") {
      const input = createTenantSchema.parse(body);
      const result = await createPaidPilotTenant(superAdmin.userId, { ...input, slug: input.slug || input.name });
      return NextResponse.json(result, { status: 201 });
    }
    if (action === "updateTenantStatus") {
      const input = tenantStatusSchema.parse(body);
      const result = await updateTenantStatusForSuperAdmin(superAdmin.userId, input.tenantId, input.status);
      return NextResponse.json(result);
    }
    if (action === "renewSubscription") {
      const input = tenantIdSchema.parse(body);
      const result = await renewSubscriptionWithSimulatedPayment({ actorUserId: superAdmin.userId, tenantId: input.tenantId, operationId: input.idempotencyKey });
      return NextResponse.json(result);
    }
    if (action === "grantCourtesyExtension") {
      const input = courtesyExtensionSchema.parse(body);
      const result = await grantCourtesyExtension({
        actorUserId: superAdmin.userId,
        tenantId: input.tenantId,
        days: input.days,
        reason: input.reason,
        operationId: input.idempotencyKey,
      });
      return NextResponse.json(result);
    }
    if (action === "updateTenant") {
      const input = updateTenantSchema.parse(body);
      const result = await updateTenantDetails(superAdmin.userId, input.tenantId, {
        name: input.name,
        city: input.city,
        units: input.units,
      });
      return NextResponse.json(result);
    }
    if (action === "applyOverdueRules") {
      const result = await applyOverdueLicenseRules(superAdmin.userId);
      return NextResponse.json(result);
    }
    if (action === "createPricingRule") {
      const input = createPricingRuleSchema.parse(body);
      const result = await createPricingRule(superAdmin.userId, {
        ...input,
        currency: input.currency?.toUpperCase(),
      });
      return NextResponse.json(result, { status: 201 });
    }
    if (action === "confirmPilotPayment") {
      const input = confirmPilotPaymentSchema.parse(body);
      return NextResponse.json(await confirmPilotPayment(superAdmin.userId, input.tenantId, input));
    }
    if (action === "updatePilotChecklist") {
      const input = checklistSchema.parse(body);
      return NextResponse.json(await updatePilotChecklist(superAdmin.userId, input.tenantId, input));
    }
    if (action === "startPilot") {
      const input = startPilotSchema.parse(body);
      return NextResponse.json(await startPilot(superAdmin.userId, input.tenantId, input));
    }
    if (action === "startPilotEvaluation") {
      const input = evaluationSchema.parse(body);
      return NextResponse.json(await startPilotEvaluation(superAdmin.userId, input.tenantId, input));
    }
    if (action === "convertPilot") {
      const input = convertSchema.parse(body);
      return NextResponse.json(await convertPilot(superAdmin.userId, input.tenantId, input));
    }
    if (action === "markPilotNotConverted") {
      const input = notConvertedSchema.parse(body);
      return NextResponse.json(await markPilotNotConverted(superAdmin.userId, input.tenantId, input));
    }
    if (action === "extendPilot") {
      const input = extendPilotSchema.parse(body);
      return NextResponse.json(await extendPilotExceptionally(superAdmin.userId, input.tenantId, input));
    }
    if (action === "cancelCommercialProcess") {
      const input = cancelCommercialSchema.parse(body);
      return NextResponse.json(await cancelCommercialProcess(superAdmin.userId, input.tenantId, input));
    }
    if (action === "setTenantFeature") {
      const input = entitlementSchema.parse(body);
      return NextResponse.json(await setTenantFeatureEntitlement({ actorUserId: superAdmin.userId, ...input }));
    }
    if (action === "updateImplementationStatus") {
      const input = implementationSchema.parse(body);
      return NextResponse.json(await updateImplementationStatus(superAdmin.userId, input.tenantId, input));
    }
    if (action === "markReferralCommissionPaid") {
      const input = referralPaidSchema.parse(body);
      return NextResponse.json(await markReferralCommissionPaid(superAdmin.userId, input.tenantId, input));
    }
    if (action === "correctCommercialProfile") {
      const input = correctionSchema.parse(body);
      return NextResponse.json(await correctCommercialProfile(superAdmin.userId, input.tenantId, input as Parameters<typeof correctCommercialProfile>[2]));
    }
    if (action === "validateCommercialPricingPolicy") {
      return NextResponse.json(await validateCommercialPricingPolicy());
    }
    if (action === "updatePricingRule") {
      const input = updatePricingRuleSchema.parse(body);
      const result = await updatePricingRule(superAdmin.userId, input.ruleId, {
        minUnits: input.minUnits,
        maxUnits: input.maxUnits,
        priceCents: input.priceCents,
        isActive: input.isActive,
      });
      return NextResponse.json(result);
    }
    if (action === "deletePricingRule") {
      const input = pricingRuleIdSchema.parse(body);
      const result = await deletePricingRule(superAdmin.userId, input.ruleId);
      return NextResponse.json(result);
    }
    if (action === "updatePricingCaps") {
      const input = pricingCapsSchema.parse(body);
      const result = await updatePricingRuleCaps(superAdmin.userId, {
        minCents: input.minCop * 100,
        maxCents: input.maxCop * 100,
      });
      return NextResponse.json(result);
    }
    if (action === "resendTenantInvitation") {
      const input = resendInvitationSchema.parse(body);
      try {
        const target = await requireSuperAdminTenantTarget(session, input.tenantId);
        const result = await resendInvitation({
          tenantId: target.targetTenantId,
          invitationId: input.invitationId,
          actorUserId: target.identity.userId,
          origin: req.headers.get("x-forwarded-for") || "super-admin",
        });
        return NextResponse.json({
          email: publicInvitationEmailResult(result.emailResult),
        });
      } catch (error) {
        const authorizationResponse = getAuthorizationErrorResponse(error);
        if (authorizationResponse) return authorizationResponse;
        const mapped = mapInvitationError(error);
        return NextResponse.json(
          { error: mapped.message },
          { status: mapped.status }
        );
      }
    }
    if (action === "updateGraceDays") {
      const input = graceDaysSchema.parse(body);
      const result = await upsertPlatformSetting({
        key: "gracePeriodDays",
        value: input.graceDays,
        updatedById: superAdmin.userId,
      });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Datos invalidos" : error instanceof Error ? error.message : "No se pudo completar la accion";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
