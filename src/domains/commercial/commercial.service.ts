import { AuditAction, CommercialBillingMode, CommercialImplementationType, Prisma, ReferralAgreementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { calculatePriceForUnits } from "@/domains/billing/billing.service";
import { createInvitation } from "@/domains/organizations/invitation.service";
import { normalizeInvitationEmail } from "@/domains/organizations/invitation-security";
import { INITIAL_PQRS_CATEGORIES } from "@/domains/pqrs/pqrs-category-policy";
import { normalizeSlug } from "@/domains/platform/tenant-admin.service";
import { ASSISTED_IMPLEMENTATION_FEE_CENTS, MAX_FOUNDER_CUSTOMERS, addCalendarDays, addCalendarMonths, annualTerms, applyBasisPointDiscount, assertCommercialDiscount, commercialRequestHash, normalizeCommercialOperationId, pilotDatesFromPayment } from "./commercial-policy";
import { runCommercialTransaction } from "./commercial-transaction";

type Tx = Prisma.TransactionClient;

export class CommercialConflictError extends Error {
  constructor(message = "La operacion comercial entra en conflicto con el estado actual") {
    super(message);
    this.name = "CommercialConflictError";
  }
}

async function lockOperation(tx: Tx, tenantId: string, operationId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial:${tenantId}:${operationId}`}, 0))`;
}

async function previousOperation(tx: Tx, tenantId: string, operationId: string, action: string, requestHash: string) {
  const previous = await tx.commercialOperation.findUnique({ where: { tenantId_operationId: { tenantId, operationId } } });
  if (!previous) return null;
  if (previous.action !== action || previous.requestHash !== requestHash) throw new CommercialConflictError("El operationId ya fue usado con datos distintos");
  return previous;
}

async function saveOperation(tx: Tx, input: { tenantId: string; operationId: string; action: string; requestHash: string; actorUserId: string; result: Prisma.InputJsonValue }) {
  await tx.commercialOperation.create({ data: input });
}

function assertPositiveMoney(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} invalido`);
}

export async function founderSlotsRemaining() {
  const used = await prisma.tenantCommercialProfile.count({ where: { isFounderCustomer: true } });
  return Math.max(0, MAX_FOUNDER_CUSTOMERS - used);
}

export async function getTenantCommercialSummary(tenantId: string) {
  const [profile, entitlements, metrics, slots] = await Promise.all([
    prisma.tenantCommercialProfile.findUnique({ where: { tenantId } }),
    prisma.tenantFeatureEntitlement.findMany({ where: { tenantId }, orderBy: { feature: "asc" } }),
    getPilotMetrics(tenantId), founderSlotsRemaining(),
  ]);
  return { profile, entitlements, metrics, founderSlotsRemaining: slots };
}

export type CreatePaidPilotTenantInput = {
  operationId: string; name: string; slug?: string; city?: string; address?: string; units: number;
  adminName: string; adminEmail: string; adminPhone?: string; pilotPriceCents?: number; monthlyPriceCents?: number;
  manualQuoteReason?: string; implementationType: CommercialImplementationType; referralName?: string;
  referralContact?: string; referralAgreementType?: ReferralAgreementType; reservationsEnabled?: boolean;
  residentPaymentsEnabled?: boolean; nextAction?: string; nextActionDueAt?: Date;
};

export async function createPaidPilotTenant(actorUserId: string, input: CreatePaidPilotTenantInput) {
  const operationId = normalizeCommercialOperationId(input.operationId);
  if (!input.name.trim() || !input.adminName.trim()) throw new Error("Nombre del conjunto y administrador son obligatorios");
  if (!Number.isSafeInteger(input.units) || input.units <= 0) throw new Error("Las unidades deben ser un entero positivo");
  const adminEmail = normalizeInvitationEmail(input.adminEmail);
  const slug = normalizeSlug(input.slug || input.name);
  const manualQuote = input.units > 600;
  let pilotPriceCents: number;
  let monthlyPriceCents: number;
  let currency = "COP";
  if (manualQuote) {
    assertPositiveMoney(input.pilotPriceCents || 0, "Precio manual del piloto");
    assertPositiveMoney(input.monthlyPriceCents || 0, "Precio mensual manual");
    if (!input.manualQuoteReason?.trim()) throw new Error("La cotizacion de mas de 600 unidades requiere motivo");
    pilotPriceCents = input.pilotPriceCents as number;
    monthlyPriceCents = input.monthlyPriceCents as number;
  } else {
    const [pilot, monthly] = await Promise.all([calculatePriceForUnits(input.units, "PILOT"), calculatePriceForUnits(input.units, "MONTHLY")]);
    pilotPriceCents = pilot.priceCents;
    monthlyPriceCents = monthly.priceCents;
    currency = monthly.currency;
  }
  const requestHash = commercialRequestHash("CREATE_PILOT_TENANT", { ...input, adminEmail, slug, pilotPriceCents, monthlyPriceCents, currency });

  return runCommercialTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial-create:${operationId}`}, 0))`;
    const existing = await tx.tenantCommercialProfile.findUnique({ where: { creationOperationId: operationId } });
    if (existing) {
      if (existing.creationRequestHash !== requestHash) throw new CommercialConflictError("El operationId de creacion ya fue usado con datos distintos");
      return { tenantId: existing.tenantId, profile: existing, idempotent: true };
    }
    const now = new Date();
    const tenant = await tx.tenant.create({ data: { name: input.name.trim(), slug, city: input.city?.trim() || null, address: input.address?.trim() || null, units: input.units, status: "PENDING_PAYMENT" } });
    const subscription = await tx.subscription.create({ data: { tenantId: tenant.id, status: "PENDING_PAYMENT", autoRenew: false, unitsSnapshot: input.units, priceCents: monthlyPriceCents, currency, currentPeriodStart: now, currentPeriodEnd: now, trialEndsAt: null } });
    const profile = await tx.tenantCommercialProfile.create({ data: {
      tenantId: tenant.id, creationOperationId: operationId, creationRequestHash: requestHash,
      commercialStatus: "PILOT_PENDING_PAYMENT", pilotPriceCents, postPilotListPriceCents: monthlyPriceCents,
      postPilotContractPriceCents: monthlyPriceCents, currency, nextAction: input.nextAction?.trim() || "Confirmar pago del piloto",
      nextActionDueAt: input.nextActionDueAt || null, primaryAdminName: input.adminName.trim(), primaryAdminEmail: adminEmail,
      primaryAdminPhone: input.adminPhone?.trim() || null, implementationType: input.implementationType,
      implementationListFeeCents: input.implementationType === "ASSISTED" ? ASSISTED_IMPLEMENTATION_FEE_CENTS : 0,
      implementationEffectiveFeeCents: input.implementationType === "ASSISTED" ? ASSISTED_IMPLEMENTATION_FEE_CENTS : 0,
      referralName: input.referralName?.trim() || null, referralContact: input.referralContact?.trim() || null,
      referralAgreementType: input.referralAgreementType || "NONE", commissionStatus: input.referralName ? "PENDING_CONVERSION" : "NOT_APPLICABLE",
      manualQuoteReason: manualQuote ? input.manualQuoteReason!.trim() : null,
      manualQuoteApprovedById: manualQuote ? actorUserId : null, manualQuoteApprovedAt: manualQuote ? now : null,
    } });
    await tx.tenantFeatureEntitlement.createMany({ data: [
      { tenantId: tenant.id, feature: "RESERVATIONS", status: input.reservationsEnabled ? "SETUP" : "DISABLED", effectiveAt: now, updatedById: actorUserId, reason: "Alcance definido al crear el piloto" },
      { tenantId: tenant.id, feature: "RESIDENT_PAYMENTS", status: input.residentPaymentsEnabled ? "SETUP" : "DISABLED", effectiveAt: now, updatedById: actorUserId, reason: "Alcance definido al crear el piloto" },
    ] });
    await tx.pqrsCategory.createMany({ data: INITIAL_PQRS_CATEGORIES.map((category) => ({ tenantId: tenant.id, ...category, isActive: true, isCustom: false, createdByUserId: actorUserId })), skipDuplicates: true });
    await registerAuditLog({ actorUserId, tenantId: tenant.id, action: AuditAction.TENANT_CREATED, targetType: "Tenant", targetId: tenant.id, metadata: { operationId, commercialStatus: profile.commercialStatus, units: input.units, pilotPriceCents, monthlyPriceCents, manualQuote, invitationDeferred: true } }, tx);
    await registerAuditLog({ actorUserId, tenantId: tenant.id, action: AuditAction.SUBSCRIPTION_CREATED, targetType: "Subscription", targetId: subscription.id, metadata: { operationId, status: "PENDING_PAYMENT", trialEndsAt: null, priceCents: monthlyPriceCents } }, tx);
    return { tenantId: tenant.id, profile, idempotent: false };
  });
}

async function ensurePilotAdminInvitation(actorUserId: string, tenantId: string) {
  const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
  if (profile.administratorInvitedAt) return { ok: true as const, alreadyInvited: true };
  if (!profile.primaryAdminEmail) return { ok: false as const, error: "El perfil comercial no tiene correo de administrador" };

  try {
    const existing = await prisma.invitation.findFirst({
      where: { tenantId, email: { equals: profile.primaryAdminEmail, mode: "insensitive" }, role: "ADMIN", status: "PENDING", expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    if (!existing) {
      await createInvitation({ tenantId, email: profile.primaryAdminEmail, role: "ADMIN", invitedById: actorUserId });
    }
    await prisma.tenantCommercialProfile.updateMany({
      where: { tenantId, administratorInvitedAt: null },
      data: { administratorInvitedAt: existing?.createdAt || new Date(), nextAction: "Completar preparacion del piloto" },
    });
    return { ok: true as const, alreadyInvited: Boolean(existing) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "No fue posible crear la invitacion" };
  }
}

export type ConfirmPilotPaymentInput = {
  operationId: string;
  amountCents: number;
  paidAt?: Date;
  manualReference: string;
};

export async function confirmPilotPayment(actorUserId: string, tenantId: string, input: ConfirmPilotPaymentInput) {
  const operationId = normalizeCommercialOperationId(input.operationId);
  assertPositiveMoney(input.amountCents, "Valor recibido");
  if (!input.manualReference.trim()) throw new Error("La referencia de la transferencia es obligatoria");
  const paidAt = input.paidAt || new Date();
  const requestHash = commercialRequestHash("CONFIRM_PILOT_PAYMENT", { amountCents: input.amountCents, paidAt, manualReference: input.manualReference.trim() });

  const result = await runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "CONFIRM_PILOT_PAYMENT", requestHash);
    if (previous) return { idempotent: true, result: previous.result };

    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    const subscription = await tx.subscription.findUniqueOrThrow({ where: { tenantId } });
    if (profile.commercialStatus !== "PILOT_PENDING_PAYMENT") throw new CommercialConflictError("El conjunto no esta pendiente de pago del piloto");
    if (!profile.pilotPriceCents || input.amountCents !== profile.pilotPriceCents) throw new Error("El valor recibido no coincide con el precio del piloto");
    const existingPayment = await tx.payment.findFirst({ where: { tenantId, concept: "PILOT", status: "APPROVED" }, select: { id: true } });
    if (existingPayment) throw new CommercialConflictError("El pago del piloto ya fue confirmado");

    const dates = pilotDatesFromPayment(paidAt);
    const { recommendedLaunchAt, ...persistedPilotDates } = dates;
    const payment = await tx.payment.create({ data: {
      tenantId, subscriptionId: subscription.id, amountCents: input.amountCents, listAmountCents: profile.pilotPriceCents,
      discountBps: 0, currency: profile.currency, status: "APPROVED", provider: "MANUAL_TRANSFER", concept: "PILOT",
      dueDate: paidAt, paidAt, periodStart: paidAt, periodEnd: dates.pilotAccessEndsAt,
      operationId, requestHash, recordedByUserId: actorUserId, manualReference: input.manualReference.trim(),
      approvedEffectAppliedAt: paidAt,
    } });
    await tx.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", currentPeriodStart: paidAt, currentPeriodEnd: dates.pilotAccessEndsAt, graceEndsAt: null, trialEndsAt: null } });
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: {
      commercialStatus: "PILOT_PREPARATION", ...persistedPilotDates, pilotPaymentConfirmedAt: paidAt,
      nextAction: "Preparar y lanzar el piloto", nextActionDueAt: recommendedLaunchAt,
    } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.PILOT_PAYMENT_CONFIRMED, targetType: "Payment", targetId: payment.id, metadata: { operationId, amountCents: payment.amountCents, provider: payment.provider, manualReference: payment.manualReference, pilotAccessEndsAt: dates.pilotAccessEndsAt.toISOString() } }, tx);
    const operationResult = { paymentId: payment.id, commercialStatus: updated.commercialStatus };
    await saveOperation(tx, { tenantId, operationId, action: "CONFIRM_PILOT_PAYMENT", requestHash, actorUserId, result: operationResult });
    return { idempotent: false, result: operationResult };
  });

  const invitation = await ensurePilotAdminInvitation(actorUserId, tenantId);
  return { ...result, invitation };
}

const CHECKLIST_FIELDS = [
  "documentsAcceptedAt", "residentBaseReceivedAt", "categoriesConfiguredAt", "trainingCompletedAt",
  "smokeTestApprovedAt", "launchCommunicationSentAt",
] as const;
type ChecklistField = (typeof CHECKLIST_FIELDS)[number];

export async function updatePilotChecklist(actorUserId: string, tenantId: string, input: { operationId: string; field: ChecklistField; completed: boolean }) {
  if (!CHECKLIST_FIELDS.includes(input.field)) throw new Error("Hito de preparacion invalido");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("UPDATE_PILOT_CHECKLIST", { field: input.field, completed: input.completed });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "UPDATE_PILOT_CHECKLIST", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (!["PILOT_PREPARATION", "PILOT_ACTIVE"].includes(profile.commercialStatus)) throw new CommercialConflictError("El checklist no se puede modificar en este estado");
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { [input.field]: input.completed ? new Date() : null } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, field: input.field, before: profile[input.field]?.toISOString() || null, after: updated[input.field]?.toISOString() || null } }, tx);
    const result = { field: input.field, completed: Boolean(updated[input.field]) };
    await saveOperation(tx, { tenantId, operationId, action: "UPDATE_PILOT_CHECKLIST", requestHash, actorUserId, result });
    return result;
  });
}

export async function startPilot(actorUserId: string, tenantId: string, input: { operationId: string; realUseStartsAt?: Date; exceptionReason?: string }) {
  const operationId = normalizeCommercialOperationId(input.operationId);
  const realUseStartsAt = input.realUseStartsAt || new Date();
  const requestHash = commercialRequestHash("START_PILOT", { realUseStartsAt, exceptionReason: input.exceptionReason?.trim() || null });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "START_PILOT", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (profile.commercialStatus !== "PILOT_PREPARATION") throw new CommercialConflictError("El piloto no esta en preparacion");
    if (!profile.pilotPaymentConfirmedAt || !profile.administratorInvitedAt || !profile.categoriesConfiguredAt || !profile.trainingCompletedAt || !profile.smokeTestApprovedAt) {
      throw new Error("Faltan hitos obligatorios antes de iniciar el piloto");
    }
    if (!profile.pilotAccessEndsAt || realUseStartsAt > profile.pilotAccessEndsAt) throw new Error("La fecha de inicio esta fuera de la vigencia pagada");
    const recommendedLaunchAt = addCalendarDays(profile.pilotPaymentConfirmedAt, 7);
    const needsException = !profile.residentBaseReceivedAt || !profile.launchCommunicationSentAt || realUseStartsAt > recommendedLaunchAt;
    if (needsException && !input.exceptionReason?.trim()) throw new Error("El lanzamiento requiere una justificacion operativa");
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: {
      commercialStatus: "PILOT_ACTIVE", pilotLaunchAt: new Date(), pilotRealUseStartsAt: realUseStartsAt,
      launchExceptionReason: needsException ? input.exceptionReason!.trim() : null,
      nextAction: "Evaluar conversion del piloto", nextActionDueAt: profile.pilotEvaluationAt,
    } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.PILOT_STARTED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, realUseStartsAt: realUseStartsAt.toISOString(), pilotAccessEndsAt: profile.pilotAccessEndsAt.toISOString(), exceptionReason: updated.launchExceptionReason } }, tx);
    const result = { commercialStatus: updated.commercialStatus, pilotAccessEndsAt: updated.pilotAccessEndsAt?.toISOString() || null };
    await saveOperation(tx, { tenantId, operationId, action: "START_PILOT", requestHash, actorUserId, result });
    return result;
  });
}

export async function startPilotEvaluation(actorUserId: string, tenantId: string, input: { operationId: string; notes?: string; supportMinutes?: number; outsideRequests?: number; meetings?: number }) {
  const operationId = normalizeCommercialOperationId(input.operationId);
  for (const value of [input.supportMinutes, input.outsideRequests, input.meetings]) if (value != null && (!Number.isSafeInteger(value) || value < 0)) throw new Error("Las metricas manuales deben ser enteros no negativos");
  const payload = { notes: input.notes?.trim() || null, supportMinutes: input.supportMinutes ?? 0, outsideRequests: input.outsideRequests ?? 0, meetings: input.meetings ?? 0 };
  const requestHash = commercialRequestHash("START_PILOT_EVALUATION", payload);
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "START_PILOT_EVALUATION", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (profile.commercialStatus !== "PILOT_ACTIVE") throw new CommercialConflictError("Solo un piloto activo puede pasar a evaluacion");
    const now = new Date();
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commercialStatus: "PILOT_EVALUATION", pilotEvaluationAt: now, qualitativeFeedback: payload.notes, manualSupportMinutes: payload.supportMinutes, manualOutsideRequests: payload.outsideRequests, manualMeetings: payload.meetings, nextAction: "Registrar decision de conversion", nextActionDueAt: profile.decisionDueAt } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.PILOT_EVALUATION_STARTED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, metrics: payload } }, tx);
    const result = { commercialStatus: updated.commercialStatus, pilotEvaluationAt: now.toISOString() };
    await saveOperation(tx, { tenantId, operationId, action: "START_PILOT_EVALUATION", requestHash, actorUserId, result });
    return result;
  });
}

export type ConvertPilotInput = {
  operationId: string;
  billingMode: CommercialBillingMode;
  amountCents: number;
  paidAt?: Date;
  manualReference: string;
  discountBps?: number;
  discountReason?: string;
  discountStartsAt?: Date;
  discountEndsAt?: Date;
};

export async function convertPilot(actorUserId: string, tenantId: string, input: ConvertPilotInput) {
  const operationId = normalizeCommercialOperationId(input.operationId);
  const paidAt = input.paidAt || new Date();
  if (!input.manualReference.trim()) throw new Error("La referencia del pago es obligatoria");
  assertPositiveMoney(input.amountCents, "Valor recibido");
  const discountBps = input.discountBps || 0;
  if (input.billingMode === "ANNUAL" && discountBps !== 0) throw new Error("La anualidad no admite un descuento comercial adicional");
  if (input.billingMode === "MONTHLY") assertCommercialDiscount({ discountBps, reason: input.discountReason, startsAt: input.discountStartsAt, endsAt: input.discountEndsAt });
  const requestPayload = { ...input, paidAt, manualReference: input.manualReference.trim(), discountBps };
  const requestHash = commercialRequestHash("CONVERT_PILOT", requestPayload);

  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('commercial:founder-slots', 0))`;
    const previous = await previousOperation(tx, tenantId, operationId, "CONVERT_PILOT", requestHash);
    if (previous) return previous.result;

    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    const subscription = await tx.subscription.findUniqueOrThrow({ where: { tenantId } });
    if (!["PILOT_ACTIVE", "PILOT_EVALUATION"].includes(profile.commercialStatus)) throw new CommercialConflictError("El piloto no esta disponible para conversion");
    if (!profile.postPilotListPriceCents) throw new Error("La ficha no tiene precio mensual posterior");

    const annual = input.billingMode === "ANNUAL" ? annualTerms(profile.postPilotListPriceCents) : null;
    const listAmountCents = annual?.listPriceCents || profile.postPilotListPriceCents;
    const appliedDiscountBps = annual?.discountBps || discountBps;
    const effectiveAmountCents = annual?.effectivePriceCents || applyBasisPointDiscount(listAmountCents, discountBps);
    if (input.amountCents !== effectiveAmountCents) throw new Error("El valor recibido no coincide con el precio efectivo calculado");

    const periodStart = profile.pilotAccessEndsAt && profile.pilotAccessEndsAt > paidAt ? profile.pilotAccessEndsAt : paidAt;
    const periodEnd = input.billingMode === "ANNUAL" ? addCalendarMonths(periodStart, 12) : addCalendarMonths(periodStart, 1);
    const concept = input.billingMode === "ANNUAL" ? "SUBSCRIPTION_ANNUAL" : "SUBSCRIPTION_MONTHLY";
    const payment = await tx.payment.create({ data: {
      tenantId, subscriptionId: subscription.id, amountCents: effectiveAmountCents, listAmountCents, discountBps: appliedDiscountBps,
      currency: profile.currency, status: "APPROVED", provider: "MANUAL_TRANSFER", concept,
      dueDate: paidAt, paidAt, periodStart, periodEnd, operationId, requestHash,
      recordedByUserId: actorUserId, manualReference: input.manualReference.trim(), approvedEffectAppliedAt: paidAt,
    } });

    let founderNumber = profile.founderNumber;
    let founderGrantedAt = profile.founderGrantedAt;
    let isFounderCustomer = profile.isFounderCustomer;
    if (!isFounderCustomer) {
      const assigned = await tx.tenantCommercialProfile.count({ where: { isFounderCustomer: true } });
      if (assigned < MAX_FOUNDER_CUSTOMERS) {
        isFounderCustomer = true;
        founderNumber = assigned + 1;
        founderGrantedAt = paidAt;
      }
    }
    const founderData = isFounderCustomer ? {
      isFounderCustomer: true, founderNumber, founderGrantedAt,
      priceProtectedUntil: profile.priceProtectedUntil || addCalendarMonths(founderGrantedAt || paidAt, 12),
      implementationType: "FOUNDER_WAIVED" as const, implementationFeeWaived: true,
      implementationListFeeCents: profile.implementationListFeeCents || ASSISTED_IMPLEMENTATION_FEE_CENTS,
      implementationEffectiveFeeCents: 0, implementationStatus: "WAIVED" as const,
    } : {};
    const commercialStatus = input.billingMode === "ANNUAL" ? "CONVERTED_ANNUAL" : "CONVERTED_MONTHLY";
    const referralStatus = profile.referralAgreementType === "NONE"
      ? "NOT_APPLICABLE"
      : input.billingMode === "ANNUAL" ? "MANUAL_REVIEW" : "PENDING_PAYMENTS";

    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: {
      commercialStatus, billingMode: input.billingMode, convertedAt: paidAt, contractedPeriodEndsAt: periodEnd,
      postPilotContractPriceCents: input.billingMode === "MONTHLY" ? effectiveAmountCents : profile.postPilotListPriceCents,
      discountBps: appliedDiscountBps, discountListPriceCents: listAmountCents, discountEffectivePriceCents: effectiveAmountCents,
      discountReason: input.billingMode === "MONTHLY" && discountBps ? input.discountReason!.trim() : "Descuento anual del 10 %",
      discountStartsAt: input.billingMode === "MONTHLY" && discountBps ? input.discountStartsAt : periodStart,
      discountEndsAt: input.billingMode === "MONTHLY" && discountBps ? input.discountEndsAt : periodEnd,
      discountApprovedById: appliedDiscountBps ? actorUserId : null, commissionStatus: referralStatus,
      nextAction: "Acompanhar adopcion y renovacion", nextActionDueAt: periodEnd, ...founderData,
    } });
    await tx.subscription.update({ where: { id: subscription.id }, data: {
      status: "ACTIVE", unitsSnapshot: subscription.unitsSnapshot, priceCents: input.billingMode === "MONTHLY" ? effectiveAmountCents : profile.postPilotListPriceCents,
      currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, graceEndsAt: null, trialEndsAt: null,
    } });
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "ACTIVE" } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.PILOT_CONVERTED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, billingMode: input.billingMode, paymentId: payment.id, listAmountCents, effectiveAmountCents, discountBps: appliedDiscountBps, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), founderNumber: updated.founderNumber } }, tx);
    const result = { commercialStatus: updated.commercialStatus, paymentId: payment.id, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString(), founderNumber: updated.founderNumber };
    await saveOperation(tx, { tenantId, operationId, action: "CONVERT_PILOT", requestHash, actorUserId, result });
    return result;
  });
}

