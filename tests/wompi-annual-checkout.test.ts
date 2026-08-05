import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  createWompiCheckoutForTenant,
  getWompiAnnualCheckoutOffer,
  processWompiWebhook,
  runWompiAutomaticRenewals,
} from "../src/domains/billing/wompi.service";
import { applyOverdueLicenseRules, createAnnualRenewalReminders } from "../src/domains/billing/billing.service";
import { addCalendarMonths, annualTerms } from "../src/domains/commercial/commercial-policy";
import { addDays } from "../src/domains/billing/period";

const RUN = `wompi-annual-${Date.now()}`;
const EVENTS_SECRET = "test_events_wompi_annual";
const originalFetch = global.fetch;
let transactionCalls = 0;

process.env.WOMPI_ENV = "sandbox";
process.env.WOMPI_SANDBOX_PUBLIC_KEY = "pub_test_wompi_annual";
process.env.WOMPI_SANDBOX_PRIVATE_KEY = "prv_test_wompi_annual";
process.env.WOMPI_SANDBOX_INTEGRITY_SECRET = "test_integrity_wompi_annual";
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

async function createFixture(input: {
  commercialStatus?: "LEGACY_REVIEW" | "CONVERTED_MONTHLY" | "CONVERTED_ANNUAL" | "PILOT_ACTIVE";
  billingMode?: "MONTHLY" | "ANNUAL";
  autoRenew?: boolean;
  currentPeriodEnd?: Date;
  pilotAccessEndsAt?: Date | null;
}) {
  const now = new Date();
  const monthlyListPriceCents = 10_000_000;
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN}`, slug: `${RUN}-${crypto.randomUUID().slice(0, 8)}`, units: 10, status: "ACTIVE" },
  });
  const admin = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${RUN}-${crypto.randomUUID()}@example.test`,
      password: "test-password",
      name: "QA Wompi Annual Admin",
      role: "ADMIN",
      memberships: { create: { tenantId: tenant.id, role: "ADMIN", isActive: true } },
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: "ACTIVE",
      autoRenew: input.autoRenew ?? false,
      unitsSnapshot: 10,
      priceCents: monthlyListPriceCents,
      currency: "COP",
      currentPeriodStart: addDays(now, -10),
      currentPeriodEnd: input.currentPeriodEnd || addDays(now, 20),
    },
  });
  if (input.commercialStatus) {
    await prisma.tenantCommercialProfile.create({
      data: {
        tenantId: tenant.id,
        commercialStatus: input.commercialStatus,
        billingMode: input.billingMode,
        postPilotListPriceCents: monthlyListPriceCents,
        pilotAccessEndsAt: input.pilotAccessEndsAt || null,
      },
    });
  }
  return { tenant, admin, subscription, monthlyListPriceCents };
}

async function addActivePaymentMethod(tenantId: string, adminId: string, email: string) {
  return prisma.wompiPaymentMethod.create({
    data: {
      tenantId,
      createdByUserId: adminId,
      environment: "SANDBOX",
      providerSourceId: Math.floor(Math.random() * 1_000_000_000),
      type: "CARD",
      status: "ACTIVE",
      customerEmail: email,
      brand: "VISA",
      lastFour: "4242",
      consentedAt: new Date(),
    },
  });
}

