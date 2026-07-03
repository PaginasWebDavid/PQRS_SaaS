import { AuditAction, TenantStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "./audit.service";
import { calculatePriceForUnits } from "@/domains/billing/billing.service";

const TEMP_PASSWORD_LENGTH = 12;

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
  temporaryPassword: string;
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

export async function createTenantWithAdmin(
  actorUserId: string,
  input: CreateTenantInput
): Promise<CreateTenantResult> {
  const slug = normalizeSlug(input.slug);
  const adminEmail = input.adminEmail.trim().toLowerCase();
  const temporaryPassword = generateTemporaryPassword();
  const password = await bcrypt.hash(temporaryPassword, 10);

  const price = await calculatePriceForUnits(input.units);
  const now = new Date();
  const periodEnd = addDays(now, 30);
  const trialEndsAt = addDays(now, 15);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.name.trim(),
        slug,
        city: emptyToNull(input.city),
        address: emptyToNull(input.address),
        units: input.units,
        status: "ACTIVE",
      },
    });

    await tx.user.create({
      data: {
        name: input.adminName.trim(),
        email: adminEmail,
        password,
        role: "ADMIN",
        tenantId: tenant.id,
      },
    });

    const subscription = await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        status: "ACTIVE",
        unitsSnapshot: price.units,
        priceCents: price.priceCents,
        currency: price.currency,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        trialEndsAt,
        payments: {
          create: {
            tenantId: tenant.id,
            amountCents: price.priceCents,
            currency: price.currency,
            status: "APPROVED",
            provider: "SIMULATED",
            dueDate: now,
            paidAt: now,
            periodStart: now,
            periodEnd,
            externalReference: "initial-simulated-payment",
          },
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: AuditAction.TENANT_CREATED,
        targetType: "Tenant",
        targetId: tenant.id,
        metadata: {
          slug,
          adminEmail,
          adminPhone: emptyToNull(input.adminPhone),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        actorUserId,
        action: AuditAction.SUBSCRIPTION_CREATED,
        targetType: "Subscription",
        targetId: subscription.id,
        metadata: {
          tenantId: tenant.id,
          units: price.units,
          priceCents: price.priceCents,
          currency: price.currency,
          pricingRuleId: price.pricingRuleId,
          provider: "SIMULATED",
        },
      },
    });

    return tenant;
  });

  return {
    tenantId: result.id,
    tenantSlug: result.slug,
    adminEmail,
    temporaryPassword,
  };
}

export async function updateTenantStatusForSuperAdmin(
  actorUserId: string,
  tenantId: string,
  status: Extract<TenantStatus, "ACTIVE" | "SUSPENDED">
) {
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: { status },
  });

  await registerAuditLog({
    actorUserId,
    action: status === "SUSPENDED" ? AuditAction.TENANT_SUSPENDED : AuditAction.TENANT_REACTIVATED,
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: {
      slug: tenant.slug,
      status,
    },
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

function generateTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < TEMP_PASSWORD_LENGTH; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}
function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}