export async function markPilotNotConverted(actorUserId: string, tenantId: string, input: { operationId: string; reason: string }) {
  if (!input.reason.trim()) throw new Error("Debes registrar el motivo de no conversion");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("MARK_NOT_CONVERTED", { reason: input.reason.trim() });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "MARK_NOT_CONVERTED", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (!["PILOT_ACTIVE", "PILOT_EVALUATION"].includes(profile.commercialStatus)) throw new CommercialConflictError("El piloto no puede marcarse como no convertido");
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commercialStatus: "NOT_CONVERTED", nextAction: "Cerrar acceso al terminar el periodo pagado", nextActionDueAt: profile.pilotAccessEndsAt, commercialNotes: input.reason.trim() } });
    await tx.subscription.update({ where: { tenantId }, data: { autoRenew: false } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, before: profile.commercialStatus, after: updated.commercialStatus, reason: input.reason.trim() } }, tx);
    const result = { commercialStatus: updated.commercialStatus };
    await saveOperation(tx, { tenantId, operationId, action: "MARK_NOT_CONVERTED", requestHash, actorUserId, result });
    return result;
  });
}

const CORRECTABLE_FIELDS = [
  "pilotPreparationStartsAt", "pilotLaunchAt", "pilotRealUseStartsAt", "pilotEvaluationAt", "decisionDueAt",
  "pilotAccessEndsAt", "pilotPriceCents", "postPilotContractPriceCents", "nextAction", "nextActionDueAt",
  "billingMode", "implementationType", "referralName", "referralContact", "referralAgreementType", "commercialNotes",
] as const;
type CorrectableField = (typeof CORRECTABLE_FIELDS)[number];
type CorrectableValue = string | number | Date | null;

