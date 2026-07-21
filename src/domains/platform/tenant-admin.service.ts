import { AuditAction, SubscriptionStatus, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "./audit.service";
import { calculatePriceForUnits } from "@/domains/billing/billing.service";
import { updateMercadoPagoPreapprovalAmount } from "@/domains/billing/mercado-pago.service";
import { createInvitation } from "@/domains/organizations/invitation.service";

export type CreateTenantInput = {
  name: string;
  slug: string;
  city?: string;
  address?: string;
  units: number;
  adminName: string;
  adminEmail: string;
  adminPhone?: string;
};

export type CreateTenantResult = {
  tenantId: string;
  tenantSlug: string;
  adminEmail: string;
  invitationSent: boolean;
  invitationError?: string | null;
};

export async function listTenantsForSuperAdmin() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: true,
      users: {
        where: { role: "ADMIN" },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
      _count: {
        select: {
          users: true,
          pqrs: true,
        },
      },
    },
  });
}

export async function getTenantDetailForSuperAdmin(tenantId?: string | null) {
  if (!tenantId) return null;

  return prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      users: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          bloque: true,
          apto: true,
          createdAt: true,
        },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      },
      invitations: {
        where: { status: "PENDING" },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      subscription: {
        include: {
          payments: {
            orderBy: { createdAt: "desc" },
            take: 5,
          },
        },
      },
      pqrs: {
        select: {
          id: true,
          numero: true,
          asunto: true,
          estado: true,
          nombreResidente: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
      _count: {
        select: {
          users: true,
          pqrs: true,
        },
      },
    },
  });
}

export async function getTenantUsersForSuperAdmin(tenantId: string) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      users: {
        select: { id: true, name: true, email: true, role: true, bloque: true, apto: true, isActive: true, createdAt: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
      },
    },
  });
}

export async function createTenantWithAdmin(
  actorUserId: string,
  input: CreateTenantInput
): Promise<CreateTenantResult> {
  assertValidTenantInput(input);
  const slug = normalizeSlug(input.slug);
  const adminEmail = input.adminEmail.trim().toLowerCase();

  const price = await calculatePriceForUnits(input.units);
  const now = new Date();
  const periodEnd = addDays(now, 30);

  const tenant = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name.trim(),
        slug,
        city: emptyToNull(input.city),
        address: emptyToNull(input.address),
        units: input.units,
        status: "PENDING_PAYMENT",
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        status: "PENDING_PAYMENT",
        unitsSnapshot: price.units,
        priceCents: price.priceCents,
        currency: price.currency,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId: tenant.id,
        action: AuditAction.TENANT_CREATED,
        targetType: "Tenant",
        targetId: tenant.id,
        metadata: {
          name: tenant.name,
          slug,
          adminEmail,
          adminName: input.adminName.trim(),
          adminPhone: emptyToNull(input.adminPhone),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        tenantId: tenant.id,
        action: AuditAction.SUBSCRIPTION_CREATED,
        targetType: "Subscription",
        targetId: subscription.id,
        metadata: {
          tenantId: tenant.id,
          name: tenant.name,
          units: price.units,
          priceCents: price.priceCents,
          currency: price.currency,
          pricingRuleId: price.pricingRuleId,
          status: "PENDING_PAYMENT",
        },
      },
    });

    return tenant;
  });

  const invitation = await createInvitation({
    tenantId: tenant.id,
    email: adminEmail,
    role: "ADMIN",
    invitedById: actorUserId,
    origin: "tenant-created",
  }).catch((error) => ({ emailResult: { ok: false, errorMessage: error instanceof Error ? error.message : "No se pudo enviar la invitacion" } }));

  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    adminEmail,
    invitationSent: invitation.emailResult.ok,
    invitationError: invitation.emailResult.ok ? null : invitation.emailResult.errorMessage,
  };
}

export async function updateTenantStatusForSuperAdmin(
  actorUserId: string,
  tenantId: string,
  status: Extract<TenantStatus, "ACTIVE" | "SUSPENDED" | "CANCELLED">
) {
  if (status === "ACTIVE") {
    const approvedPayment = await prisma.payment.findFirst({
      where: { tenantId, status: "APPROVED" },
      select: { id: true },
    });
    if (!approvedPayment) {
      throw new Error(
        "No se puede activar: este conjunto nunca completo un pago aprobado. El administrador debe pagar la licencia (Licencias y pagos) para activarse."
      );
    }
  }

  const tenant = await prisma.$transaction(async (tx) => {
    await tx.subscription.findUniqueOrThrow({ where: { tenantId }, select: { id: true } });

    const updatedTenant = await tx.tenant.update({
      where: { id: tenantId },
      data: {
        status,
        cancelledAt: status === "CANCELLED" ? new Date() : null,
      },
    });

    await tx.subscription.update({
      where: { tenantId },
      data: {
        status: status as SubscriptionStatus,
        graceEndsAt: status === "ACTIVE" ? null : undefined,
      },
    });

    return updatedTenant;
  });

  const action =
    status === "SUSPENDED"
      ? AuditAction.TENANT_SUSPENDED
      : status === "CANCELLED"
        ? AuditAction.TENANT_CANCELLED
        : AuditAction.TENANT_REACTIVATED;

  await registerAuditLog({
    actorUserId,
    tenantId: tenant.id,
    action,
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: {
      name: tenant.name,
      slug: tenant.slug,
      status,
    },
  });

  return tenant;
}

