import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { calculatePriceForUnits, pricingRangesOverlap, renewSubscriptionWithSimulatedPayment } from "../src/domains/billing/billing.service";
import { updateTenantDetails, updateTenantStatusForSuperAdmin } from "../src/domains/platform/tenant-admin.service";

const RUN = `super-admin-phase-a-${Date.now()}`;
const tenantIds: string[] = [];
let counter = 0;

async function createActor() {
  counter += 1;
  return prisma.user.create({
    data: {
      email: `qa-super-admin-${RUN}-${counter}@example.com`,
      password: "not-used-by-test",
      name: "QA Super Admin",
      role: "SUPER_ADMIN",
    },
  });
}

async function createTenantWithSubscription(input: {
  units: number;
  tenantStatus: "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  subscriptionStatus: "PENDING_PAYMENT" | "ACTIVE" | "SUSPENDED" | "CANCELLED";
  priceCents?: number;
}) {
  counter += 1;
  const now = new Date();
  const tenant = await prisma.tenant.create({
    data: {
      name: `QA Fase A ${counter}`,
      slug: `${RUN}-${counter}`,
      units: input.units,
      status: input.tenantStatus,
      subscription: {
        create: {
          status: input.subscriptionStatus,
          unitsSnapshot: input.units,
          priceCents: input.priceCents ?? 10_000_000,
          currency: "COP",
          currentPeriodStart: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000),
          currentPeriodEnd: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        },
      },
    },
    include: { subscription: true },
  });
  tenantIds.push(tenant.id);
  return tenant;
}

before(async () => {
  await prisma.$connect();
});

after(async () => {
  const actorEmails = { contains: `qa-super-admin-${RUN}` };
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: actorEmails } });
  await prisma.$disconnect();
});

test("pricingRangesOverlap detects finite and open-ended intersections", () => {
  assert.equal(pricingRangesOverlap({ minUnits: 1, maxUnits: 20 }, { minUnits: 21, maxUnits: 50 }), false);
  assert.equal(pricingRangesOverlap({ minUnits: 1, maxUnits: 20 }, { minUnits: 20, maxUnits: 50 }), true);
  assert.equal(pricingRangesOverlap({ minUnits: 51, maxUnits: null }, { minUnits: 20, maxUnits: 60 }), true);
});

test("calculatePriceForUnits rejects an invalid units value", async () => {
  await assert.rejects(calculatePriceForUnits(0), /entero positivo/i);
});

test("suspending and reactivating a tenant keeps subscription state synchronized and audits the actions", async () => {
  const actor = await createActor();
  const tenant = await createTenantWithSubscription({
    units: 10,
    tenantStatus: "ACTIVE",
    subscriptionStatus: "ACTIVE",
  });

  await updateTenantStatusForSuperAdmin(actor.id, tenant.id, "SUSPENDED");
  let stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { subscription: true } });
  assert.equal(stored.status, "SUSPENDED");
  assert.equal(stored.subscription?.status, "SUSPENDED");

  // Reactivar exige un pago aprobado que cubra el periodo vigente: sin este
  // registro, un tenant suspendido ya no puede reactivarse gratis (regresion
  // que este test verificaba antes solo a medias).
  const now = new Date();
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      subscriptionId: tenant.subscription!.id,
      amountCents: tenant.subscription!.priceCents,
      currency: "COP",
      status: "APPROVED",
      provider: "SIMULATED",
      dueDate: now,
      paidAt: now,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await updateTenantStatusForSuperAdmin(actor.id, tenant.id, "ACTIVE");
  stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { subscription: true } });
  assert.equal(stored.status, "ACTIVE");
  assert.equal(stored.subscription?.status, "ACTIVE");
  assert.equal(stored.cancelledAt, null);

  const auditCount = await prisma.auditLog.count({
    where: { tenantId: tenant.id, actorUserId: actor.id, action: { in: ["TENANT_SUSPENDED", "TENANT_REACTIVATED"] } },
  });
  assert.equal(auditCount, 2);
});

test("renewal activates both the subscription and the previously blocked tenant", async () => {
  const rule = await prisma.pricingRule.findFirst({
    where: { isActive: true },
    orderBy: { minUnits: "asc" },
  });
  assert.ok(rule, "Se requiere al menos una regla de precio activa para probar la renovacion");

  const actor = await createActor();
  const tenant = await createTenantWithSubscription({
    units: rule.minUnits,
    tenantStatus: "PENDING_PAYMENT",
    subscriptionStatus: "PENDING_PAYMENT",
    priceCents: rule.priceCents,
  });

  await renewSubscriptionWithSimulatedPayment({ actorUserId: actor.id, tenantId: tenant.id });
  const stored = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenant.id },
    include: { subscription: { include: { payments: true } } },
  });

  assert.equal(stored.status, "ACTIVE");
  assert.equal(stored.subscription?.status, "ACTIVE");
  assert.equal(stored.subscription?.payments.filter((payment) => payment.status === "APPROVED").length, 1);
  assert.equal(
    await prisma.auditLog.count({ where: { tenantId: tenant.id, actorUserId: actor.id, action: "SUBSCRIPTION_RENEWED" } }),
    1
  );
});
test("unit changes schedule the next terms without changing the current charge", async (t) => {
  const rule = await prisma.pricingRule.findFirst({
    where: { isActive: true, maxUnits: { not: null } },
    orderBy: { minUnits: "asc" },
  });
  if (!rule || rule.maxUnits === null || rule.maxUnits <= rule.minUnits) {
    t.skip("Se requiere una regla activa con al menos dos unidades en su rango");
    return;
  }

  const actor = await createActor();
  const tenant = await createTenantWithSubscription({
    units: rule.minUnits,
    tenantStatus: "ACTIVE",
    subscriptionStatus: "ACTIVE",
    priceCents: rule.priceCents,
  });
  assert.ok(tenant.subscription);
  const currentPeriodEnd = tenant.subscription.currentPeriodEnd;

  await updateTenantDetails(actor.id, tenant.id, { units: rule.minUnits + 1 });
  let stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { subscription: true } });
  assert.equal(stored.units, rule.minUnits + 1);
  assert.equal(stored.subscription?.unitsSnapshot, rule.minUnits);
  assert.equal(stored.subscription?.priceCents, rule.priceCents);
  assert.equal(stored.subscription?.pendingUnitsSnapshot, rule.minUnits + 1);
  assert.equal(stored.subscription?.pendingPriceCents, rule.priceCents);
  assert.equal(stored.subscription?.pendingPriceEffectiveAt?.toISOString(), currentPeriodEnd.toISOString());

  await renewSubscriptionWithSimulatedPayment({ actorUserId: actor.id, tenantId: tenant.id });
  stored = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id }, include: { subscription: true } });
  assert.equal(stored.subscription?.unitsSnapshot, rule.minUnits + 1);
  assert.equal(stored.subscription?.priceCents, rule.priceCents);
  assert.equal(stored.subscription?.pendingUnitsSnapshot, null);
  assert.equal(stored.subscription?.pendingPriceCents, null);
  assert.equal(stored.subscription?.pendingPriceEffectiveAt, null);

  const audit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, actorUserId: actor.id, action: "TENANT_UPDATED" },
    orderBy: { createdAt: "desc" },
  });
  assert.equal((audit?.metadata as { billingChange?: { nextUnits?: number } } | null)?.billingChange?.nextUnits, rule.minUnits + 1);
});