export async function correctCommercialProfile(actorUserId: string, tenantId: string, input: { operationId: string; reason: string; changes: Partial<Record<CorrectableField, CorrectableValue>> }) {
  if (!input.reason.trim()) throw new Error("La correccion requiere motivo");
  const entries = Object.entries(input.changes);
  if (!entries.length || entries.some(([key]) => !CORRECTABLE_FIELDS.includes(key as CorrectableField))) throw new Error("La correccion contiene campos no permitidos");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("CORRECT_COMMERCIAL_PROFILE", { reason: input.reason.trim(), changes: input.changes });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "CORRECT_COMMERCIAL_PROFILE", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    const preConversion = ["LEGACY_REVIEW", "PILOT_PENDING_PAYMENT", "PILOT_PREPARATION", "PILOT_ACTIVE", "PILOT_EVALUATION"].includes(profile.commercialStatus);
    const data: Prisma.TenantCommercialProfileUpdateInput = {};
    for (const [key, value] of entries as [CorrectableField, CorrectableValue][]) {
      if (["pilotPreparationStartsAt", "pilotLaunchAt", "pilotRealUseStartsAt", "pilotEvaluationAt", "decisionDueAt", "pilotAccessEndsAt", "nextActionDueAt"].includes(key)) {
        if (value !== null && !(value instanceof Date) || value instanceof Date && Number.isNaN(value.getTime())) throw new Error(`Fecha invalida para ${key}`);
        Object.assign(data, { [key]: value });
      } else if (key === "pilotPriceCents" || key === "postPilotContractPriceCents") {
        if (!preConversion) throw new CommercialConflictError("El precio pactado convertido no se corrige por esta accion");
        if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error("El precio pactado debe ser un entero positivo");
        Object.assign(data, { [key]: value });
      } else if (key === "billingMode") {
        if (!preConversion) throw new CommercialConflictError("La modalidad convertida no se corrige por esta accion");
        if (value !== null && value !== "MONTHLY" && value !== "ANNUAL") throw new Error("Modalidad comercial invalida");
        data.billingMode = value as CommercialBillingMode | null;
      } else if (key === "implementationType") {
        if (value !== "STANDARD" && value !== "ASSISTED" && value !== "FOUNDER_WAIVED") throw new Error("Tipo de implementacion invalido");
        data.implementationType = value;
      } else if (key === "referralAgreementType") {
        if (value !== "NONE" && value !== "GENERAL" && value !== "FOUNDER_EXCEPTION") throw new Error("Acuerdo de referido invalido");
        data.referralAgreementType = value;
      } else {
        if (value !== null && typeof value !== "string") throw new Error(`Valor invalido para ${key}`);
        Object.assign(data, { [key]: typeof value === "string" ? value.trim() : null });
      }
    }
    const candidate = { ...profile, ...data };
    if (candidate.pilotAccessEndsAt && candidate.pilotPreparationStartsAt && candidate.pilotAccessEndsAt <= candidate.pilotPreparationStartsAt) throw new Error("El fin del piloto debe ser posterior al inicio de preparacion");
    if (candidate.pilotRealUseStartsAt && candidate.pilotAccessEndsAt && candidate.pilotRealUseStartsAt > candidate.pilotAccessEndsAt) throw new Error("El uso real no puede iniciar despues del fin del piloto");
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data });
    if (data.postPilotContractPriceCents !== undefined && typeof data.postPilotContractPriceCents === "number") {
      await tx.subscription.update({ where: { tenantId }, data: { priceCents: data.postPilotContractPriceCents } });
    }
    if (data.pilotAccessEndsAt !== undefined && data.pilotAccessEndsAt instanceof Date && ["PILOT_PREPARATION", "PILOT_ACTIVE", "PILOT_EVALUATION"].includes(profile.commercialStatus)) {
      await tx.subscription.update({ where: { tenantId }, data: { currentPeriodEnd: data.pilotAccessEndsAt } });
    }
    const before = Object.fromEntries(entries.map(([key]) => [key, profile[key as CorrectableField]]));
    const after = Object.fromEntries(entries.map(([key]) => [key, updated[key as CorrectableField]]));
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, reason: input.reason.trim(), before, after } }, tx);
    const result = { profileId: updated.id, changedFields: entries.map(([key]) => key) };
    await saveOperation(tx, { tenantId, operationId, action: "CORRECT_COMMERCIAL_PROFILE", requestHash, actorUserId, result });
    return result;
  });
}

