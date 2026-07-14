import { AuditAction, TenantStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "./audit.service";
import { calculatePriceForUnits } from "@/domains/billing/billing.service";
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
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      status,
      cancelledAt: status === "CANCELLED" ? new Date() : undefined,
    },
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
  const data: { name?: string; city?: string; units?: number } = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.city !== undefined) data.city = input.city;
  if (input.units !== undefined) data.units = input.units;

  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data,
  });

  await registerAuditLog({
    actorUserId,
    tenantId: tenant.id,
    action: AuditAction.TENANT_UPDATED,
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { name: tenant.name, slug: tenant.slug, changed: Object.keys(data) },
  });

  return tenant;
}

export function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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