export async function updateTenantDetails(
  actorUserId: string,
  tenantId: string,
  input: { name?: string; city?: string; units?: number }
) {
  const existing = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { subscription: true },
  });
  const data: { name?: string; city?: string | null; units?: number } = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("El nombre del conjunto es obligatorio");
    data.name = name;
  }
  if (input.city !== undefined) data.city = emptyToNull(input.city);

  const unitsChanged = input.units !== undefined && input.units !== existing.units;
  if (input.units !== undefined) {
    if (!Number.isSafeInteger(input.units) || input.units <= 0) {
      throw new Error("Las unidades deben ser un entero positivo");
    }
    data.units = input.units;
  }

  const subscription = existing.subscription;
  if (unitsChanged && !subscription) {
    throw new Error("El conjunto no tiene una suscripcion para programar la nueva tarifa");
  }

  const calculatedTerms = unitsChanged ? await calculatePriceForUnits(input.units as number) : null;
  const currentTerms = subscription
    ? { units: subscription.unitsSnapshot, priceCents: subscription.priceCents, currency: subscription.currency }
    : null;
  const scheduledTerms = calculatedTerms && currentTerms && (
    calculatedTerms.units !== currentTerms.units ||
    calculatedTerms.priceCents !== currentTerms.priceCents ||
    calculatedTerms.currency !== currentTerms.currency
  ) ? calculatedTerms : null;
  const providerTerms = scheduledTerms || currentTerms;
  const shouldSyncProvider = Boolean(unitsChanged && subscription?.mercadoPagoPreapprovalId && providerTerms);

  if (shouldSyncProvider && subscription?.mercadoPagoPreapprovalId && providerTerms) {
    await updateMercadoPagoPreapprovalAmount({
      preapprovalId: subscription.mercadoPagoPreapprovalId,
      priceCents: providerTerms.priceCents,
      currency: providerTerms.currency,
    });
  }

  try {
    const tenant = await prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({ where: { id: tenantId }, data });

      if (unitsChanged && subscription) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: scheduledTerms
            ? {
                pendingUnitsSnapshot: scheduledTerms.units,
                pendingPriceCents: scheduledTerms.priceCents,
                pendingCurrency: scheduledTerms.currency,
                pendingPriceEffectiveAt: subscription.currentPeriodEnd,
              }
            : {
                pendingUnitsSnapshot: null,
                pendingPriceCents: null,
                pendingCurrency: null,
                pendingPriceEffectiveAt: null,
              },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          tenantId: updatedTenant.id,
          action: AuditAction.TENANT_UPDATED,
          targetType: "Tenant",
          targetId: updatedTenant.id,
          metadata: {
            name: updatedTenant.name,
            slug: updatedTenant.slug,
            changed: Object.keys(data),
            billingChange: unitsChanged
              ? {
                  previousUnits: existing.units,
                  nextUnits: data.units,
                  currentPriceCents: currentTerms?.priceCents,
                  scheduledPriceCents: scheduledTerms?.priceCents || null,
                  effectiveAt: subscription?.currentPeriodEnd.toISOString() || null,
                  mercadoPagoSynchronized: shouldSyncProvider,
                }
              : null,
          },
        },
      });

      return updatedTenant;
    });

    return tenant;
  } catch (error) {
    if (shouldSyncProvider && subscription?.mercadoPagoPreapprovalId && currentTerms) {
      await updateMercadoPagoPreapprovalAmount({
        preapprovalId: subscription.mercadoPagoPreapprovalId,
        priceCents: currentTerms.priceCents,
        currency: currentTerms.currency,
      }).catch(() => null);
    }
    throw error;
  }
}

function assertValidTenantInput(input: CreateTenantInput) {
  if (!input.name?.trim()) throw new Error("El nombre del conjunto es obligatorio");
  if (!input.adminName?.trim()) throw new Error("El nombre del administrador es obligatorio");
  if (!/^\S+@\S+\.\S+$/.test(input.adminEmail?.trim() || "")) {
    throw new Error("El correo del administrador no es valido");
  }
  if (!Number.isSafeInteger(input.units) || input.units <= 0) {
    throw new Error("Las unidades deben ser un entero positivo");
  }
}

export function normalizeSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) throw new Error("El identificador del conjunto es obligatorio");
  return slug;
}

function emptyToNull(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}