export async function extendPilotExceptionally(actorUserId: string, tenantId: string, input: { operationId: string; days: number; reason: string }) {
  if (!Number.isSafeInteger(input.days) || input.days < 1 || input.days > 30) throw new Error("La extension excepcional debe estar entre 1 y 30 dias");
  if (!input.reason.trim()) throw new Error("La extension excepcional requiere motivo");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("EXTEND_PILOT", { days: input.days, reason: input.reason.trim() });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "EXTEND_PILOT", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (!["PILOT_ACTIVE", "PILOT_EVALUATION"].includes(profile.commercialStatus) || !profile.pilotAccessEndsAt) throw new CommercialConflictError("El piloto no admite una extension");
    const extendedUntil = addCalendarDays(profile.pilotAccessEndsAt, input.days);
    await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { pilotAccessEndsAt: extendedUntil, decisionDueAt: extendedUntil, nextActionDueAt: extendedUntil, commercialNotes: input.reason.trim() } });
    await tx.subscription.update({ where: { tenantId }, data: { currentPeriodEnd: extendedUntil } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, change: "PILOT_EXTENSION", days: input.days, before: profile.pilotAccessEndsAt.toISOString(), after: extendedUntil.toISOString(), reason: input.reason.trim() } }, tx);
    const result = { pilotAccessEndsAt: extendedUntil.toISOString() };
    await saveOperation(tx, { tenantId, operationId, action: "EXTEND_PILOT", requestHash, actorUserId, result });
    return result;
  });
}