before(async () => {
  await prisma.$connect();
  global.fetch = async (input, init) => {
    const url = String(input);
    if (!url.endsWith("/transactions") || init?.method !== "POST") throw new Error(`Unexpected Wompi request: ${url}`);
    transactionCalls += 1;
    const body = JSON.parse(String(init.body)) as { reference: string; amount_in_cents: number; recurrent: boolean };
    assert.equal(body.recurrent, true);
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
  await prisma.tenantCommercialProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

test("un admin mensual puede comprar la anualidad con el 10% centralizado", async () => {
  const { tenant, admin, subscription, monthlyListPriceCents } = await createFixture({ commercialStatus: "CONVERTED_MONTHLY", billingMode: "MONTHLY" });
  const terms = annualTerms(monthlyListPriceCents);
  const offer = await getWompiAnnualCheckoutOffer(tenant.id);
  const checkout = await createWompiCheckoutForTenant({
    actorUserId: admin.id,
    tenantId: tenant.id,
    billingMode: "ANNUAL",
    operationId: `annual_${crypto.randomUUID().replaceAll("-", "")}`,
  });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });

  assert.equal(offer.eligible, true);
  if (!offer.eligible) return;
  assert.equal(offer.listAmountCents, terms.listPriceCents);
  assert.equal(offer.amountCents, terms.effectivePriceCents);
  assert.equal(offer.savingsCents, terms.listPriceCents - terms.effectivePriceCents);
  assert.equal(payment.concept, "SUBSCRIPTION_ANNUAL");
  assert.equal(payment.listAmountCents, terms.listPriceCents);
  assert.equal(payment.discountBps, terms.discountBps);
  assert.match(checkout.reference, /^WOMPI_ANNUAL_/);

  const event = signedEvent({ transactionId: `${RUN}-manual-${crypto.randomUUID()}`, reference: checkout.reference, amountCents: payment.amountCents, status: "APPROVED" });
  const first = await processWompiWebhook(event.payload, event.headers);
  const second = await processWompiWebhook(event.payload, event.headers);
  const refreshedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  assert.equal(first.processed, true);
  assert.equal(second.processed, false);
  assert.equal(refreshedSubscription.status, "ACTIVE");
  assert.equal(refreshedSubscription.currentPeriodStart.getTime(), subscription.currentPeriodEnd.getTime());
  assert.equal(refreshedSubscription.currentPeriodEnd.getTime(), addCalendarMonths(subscription.currentPeriodEnd, 12).getTime());
  assert.equal(profile.commercialStatus, "CONVERTED_ANNUAL");
  assert.equal(profile.billingMode, "ANNUAL");
});

test("un piloto activo puede pasar al anual y empieza cuando termina su acceso de piloto", async () => {
  const pilotAccessEndsAt = addDays(new Date(), 45);
  const { tenant, admin, subscription } = await createFixture({
    commercialStatus: "PILOT_ACTIVE",
    billingMode: "MONTHLY",
    pilotAccessEndsAt,
  });
  const checkout = await createWompiCheckoutForTenant({
    actorUserId: admin.id,
    tenantId: tenant.id,
    billingMode: "ANNUAL",
    operationId: `pilotannual_${crypto.randomUUID().replaceAll("-", "")}`,
  });
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: checkout.paymentId } });
  const event = signedEvent({ transactionId: `${RUN}-pilot-${crypto.randomUUID()}`, reference: checkout.reference, amountCents: payment.amountCents, status: "APPROVED" });

  await processWompiWebhook(event.payload, event.headers);
  const refreshedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const profile = await prisma.tenantCommercialProfile.findUniqueOrThrow({ where: { tenantId: tenant.id } });

  assert.equal(refreshedSubscription.currentPeriodStart.getTime(), pilotAccessEndsAt.getTime());
  assert.equal(refreshedSubscription.currentPeriodEnd.getTime(), addCalendarMonths(pilotAccessEndsAt, 12).getTime());
  assert.equal(profile.commercialStatus, "CONVERTED_ANNUAL");
  assert.equal(profile.billingMode, "ANNUAL");
});

test("el cobro automatico anual usa el valor anual y el webhook extiende doce meses", async () => {
  const { tenant, admin, subscription, monthlyListPriceCents } = await createFixture({
    commercialStatus: "CONVERTED_ANNUAL",
    billingMode: "ANNUAL",
    autoRenew: true,
    currentPeriodEnd: addDays(new Date(), -1),
  });
  const method = await addActivePaymentMethod(tenant.id, admin.id, admin.email);
  const terms = annualTerms(monthlyListPriceCents);
  const renewal = await runWompiAutomaticRenewals(new Date(), { tenantIds: [tenant.id] });
  const payment = await prisma.payment.findFirstOrThrow({ where: { tenantId: tenant.id, provider: "WOMPI" } });

  assert.equal(renewal.initiated, 1);
  assert.equal(payment.wompiPaymentMethodId, method.id);
  assert.equal(payment.concept, "SUBSCRIPTION_ANNUAL");
  assert.equal(payment.amountCents, terms.effectivePriceCents);
  assert.equal(payment.listAmountCents, terms.listPriceCents);
  assert.equal(payment.discountBps, terms.discountBps);

  const event = signedEvent({ transactionId: `${RUN}-auto-${crypto.randomUUID()}`, reference: payment.externalReference!, amountCents: payment.amountCents, status: "APPROVED" });
  await processWompiWebhook(event.payload, event.headers);
  const refreshedSubscription = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

  assert.equal(refreshedSubscription.status, "ACTIVE");
  assert.equal(refreshedSubscription.currentPeriodEnd.getTime(), addCalendarMonths(refreshedSubscription.currentPeriodStart, 12).getTime());

  const cron = await applyOverdueLicenseRules(null, { tenantIds: [tenant.id], batchLimit: 4 });
  const afterCron = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(cron.movedToGracePeriod, 0);
  assert.equal(afterCron.status, "ACTIVE");
  assert.equal(afterCron.currentPeriodEnd.getTime(), refreshedSubscription.currentPeriodEnd.getTime());
});

test("el recordatorio anual se crea una vez a treinta dias y no altera una licencia vigente", async () => {
  const now = new Date();
  const { tenant, subscription } = await createFixture({
    commercialStatus: "CONVERTED_ANNUAL",
    billingMode: "ANNUAL",
    currentPeriodEnd: addDays(now, 29),
  });
  const first = await createAnnualRenewalReminders(now);
  const second = await createAnnualRenewalReminders(now);
  const [outboxRows, refreshedSubscription] = await Promise.all([
    prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id, eventType: "ANNUAL_RENEWAL_REMINDER" } }),
    prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } }),
  ]);

  assert.equal(first.notified, 1);
  assert.equal(second.notified, 0);
  assert.equal(outboxRows.length, 2);
  assert.equal(refreshedSubscription.status, "ACTIVE");
  assert.equal(refreshedSubscription.currentPeriodEnd.getTime(), subscription.currentPeriodEnd.getTime());
});
