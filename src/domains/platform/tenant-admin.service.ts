import { AuditAction, Prisma, SubscriptionStatus, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "./audit.service";
import { calculatePriceForUnits, DEFAULT_TRIAL_DAYS } from "@/domains/billing/billing.service";
import { updateMercadoPagoPreapprovalAmount, __billingTestSeam } from "@/domains/billing/mercado-pago.service";
import { hasCurrentAppliedAccessEvidence } from "@/domains/billing/precedence";
import { createInvitation } from "@/domains/organizations/invitation.service";
import { mapInvitationError, normalizeInvitationEmail } from "@/domains/organizations/invitation-security";
import { INITIAL_PQRS_CATEGORIES } from "@/domains/pqrs/pqrs-category-policy";

// Error de negocio controlado ante un conflicto de serializacion (F2F-04). No es
// un bucle de reintentos: el operador reintenta manualmente la accion.
export class SerializationConflictError extends Error {
  constructor() {
    super("El estado cambio durante la operacion. Intenta nuevamente.");
    this.name = "SerializationConflictError";
  }
}

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
  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: true,
      commercialProfile: true,
      featureEntitlements: { orderBy: { feature: "asc" } },
      memberships: {
        where: { role: "ADMIN" },
        select: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
      _count: { select: { memberships: true, pqrs: true } },
    },
  });
  return tenants.map(({ memberships, _count, ...tenant }) => ({
    ...tenant,
    users: memberships.map((membership) => membership.user),
    _count: { users: _count.memberships, pqrs: _count.pqrs },
  }));
}

export async function getTenantDetailForSuperAdmin(tenantId?: string | null) {
  if (!tenantId) return null;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      memberships: {
        select: {
          role: true, bloque: true, apto: true, createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      },
      invitations: {
        where: { status: "PENDING" },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      subscription: { include: { payments: { orderBy: { createdAt: "desc" }, take: 5 } } },
      commercialProfile: true,
      featureEntitlements: { orderBy: { feature: "asc" } },
      pqrs: {
        select: { id: true, numero: true, asunto: true, estado: true, nombreResidente: true, createdAt: true },
        orderBy: { createdAt: "desc" }, take: 8,
      },
      _count: { select: { memberships: true, pqrs: true } },
    },
  });
  if (!tenant) return null;
  const { memberships, _count, ...rest } = tenant;
  return {
    ...rest,
    users: memberships.map((membership) => ({ ...membership.user, role: membership.role, bloque: membership.bloque, apto: membership.apto, createdAt: membership.createdAt })),
    _count: { users: _count.memberships, pqrs: _count.pqrs },
  };
}

export async function getTenantUsersForSuperAdmin(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      memberships: {
        select: {
          id: true, role: true, bloque: true, apto: true, isActive: true, createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ role: "asc" }, { user: { name: "asc" } }],
      },
    },
  });
  if (!tenant) return null;
  return {
    id: tenant.id,
    name: tenant.name,
    users: tenant.memberships.map((membership) => ({
      ...membership.user,
      membershipId: membership.id,
      role: membership.role,
      bloque: membership.bloque,
      apto: membership.apto,
      isActive: membership.isActive,
      createdAt: membership.createdAt,
    })),
  };
}