export async function cancelCommercialProcess(actorUserId: string, tenantId: string, input: { operationId: string; reason: string }) {
  if (!input.reason.trim()) throw new Error("La cancelacion requiere motivo");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("CANCEL_COMMERCIAL_PROCESS", { reason: input.reason.trim() });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "CANCEL_COMMERCIAL_PROCESS", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (["CANCELLED", "CONVERTED_MONTHLY", "CONVERTED_ANNUAL"].includes(profile.commercialStatus)) throw new CommercialConflictError("El proceso comercial no se puede cancelar en este estado");
    const now = new Date();
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commercialStatus: "CANCELLED", commissionStatus: profile.referralAgreementType === "NONE" ? "NOT_APPLICABLE" : "CANCELLED", nextAction: null, nextActionDueAt: null, commercialNotes: input.reason.trim() } });
    await tx.subscription.update({ where: { tenantId }, data: { status: "CANCELLED", autoRenew: false } });
    await tx.tenant.update({ where: { id: tenantId }, data: { status: "CANCELLED", cancelledAt: now } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, before: profile.commercialStatus, after: updated.commercialStatus, reason: input.reason.trim() } }, tx);
    const result = { commercialStatus: updated.commercialStatus };
    await saveOperation(tx, { tenantId, operationId, action: "CANCEL_COMMERCIAL_PROCESS", requestHash, actorUserId, result });
    return result;
  });
}

