import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { createWompiCheckoutForTenant, processWompiWebhook } from "../src/domains/billing/wompi.service";
import { BILLING_PERIOD_DAYS, addDays } from "../src/domains/billing/period";

const RUN = `wompi-billing-${Date.now()}`;
const EVENTS_SECRET = "test_events_wompi_integration";

process.env.WOMPI_ENV = "sandbox";
process.env.WOMPI_SANDBOX_PUBLIC_KEY = "pub_test_wompi_integration";
process.env.WOMPI_SANDBOX_INTEGRITY_SECRET = "test_integrity_wompi_integration";
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
  const checksum = crypto
    .createHash("sha256")
    .update(`${transaction.reference}${transaction.amount_in_cents}${transaction.status}${timestamp}${EVENTS_SECRET}`)
    .digest("hex");
  return {
    payload: {
      event: "transaction.updated",
      environment: "test",
      timestamp,
      data: { transaction },
      signature: { properties, checksum },
    },
    headers: new Headers({ "x-event-checksum": checksum }),
  };
}

async function createFixture() {
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN}`, slug: RUN, units: 10, status: "PENDING_PAYMENT" },
  });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: "PENDING_PAYMENT",
      unitsSnapshot: 10,
      priceCents: 9500000,
      currency: "COP",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
    },
  });
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${RUN}@example.test`,
      password: "test-password",
      name: "QA Wompi Admin",
      role: "ADMIN",
      memberships: { create: { tenantId: tenant.id, role: "ADMIN", isActive: true } },
    },
  });
  return { tenant, subscription, admin };
}

before(async () => {
  await prisma.$connect();
});

after(async () => {
  const tenants = await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const tenantIds = tenants.map((tenant) => tenant.id);
  await prisma.webhookEvent.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { dataId: { startsWith: RUN } }] } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.billingNotificationOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

test("checkout Wompi persiste el pago y un webhook aprobado aplica el efecto una sola vez", async () => {
  const { tenant, subscription, admin } = await createFixture();
  const operationId = `wompi_${crypto.randomUUID().replace(/-/g, "")}`;

  const checkout = await createWompiCheckoutForTenant({ actorUserId: admin.id, tenantId: tenant.id, operationId });
  const repeatedCheckout = await createWompiCheckoutForTenant({ actorUserId: admin.id, tenantId: tenant.id, operationId });
  const checkoutUrl = new URL(checkout.checkoutUrl);

  assert.equal(repeatedCheckout.paymentId, checkout.paymentId, "reintentar el checkout no crea otra obligacion");
  assert.equal(checkoutUrl.hostname, "checkout.wompi.co");
  assert.equal(checkoutUrl.searchParams.get("reference"), checkout.reference);
  assert.equal(checkoutUrl.searchParams.get("amount-in-cents"), String(subscription.priceCents));

  const pending = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
  assert.equal(pending.provider, "WOMPI");
  assert.equal(pending.status, "PENDING");
  assert.equal(pending.externalReference, checkout.reference);

  const event = signedEvent({
    transactionId: `${RUN}-transaction`,
    reference: checkout.reference,
    amountCents: subscription.priceCents,
    status: "APPROVED",
  });
  const first = await processWompiWebhook(event.payload, event.headers);
  const subscriptionAfterFirst = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const paymentAfterFirst = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
  const outboxAfterFirst = await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id } });

  assert.equal(first.processed, true);
  assert.equal(paymentAfterFirst.status, "APPROVED");
  assert.ok(paymentAfterFirst.approvedEffectAppliedAt !== null);
  assert.equal(subscriptionAfterFirst.status, "ACTIVE");
  assert.equal(subscriptionAfterFirst.currentPeriodEnd.getTime(), addDays(subscriptionAfterFirst.currentPeriodStart, BILLING_PERIOD_DAYS).getTime());
  assert.equal(outboxAfterFirst, 2, "el pago aprobado crea las notificaciones internas y por correo");

  const second = await processWompiWebhook(event.payload, event.headers);
  const subscriptionAfterSecond = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const outboxAfterSecond = await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id } });
  const tenantAfterSecond = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });

  assert.equal(second.processed, false, "un reintento del proveedor no reaplica el pago");
  assert.equal(subscriptionAfterSecond.currentPeriodEnd.getTime(), subscriptionAfterFirst.currentPeriodEnd.getTime());
  assert.equal(outboxAfterSecond, outboxAfterFirst, "el reintento no duplica avisos");
  assert.equal(tenantAfterSecond.status, "ACTIVE");
});