export async function createTenantWithAdmin(
  actorUserId: string,
  input: CreateTenantInput
): Promise<CreateTenantResult> {
  assertValidTenantInput(input);
  const slug = normalizeSlug(input.slug);
  const adminEmail = normalizeInvitationEmail(input.adminEmail);

  const price = await calculatePriceForUnits(input.units);
  const now = new Date();
  // El tenant nace en TRIAL, con acceso completo por DEFAULT_TRIAL_DAYS sin pagar.
  // currentPeriodEnd marca el fin del trial: el cron de mora (applyOverdueLicenseRules)
  // lo mueve a GRACE_PERIOD al vencer, igual que hace con una suscripcion ACTIVE vencida.
  const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);

  const tenant = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name.trim(),
        slug,
        city: emptyToNull(input.city),
        address: emptyToNull(input.address),
        units: input.units,
        status: "TRIAL",
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        status: "TRIAL",
        unitsSnapshot: price.units,
        priceCents: price.priceCents,
        currency: price.currency,
        currentPeriodStart: now,
        currentPeriodEnd: trialEndsAt,
        trialEndsAt,
      },
    });

    await tx.pqrsCategory.createMany({
      data: INITIAL_PQRS_CATEGORIES.map((category) => ({
        tenantId: tenant.id,
        ...category,
        isActive: true,
        isCustom: false,
        createdByUserId: actorUserId,
      })),
      skipDuplicates: true,
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

    await tx.pqrsCategory.createMany({
      data: INITIAL_PQRS_CATEGORIES.map((category) => ({
        tenantId: tenant.id,
        ...category,
        isActive: true,
        isCustom: false,
        createdByUserId: actorUserId,
      })),
      skipDuplicates: true,
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
          status: "TRIAL",
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
  }).catch((error) => ({
    emailResult: { ok: false, errorMessage: mapInvitationError(error).message },
  }));

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
  const action =
    status === "SUSPENDED"
      ? AuditAction.TENANT_SUSPENDED
      : status === "CANCELLED"
        ? AuditAction.TENANT_CANCELLED
        : AuditAction.TENANT_REACTIVATED;

  // Transaccion SERIALIZABLE (F2F-04): la evidencia leida no puede cambiar bajo los
  // pies de la escritura. Evidencia, Subscription, Tenant y AuditLog quedan en una
  // sola unidad atomica (F2F-03): no hay acceso reactivado sin auditoria.
  try {
    const tenant = await prisma.$transaction(
      async (tx) => {
        const subscription = await tx.subscription.findUniqueOrThrow({
          where: { tenantId },
          select: { id: true, tenantId: true },
        });

        if (status === "ACTIVE") {
          // La validacion de evidencia ocurre DENTRO de la transaccion serializable.
          // Identidad EXACTA tenant+subscription (F2F-02). hasCurrentAppliedAccessEvidence
          // acepta pago real de Mercado Pago (aprobado, efecto aplicado, sin cuarentena,
          // periodo vigente) o renovacion simulada/cortesia vigente; NUNCA historico en
          // cuarentena, sin efecto aplicado o con periodo vencido.
          const now = new Date();
          const rows = await tx.payment.findMany({
            where: { tenantId, subscriptionId: subscription.id },
            select: {
              tenantId: true,
              subscriptionId: true,
              provider: true,
              status: true,
              periodEnd: true,
              approvedEffectAppliedAt: true,
              approvedEffectReconciliationRequired: true,
            },
          });
          if (!hasCurrentAppliedAccessEvidence(rows, now, { tenantId, subscriptionId: subscription.id })) {
            throw new Error(
              "No se puede activar: este conjunto no tiene evidencia de pago o renovacion vigente que cubra el periodo actual. El administrador debe pagar la licencia (Licencias y pagos) para activarse."
            );
          }
          // Seam: la evidencia YA fue leida y validada. Una transaccion concurrente que
          // invalide la evidencia y toque la Subscription hara fallar el UPDATE serializable.
          await __billingTestSeam("AFTER_REACTIVATION_EVIDENCE_READ");
        }

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

        // AuditLog DENTRO de la transaccion (F2F-03): si falla, Tenant y Subscription
        // se revierten; no queda acceso reactivado sin registro de quien lo hizo.
        await __billingTestSeam("BEFORE_REACTIVATION_AUDIT_LOG");
        await registerAuditLog(
          {
            actorUserId,
            tenantId: updatedTenant.id,
            action,
            targetType: "Tenant",
            targetId: updatedTenant.id,
            metadata: {
              name: updatedTenant.name,
              slug: updatedTenant.slug,
              status,
            },
          },
          tx
        );

        return updatedTenant;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return tenant;
  } catch (error) {
    // Conflicto de serializacion / write conflict: Prisma lo mapea a P2034. Se
    // traduce a un error de negocio controlado; el resto de errores se relanza tal cual.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      throw new SerializationConflictError();
    }
    throw error;
  }
}

export async function updateTenantDetails(
  actorUserId: string,
  tenantId: string,
  input: { name?: string; city?: string; units?: number }
) {
  const existing = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { subscription: true, commercialProfile: true },
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
  const priceProtectionActive = Boolean(
    unitsChanged &&
    existing.commercialProfile?.isFounderCustomer &&
    existing.commercialProfile.priceProtectedUntil &&
    existing.commercialProfile.priceProtectedUntil > new Date()
  );
  if (unitsChanged && !subscription) {
    throw new Error("El conjunto no tiene una suscripcion para programar la nueva tarifa");
  }

  const calculatedTerms = unitsChanged && !priceProtectionActive
    ? await calculatePriceForUnits(input.units as number)
    : null;
  const currentTerms = subscription
    ? { units: subscription.unitsSnapshot, priceCents: subscription.priceCents, currency: subscription.currency }
    : null;
  const scheduledTerms = calculatedTerms && currentTerms && (
    calculatedTerms.units !== currentTerms.units ||
    calculatedTerms.priceCents !== currentTerms.priceCents ||
    calculatedTerms.currency !== currentTerms.currency
  ) ? calculatedTerms : null;
  const providerTerms = scheduledTerms || currentTerms;
  const shouldSyncProvider = Boolean(
    unitsChanged && !priceProtectionActive && subscription?.mercadoPagoPreapprovalId && providerTerms
  );

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

      if (unitsChanged && subscription && !priceProtectionActive) {
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

      if (priceProtectionActive && existing.commercialProfile) {
        await tx.tenantCommercialProfile.update({
          where: { tenantId },
          data: {
            nextAction: "Revisar cambio de unidades durante proteccion de precio",
            nextActionDueAt: new Date(),
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
                  priceProtectionActive,
                  requiresCommercialReview: priceProtectionActive,
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
