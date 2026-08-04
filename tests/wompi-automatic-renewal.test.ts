import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { processWompiWebhook, revokeWompiPaymentMethod, runWompiAutomaticRenewals } from "../src/domains/billing/wompi.service";
import { BILLING_PERIOD_DAYS, addDays } from "../src/domains/billing/period";

const RUN = `wompi-auto-${Date.now()}`;
const EVENTS_SECRET = "test_events_wompi_auto";
const originalFetch = global.fetch;
let transactionCalls = 0;

process.env.WOMPI_ENV = "sandbox";
process.env.WOMPI_SANDBOX_PUBLIC_KEY = "pub_test_wompi_auto";
process.env.WOMPI_SANDBOX_PRIVATE_KEY = "prv_test_wompi_auto";
process.env.WOMPI_SANDBOX_INTEGRITY_SECRET = "test_integrity_wompi_auto";
process.env.WOMPI_SANDBOX_EVENTS_SECRET = EVENTS_SECRET;
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || "https://app.example.test";

function signedEvent(input: { transactionId: string; reference: string; amountCents: number; status: string }) {
  const timestamp = 1720000000;
  const transaction = {
    id: input.transactionId,
    status: input.status,
    amount_in_cents: input.amountCents,
    reference: input.reference,
    currency: "COP",
  };
  const properties = ["transaction.reference", "transaction.amount_in_cents", "transaction.status"];
  const checksum = crypto.createHash("sha256").update(`${transaction.reference}${transaction.amount_in_cents}${transaction.status}${timestamp}${EVENTS_SECRET}`).digest("hex");
  return {
    payload: { event: "transaction.updated", environment: "test", timestamp, data: { transaction }, signature: { properties, checksum } },
    headers: new Headers({ "x-event-checksum": checksum }),
  };
}

async function createFixture(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  const now = new Date();
  const tenant = await prisma.tenant.create({ data: { name: `QA ${RUN}`, slug: `${RUN}-${crypto.randomUUID().slice(0, 8)}`, units: 10, status } });
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${RUN}-${crypto.randomUUID()}@example.test`,
      password: "test-password",
      name: "QA Wompi Auto Admin",
      role: "ADMIN",
      memberships: { create: { tenantId: tenant.id, role: "ADMIN", isActive: true } },
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status,
      autoRenew: true,
      unitsSnapshot: 10,
      priceCents: 9500000,
      currency: "COP",
      currentPeriodStart: addDays(now, -60),
      currentPeriodEnd: addDays(now, -1),
    },
  });
  const method = await prisma.wompiPaymentMethod.create({
    data: {
      tenantId: tenant.id,
      createdByUserId: admin.id,
      environment: "SANDBOX",
      providerSourceId: Math.floor(Math.random() * 1_000_000_000),
      type: "CARD",
      status: "ACTIVE",
      customerEmail: admin.email,
      brand: "VISA",
      lastFour: "4242",
      consentedAt: now,
    },
  });
  return { tenant, admin, subscription, method };
}

before(async () => {
  await prisma.$connect();
  global.fetch = async (input, init) => {
    const url = String(input);
    if (!url.endsWith("/transactions") || init?.method !== "POST") throw new Error(`Unexpected Wompi request: ${url}`);
    transactionCalls += 1;
    const body = JSON.parse(String(init.body)) as { reference: string; payment_source_id: number; recurrent: boolean };
    assert.equal(body.recurrent, true);
    assert.equal(typeof body.payment_source_id, "number");
    return new Response(JSON.stringify({ data: { id: `${RUN}-transaction-${transactionCalls}`, status: "PENDING", reference: body.reference } }), { status: 201, headers: { "Content-Type": "application/json" } });
  };
});

after(async () => {
  global.fetch = originalFetch;
  const tenants = await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const tenantIds = tenants.map((tenant) => tenant.id);
  await prisma.webhookEvent.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { dataId: { startsWith: RUN } }] } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.billingNotificationOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.wompiPaymentMethod.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

test("el cron automatico reserva una sola transaccion por metodo y periodo", async () => {
  const { tenant, subscription, method } = await createFixture();

  const first = await runWompiAutomaticRenewals(new Date(), { tenantIds: [tenant.id] });
  const second = await runWompiAutomaticRenewals(new Date(), { tenantIds: [tenant.id] });
  const payments = await prisma.payment.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "asc" } });

  assert.equal(first.initiated, 1);
  assert.equal(second.duplicate, 1);
  assert.equal(transactionCalls >= 1, true);
  assert.equal(payments.length, 1);
  assert.equal(payments[0].status, "PENDING");
  assert.equal(payments[0].wompiPaymentMethodId, method.id);
  assert.match(payments[0].operationId || "", new RegExp(`^auto_wompi_${subscription.id}_${method.id}_`));
});

test("desvincular una tarjeta desactiva solo el cobro automatico local", async () => {
  const { tenant, admin, subscription, method } = await createFixture();

  const result = await revokeWompiPaymentMethod({ actorUserId: admin.id, tenantId: tenant.id });
  const refreshedMethod = await prisma.wompiPaymentMethod.findUniqueOrThrow({ where: { id: method.id } });
  const refreshedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

  assert.deepEqual(result, { revoked: true });
  assert.equal(refreshedMethod.status, "REVOKED");
  assert.ok(refreshedMethod.revokedAt);
  assert.equal(refreshedSubscription.autoRenew, false);
});

test("un webhook aprobado de cobro automatico reactiva una licencia suspendida una sola vez", async () => {
  const { tenant, subscription } = await createFixture("SUSPENDED");
  const result = await runWompiAutomaticRenewals(new Date(), { tenantIds: [tenant.id] });
  assert.equal(result.initiated, 1);
  const payment = await prisma.payment.findFirstOrThrow({ where: { tenantId: tenant.id, provider: "WOMPI" } });
  const event = signedEvent({ transactionId: `${RUN}-approved-${crypto.randomUUID()}`, reference: payment.externalReference!, amountCents: payment.amountCents, status: "APPROVED" });

  const first = await processWompiWebhook(event.payload, event.headers);
  const second = await processWompiWebhook(event.payload, event.headers);
  const refreshedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const refreshedTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const refreshedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });

  assert.equal(first.processed, true);
  assert.equal(second.processed, false);
  assert.equal(refreshedPayment.status, "APPROVED");
  assert.ok(refreshedPayment.approvedEffectAppliedAt);
  assert.equal(refreshedSubscription.status, "ACTIVE");
  assert.equal(refreshedTenant.status, "ACTIVE");
  assert.equal(refreshedSubscription.currentPeriodEnd.getTime(), addDays(refreshedSubscription.currentPeriodStart, BILLING_PERIOD_DAYS).getTime());
});