export async function updateImplementationStatus(actorUserId: string, tenantId: string, input: { operationId: string; status: "PENDING" | "IN_PROGRESS" | "COMPLETED"; reason: string }) {
  if (!input.reason.trim()) throw new Error("El cambio de implementacion requiere motivo");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const requestHash = commercialRequestHash("UPDATE_IMPLEMENTATION", { status: input.status, reason: input.reason.trim() });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "UPDATE_IMPLEMENTATION", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (profile.implementationStatus === "WAIVED") throw new CommercialConflictError("La implementacion exonerada no puede cambiar de estado");
    const now = new Date();
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { implementationStatus: input.status, implementationStartsAt: input.status === "IN_PROGRESS" ? (profile.implementationStartsAt || now) : profile.implementationStartsAt, implementationCompletedAt: input.status === "COMPLETED" ? now : null } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, change: "IMPLEMENTATION_STATUS", before: profile.implementationStatus, after: updated.implementationStatus, reason: input.reason.trim() } }, tx);
    const result = { implementationStatus: updated.implementationStatus };
    await saveOperation(tx, { tenantId, operationId, action: "UPDATE_IMPLEMENTATION", requestHash, actorUserId, result });
    return result;
  });
}

export async function refreshReferralCommission(tenantId: string) {
  return runCommercialTransaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`commercial:referral:${tenantId}`}, 0))`;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (profile.referralAgreementType === "NONE" || profile.commissionStatus === "PAID" || profile.commissionStatus === "CANCELLED") return profile;
    if (profile.billingMode === "ANNUAL") return tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commissionStatus: "MANUAL_REVIEW" } });
    const monthlyPayments = await tx.payment.findMany({
      where: { tenantId, concept: "SUBSCRIPTION_MONTHLY", status: "APPROVED", amountCents: { gt: 0 } },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }], select: { id: true, amountCents: true, paidAt: true },
    });
    if (monthlyPayments.length < 2) return profile.commissionStatus === "PENDING_PAYMENTS" ? profile : tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commissionStatus: "PENDING_PAYMENTS" } });
    const secondPayment = monthlyPayments[1];
    return tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commissionStatus: "ELIGIBLE", commissionEligibleCents: secondPayment.amountCents, commissionEligibleAt: secondPayment.paidAt || new Date() } });
  });
}

export async function markReferralCommissionPaid(actorUserId: string, tenantId: string, input: { operationId: string; reference: string; paidAt?: Date }) {
  if (!input.reference.trim()) throw new Error("La referencia del pago de comision es obligatoria");
  const operationId = normalizeCommercialOperationId(input.operationId);
  const paidAt = input.paidAt || new Date();
  const requestHash = commercialRequestHash("MARK_REFERRAL_PAID", { reference: input.reference.trim(), paidAt });
  return runCommercialTransaction(async (tx) => {
    await lockOperation(tx, tenantId, operationId);
    const previous = await previousOperation(tx, tenantId, operationId, "MARK_REFERRAL_PAID", requestHash);
    if (previous) return previous.result;
    const profile = await tx.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId } });
    if (profile.commissionStatus !== "ELIGIBLE") throw new CommercialConflictError("La comision aun no es elegible");
    const updated = await tx.tenantCommercialProfile.update({ where: { tenantId }, data: { commissionStatus: "PAID", commissionPaidAt: paidAt, commissionPaymentReference: input.reference.trim() } });
    await registerAuditLog({ actorUserId, tenantId, action: AuditAction.COMMERCIAL_PROFILE_CHANGED, targetType: "TenantCommercialProfile", targetId: profile.id, metadata: { operationId, change: "REFERRAL_COMMISSION_PAID", amountCents: profile.commissionEligibleCents, reference: input.reference.trim(), paidAt: paidAt.toISOString() } }, tx);
    const result = { commissionStatus: updated.commissionStatus, commissionPaidAt: paidAt.toISOString() };
    await saveOperation(tx, { tenantId, operationId, action: "MARK_REFERRAL_PAID", requestHash, actorUserId, result });
    return result;
  });
}

export async function getPilotMetrics(tenantId: string, now = new Date()) {
  const profile = await prisma.tenantCommercialProfile.findUnique({ where: { tenantId } });
  const activityStart = profile?.pilotRealUseStartsAt || profile?.pilotPreparationStartsAt || undefined;
  const pqrsWhere = { tenantId, ...(activityStart ? { createdAt: { gte: activityStart } } : {}) };
  const [pqrsCreated, pqrsClosed, firstPqrs, invitations, activeUsers, supportTickets] = await Promise.all([
    prisma.pqrs.count({ where: pqrsWhere }),
    prisma.pqrs.count({ where: { ...pqrsWhere, estado: "TERMINADO" } }),
    prisma.pqrs.findFirst({ where: pqrsWhere, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.invitation.count({ where: { tenantId, ...(activityStart ? { createdAt: { gte: activityStart } } : {}) } }),
    prisma.tenantMembership.count({ where: { tenantId, isActive: true } }),
    prisma.supportTicket.count({ where: { tenantId, ...(activityStart ? { createdAt: { gte: activityStart } } : {}) } }),
  ]);
  const millisPerDay = 86_400_000;
  return {
    totalDaysRemaining: profile?.pilotAccessEndsAt ? Math.max(0, Math.ceil((profile.pilotAccessEndsAt.getTime() - now.getTime()) / millisPerDay)) : null,
    realUseDays: profile?.pilotRealUseStartsAt ? Math.max(0, Math.floor((Math.min(now.getTime(), profile.pilotAccessEndsAt?.getTime() || now.getTime()) - profile.pilotRealUseStartsAt.getTime()) / millisPerDay)) : 0,
    evaluationAt: profile?.pilotEvaluationAt || null,
    decisionDueAt: profile?.decisionDueAt || null,
    pqrsCreated, pqrsClosed, firstPqrsAt: firstPqrs?.createdAt || null, usersInvited: invitations,
    usersActivated: activeUsers, supportTickets, nextAction: profile?.nextAction || null, nextActionDueAt: profile?.nextActionDueAt || null,
  };
}

export async function validateCommercialPricingPolicy() {
  const rules = await prisma.pricingRule.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { minUnits: "asc" }] });
  const expected = {
    MONTHLY: [[1, 100, 11_900_000], [101, 200, 15_900_000], [201, 400, 19_900_000], [401, 600, 24_900_000]],
    PILOT: [[1, 200, 9_900_000], [201, 400, 12_900_000], [401, 600, 15_900_000]],
  } as const;
  const issues: string[] = [];
  for (const type of ["MONTHLY", "PILOT"] as const) {
    const actual = rules.filter((rule) => rule.type === type);
    if (actual.length !== expected[type].length) issues.push(`${type}: cantidad de rangos incorrecta`);
    expected[type].forEach(([minUnits, maxUnits, priceCents], index) => {
      const rule = actual[index];
      if (!rule || rule.minUnits !== minUnits || rule.maxUnits !== maxUnits || rule.priceCents !== priceCents || rule.currency !== "COP") issues.push(`${type}: rango ${minUnits}-${maxUnits} no coincide con la politica vigente`);
    });
  }
  if (rules.some((rule) => rule.maxUnits == null || rule.maxUnits > 600)) issues.push("Existe una regla automatica para mas de 600 unidades");
  return { valid: issues.length === 0, issues, rules };
}
