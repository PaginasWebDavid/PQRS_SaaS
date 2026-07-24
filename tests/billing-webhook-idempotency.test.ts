// Pruebas de INTEGRACION de idempotencia, atomicidad, rollback y cuarentena
// historica del webhook de Mercado Pago.
//
// EJECUCION PENDIENTE: requieren una base de datos DEDICADA de pruebas (.env.test)
// validada por el runner seguro de la Fase 0. NO llaman a Mercado Pago real: la
// entidad MP se resuelve con un mock de `globalThis.fetch`. Corren con `npm test`
// solo cuando el guard acepta la configuracion.

import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  processMercadoPagoWebhook,
  __unsafeSetBillingTestHooks,
  type BillingTransactionStep,
} from "../src/domains/billing/mercado-pago.service";
import { addDays, BILLING_PERIOD_DAYS } from "../src/domains/billing/period";
import { findPaymentAuditEvidence } from "../scripts/reconcile-historical-payment-effects";

const RUN = `billing-webhook-${Date.now()}`;
const WEBHOOK_SECRET = "test-webhook-secret";
let counter = 0;

process.env.MERCADO_PAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || "TEST-integration";

const realFetch = globalThis.fetch;

function signedHeaders(dataId: string, requestId = `${RUN}-req-${++counter}`): Headers {
  const ts = String(Date.now());
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  return new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId });
}

function mockFetch(fixture: Record<string, unknown>) {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => fixture,
      text: async () => "",
      headers: new Headers(),
    }) as unknown as Response) as unknown as typeof fetch;
}

// Valida el periodo PERSISTIDO (no un reloj capturado antes del webhook). Replica
// EXACTAMENTE la semantica del servicio: `addDays` de produccion usa setDate
// (aritmetica de calendario), no una suma fija de milisegundos, asi que se compara
// contra `addDays(periodStart, 30)` en vez de 30*24*60*60*1000.
function assertThirtyDayPeriod(periodStart: Date, periodEnd: Date) {
  assert.ok(periodStart instanceof Date && !Number.isNaN(periodStart.getTime()), "periodStart valido y no nulo");
  assert.ok(periodEnd instanceof Date && !Number.isNaN(periodEnd.getTime()), "periodEnd valido y no nulo");
  assert.equal(
    periodEnd.getTime(),
    addDays(periodStart, BILLING_PERIOD_DAYS).getTime(),
    "periodEnd == periodStart + 30 dias (misma semantica que el servicio)"
  );
}

// Payment y Subscription comparten exactamente el mismo periodo persistido.
function assertPaymentMatchesSubscriptionPeriod(
  pay: { periodStart: Date; periodEnd: Date },
  sub: { currentPeriodStart: Date; currentPeriodEnd: Date }
) {
  assert.equal(pay.periodStart.getTime(), sub.currentPeriodStart.getTime(), "Payment.periodStart == Subscription.currentPeriodStart");
  assert.equal(pay.periodEnd.getTime(), sub.currentPeriodEnd.getTime(), "Payment.periodEnd == Subscription.currentPeriodEnd");
}

async function createPricingRule() {
  return prisma.pricingRule.create({
    data: { minUnits: 1, maxUnits: 100000, priceCents: 100000, currency: "COP", isActive: true },
  });
}

async function createTenantWithSubscription(currentPeriodEnd: Date) {
  counter += 1;
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN} ${counter}`, slug: `${RUN}-${counter}`, units: 10, status: "TRIAL" },
  });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: "TRIAL",
      unitsSnapshot: 10,
      priceCents: 100000,
      currency: "COP",
      currentPeriodStart: new Date(),
      currentPeriodEnd,
      trialEndsAt: currentPeriodEnd,
    },
  });
  return { tenant, subscription };
}

function paymentFixture(subscriptionId: string, status: string, id = `${RUN}-pay-${++counter}`) {
  return {
    id,
    status,
    transaction_amount: 1000,
    currency_id: "COP",
    date_approved: new Date().toISOString(),
    external_reference: subscriptionId,
  };
}

async function sendPaymentWebhook(fixture: Record<string, unknown>) {
  mockFetch(fixture);
  const dataId = String(fixture.id);
  return processMercadoPagoWebhook({
    payload: { type: "payment", data: { id: dataId } },
    headers: signedHeaders(dataId),
    dataIdFromQuery: null,
  });
}

const pricingRuleIds: string[] = [];

before(async () => {
  await prisma.$connect();
  const rule = await createPricingRule();
  pricingRuleIds.push(rule.id);
});

after(async () => {
  __unsafeSetBillingTestHooks({});
  const tenants = await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const tenantIds = tenants.map((t) => t.id);
  // Ledger asociado por tenant, y ledger huerfano (tenant nulo) por dataId/requestId.
  await prisma.webhookEvent.deleteMany({
    where: { OR: [{ tenantId: { in: tenantIds } }, { dataId: { startsWith: RUN } }, { requestId: { startsWith: RUN } }] },
  });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.pricingRule.deleteMany({ where: { id: { in: pricingRuleIds } } });
  globalThis.fetch = realFetch;
  await prisma.$disconnect();
});

// 1. APPROVED nuevo extiende una vez (aserciones ampliadas a todos los modelos).
test("1. Payment APPROVED nuevo extiende una vez y marca el efecto", async () => {
  const start = new Date();
  const { tenant, subscription } = await createTenantWithSubscription(start);
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: String(fixture.id) } });
  const events = await prisma.webhookEvent.findMany({ where: { subscriptionId: subscription.id } });
  const audits = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED" } });

  assert.equal(sub.status, "ACTIVE");
  // El servicio calcula el periodo desde el momento de procesamiento (periodo vencido
  // -> now del servicio), por eso se valida el periodo PERSISTIDO, no `start`.
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  // El periodo no retrocede respecto al anterior (currentPeriodEnd previo = start).
  assert.ok(sub.currentPeriodEnd.getTime() >= start.getTime(), "el periodo no retrocede");
  assert.equal(ten.status, "ACTIVE");
  assert.ok(pay.approvedEffectAppliedAt !== null);
  assert.equal(pay.approvedEffectReconciliationRequired, false);
  assert.ok(events.some((e) => e.result === "PROCESSED"));
  assert.equal(audits, 1);
});

// 2. Mismo APPROVED dos veces extiende una vez.
test("2. El mismo Payment APPROVED dos veces extiende una sola vez", async () => {
  const start = new Date();
  const { subscription } = await createTenantWithSubscription(start);
  const fixture = paymentFixture(subscription.id, "approved");

  await sendPaymentWebhook(fixture);
  const afterFirst = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  await sendPaymentWebhook(fixture);
  const afterSecond = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

  assert.equal(afterSecond.currentPeriodEnd.getTime(), afterFirst.currentPeriodEnd.getTime());
  const events = await prisma.webhookEvent.findMany({ where: { subscriptionId: subscription.id } });
  assert.ok(events.some((e) => e.result === "DUPLICATE"));
});

// 3. PENDING luego APPROVED extiende una vez.
test("3. PENDING y luego APPROVED extiende una vez", async () => {
  const start = new Date();
  const { subscription } = await createTenantWithSubscription(start);
  const id = `${RUN}-pay-seq-${++counter}`;

  // PENDING no aplica el marcador ni extiende.
  await sendPaymentWebhook(paymentFixture(subscription.id, "pending", id));
  const afterPending = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const payAfterPending = await prisma.payment.findUnique({ where: { mercadoPagoPaymentId: id } });
  assert.equal(payAfterPending?.approvedEffectAppliedAt ?? null, null, "PENDING no aplica marcador");
  assert.equal(afterPending.currentPeriodEnd.getTime(), start.getTime(), "PENDING no extiende");

  // APPROVED posterior aplica el marcador y extiende una sola vez.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  assert.equal(sub.status, "ACTIVE");
  assert.ok(pay.approvedEffectAppliedAt !== null, "APPROVED aplica el marcador");
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assert.ok(sub.currentPeriodEnd.getTime() >= start.getTime(), "el periodo no retrocede");
  const rows = await prisma.payment.count({ where: { subscriptionId: subscription.id, mercadoPagoPaymentId: id } });
  assert.equal(rows, 1, "existe una unica fila Payment");

  // Un segundo APPROVED del mismo pago no vuelve a extender.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const afterReplay = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(afterReplay.currentPeriodEnd.getTime(), sub.currentPeriodEnd.getTime(), "el replay no vuelve a extender");
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.ok(events.some((e) => e.result === "DUPLICATE"), "el replay queda DUPLICATE");
});

// 4. Dos APPROVED concurrentes del mismo pago producen un solo efecto.
test("4. Dos APPROVED concurrentes producen un solo efecto", async () => {
  const start = new Date();
  const { subscription } = await createTenantWithSubscription(start);
  const fixture = paymentFixture(subscription.id, "approved");

  await Promise.allSettled([sendPaymentWebhook(fixture), sendPaymentWebhook(fixture)]);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: String(fixture.id) } });
  const rows = await prisma.payment.count({ where: { subscriptionId: subscription.id, mercadoPagoPaymentId: String(fixture.id) } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: String(fixture.id) } });

  // Un solo efecto: una unica fila Payment, un unico marcador, un unico periodo nuevo.
  assert.equal(rows, 1, "solo existe un Payment");
  assert.ok(pay.approvedEffectAppliedAt !== null, "solo un marcador aplicado");
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assert.ok(sub.currentPeriodEnd.getTime() >= start.getTime(), "el periodo no retrocede");
  // Exactamente una entrega aplica el efecto (PROCESSED); la otra queda DUPLICATE
  // (perdio el reclamo) o FAILED (perdio la carrera del upsert unico) -> nunca un segundo efecto.
  assert.equal(events.filter((e) => e.result === "PROCESSED").length, 1, "exactamente una entrega PROCESSED (un solo efecto)");
  assert.ok(events.some((e) => e.result === "DUPLICATE" || e.result === "FAILED"), "la otra entrega queda DUPLICATE o FAILED");
});

// --- Rollback (seam de fallos) ----------------------------------------------

type SubscriptionRow = Awaited<ReturnType<typeof prisma.subscription.findUniqueOrThrow>>;

// En los escenarios 5-8 el Payment es NUEVO (se crea dentro de la transaccion que
// falla), asi que tras el rollback la fila NO debe existir. La asercion es estricta:
// no acepta indistintamente fila inexistente o parcialmente creada.
async function assertRollbackOfNewPayment(subBefore: SubscriptionRow, tenantId: string, externalId: string) {
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subBefore.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const pay = await prisma.payment.findUnique({ where: { mercadoPagoPaymentId: externalId } });
  const audits = await prisma.auditLog.count({ where: { tenantId, action: "MERCADO_PAGO_WEBHOOK_PROCESSED" } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: externalId } });

  // Payment nuevo: no debe existir tras el rollback.
  assert.equal(pay, null, "la fila Payment nueva no debe existir tras el rollback");
  // Subscription: todos los campos economicos sin cambios.
  assert.equal(sub.currentPeriodStart.getTime(), subBefore.currentPeriodStart.getTime());
  assert.equal(sub.currentPeriodEnd.getTime(), subBefore.currentPeriodEnd.getTime());
  assert.equal(sub.status, subBefore.status);
  assert.equal(sub.graceEndsAt?.getTime() ?? null, subBefore.graceEndsAt?.getTime() ?? null);
  assert.equal(sub.pendingUnitsSnapshot, subBefore.pendingUnitsSnapshot);
  assert.equal(sub.pendingPriceCents, subBefore.pendingPriceCents);
  // Tenant: sin reactivacion parcial y sin divergir de Subscription.
  assert.equal(ten.status, "TRIAL");
  assert.equal(ten.status, sub.status);
  // AuditLog: sin auditoria economica parcial.
  assert.equal(audits, 0, "no debe haber auditoria economica parcial");
  // WebhookEvent: la entrega fallida termina FAILED; nunca DUPLICATE/PROCESSED.
  assert.ok(events.some((e) => e.result === "FAILED"), "ledger debe terminar FAILED");
  assert.ok(!events.some((e) => e.result === "DUPLICATE" || e.result === "PROCESSED"), "no debe quedar DUPLICATE/PROCESSED");
}

async function runFailingWebhook(subscriptionId: string, failAt: BillingTransactionStep, externalId: string) {
  __unsafeSetBillingTestHooks({
    onStep: (step) => {
      if (step === failAt) throw new Error(`inyeccion de fallo en ${step}`);
    },
  });
  try {
    await sendPaymentWebhook(paymentFixture(subscriptionId, "approved", externalId));
  } catch {
    // esperado: processMercadoPagoWebhook marca FAILED y relanza
  } finally {
    __unsafeSetBillingTestHooks({});
  }
}

test("5. Fallo despues del reclamo y antes de Subscription produce rollback", async () => {
  const start = new Date();
  const { tenant, subscription } = await createTenantWithSubscription(start);
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const externalId = `${RUN}-pay-rb5-${++counter}`;
  await runFailingWebhook(subscription.id, "AFTER_EFFECT_CLAIM", externalId);
  await assertRollbackOfNewPayment(subBefore, tenant.id, externalId);
});

test("6. Fallo despues de Subscription y antes de Tenant produce rollback", async () => {
  const start = new Date();
  const { tenant, subscription } = await createTenantWithSubscription(start);
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const externalId = `${RUN}-pay-rb6-${++counter}`;
  await runFailingWebhook(subscription.id, "AFTER_SUBSCRIPTION_UPDATE", externalId);
  await assertRollbackOfNewPayment(subBefore, tenant.id, externalId);
});

test("7. Fallo al crear AuditLog produce rollback", async () => {
  const start = new Date();
  const { tenant, subscription } = await createTenantWithSubscription(start);
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const externalId = `${RUN}-pay-rb7-${++counter}`;
  await runFailingWebhook(subscription.id, "BEFORE_AUDIT_LOG", externalId);
  await assertRollbackOfNewPayment(subBefore, tenant.id, externalId);
});

test("8. Reintento despues del rollback aplica el efecto exactamente una vez", async () => {
  const start = new Date();
  const { tenant, subscription } = await createTenantWithSubscription(start);
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const externalId = `${RUN}-pay-rb8-${++counter}`;

  // Primer intento falla y hace rollback (fila Payment nueva no debe existir).
  await runFailingWebhook(subscription.id, "AFTER_TENANT_UPDATE", externalId);
  await assertRollbackOfNewPayment(subBefore, tenant.id, externalId);

  // Reintento sin hooks: aplica el efecto una sola vez.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", externalId));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const rows = await prisma.payment.findMany({ where: { mercadoPagoPaymentId: externalId } });
  const audits = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED" } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: externalId } });

  assert.equal(rows.length, 1, "existe una unica fila Payment");
  const pay = rows[0];
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.approvedEffectAppliedAt !== null, "marcador establecido tras el reintento");
  assert.equal(pay.approvedEffectReconciliationRequired, false);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
  assert.ok(sub.currentPeriodEnd.getTime() >= start.getTime(), "un unico periodo nuevo, sin retroceder");
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
  assert.equal(audits, 1, "exactamente una auditoria economica exitosa");
  assert.ok(events.some((e) => e.result === "FAILED"), "existe una entrega FAILED");
  assert.ok(events.some((e) => e.result === "PROCESSED"), "existe una entrega PROCESSED");
  assert.ok(!events.some((e) => e.result === "DUPLICATE"), "no existe DUPLICATE antes del replay");
  assert.equal(sub.pendingUnitsSnapshot, null, "los terminos pendientes no se limpian dos veces");

  // Un replay posterior no vuelve a extender (periodo sin cambios) y queda DUPLICATE.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", externalId));
  const afterReplay = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(afterReplay.currentPeriodEnd.getTime(), sub.currentPeriodEnd.getTime(), "el replay no vuelve a extender");
  const eventsAfterReplay = await prisma.webhookEvent.findMany({ where: { dataId: externalId } });
  assert.ok(eventsAfterReplay.some((e) => e.result === "DUPLICATE"), "el replay queda DUPLICATE");
});

// 9. Ledger PROCESSED.
test("9. El ledger registra PROCESSED para un APPROVED nuevo", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved"));
  const events = await prisma.webhookEvent.findMany({ where: { subscriptionId: subscription.id } });
  assert.ok(events.some((e) => e.result === "PROCESSED"));
});

// 10. Ledger DUPLICATE.
test("10. El ledger registra DUPLICATE en el segundo APPROVED", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);
  await sendPaymentWebhook(fixture);
  const events = await prisma.webhookEvent.findMany({ where: { subscriptionId: subscription.id } });
  assert.ok(events.some((e) => e.result === "PROCESSED"));
  assert.ok(events.some((e) => e.result === "DUPLICATE"));
});

// 11. Preapproval sincroniza Subscription y Tenant atomicamente.
test("11. Preapproval sincroniza Subscription y Tenant en transaccion", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { mercadoPagoPreapprovalId: preId } });

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ id: preId, status: "paused", external_reference: subscription.id }),
      text: async () => "",
      headers: new Headers(),
    }) as unknown as Response) as unknown as typeof fetch;

  await processMercadoPagoWebhook({
    payload: { type: "subscription_preapproval", data: { id: preId } },
    headers: signedHeaders(preId),
    dataIdFromQuery: null,
  });

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "GRACE_PERIOD");
  assert.equal(ten.status, "GRACE_PERIOD");
});

// 12. Terminos pendientes aplicados y limpiados una sola vez.
test("12. Los terminos pendientes se aplican y limpian con el APPROVED", async () => {
  const start = new Date();
  const { subscription } = await createTenantWithSubscription(start);
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { pendingUnitsSnapshot: 50, pendingPriceCents: 200000, pendingCurrency: "COP", pendingPriceEffectiveAt: start },
  });

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved"));
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(sub.unitsSnapshot, 50);
  assert.equal(sub.priceCents, 200000);
  assert.equal(sub.pendingUnitsSnapshot, null);
  assert.equal(sub.pendingPriceCents, null);
});

// --- Cuarentena historica ----------------------------------------------------

// 13. Pago historico en cuarentena no extiende y queda RECONCILIATION_REQUIRED.
test("13. Pago historico en cuarentena no extiende (RECONCILIATION_REQUIRED)", async () => {
  const start = new Date();
  const histStart = new Date(start.getTime() - 1000);
  const histEnd = new Date(start.getTime() - 500);
  const { tenant, subscription } = await createTenantWithSubscription(start);
  // Terminos pendientes que NO deben limpiarse.
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { pendingUnitsSnapshot: 50, pendingPriceCents: 200000, pendingCurrency: "COP", pendingPriceEffectiveAt: start },
  });
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const externalId = `${RUN}-pay-hist-${++counter}`;
  // Simula un pago historico ya existente y en cuarentena (como lo dejaria la migracion),
  // con periodos historicos propios que NO deben cambiar.
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      amountCents: 100000,
      currency: "COP",
      status: "APPROVED",
      provider: "MERCADO_PAGO",
      dueDate: histStart,
      paidAt: histStart,
      periodStart: histStart,
      periodEnd: histEnd,
      mercadoPagoPaymentId: externalId,
      externalReference: externalId,
      approvedEffectReconciliationRequired: true,
    },
  });

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", externalId));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: externalId } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: externalId } });
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
    orderBy: { createdAt: "desc" },
  });

  // Payment historico sin cambios de periodo, sin reclamar efecto, sigue en cuarentena.
  assert.equal(pay.periodStart.getTime(), histStart.getTime(), "Payment.periodStart sin cambios");
  assert.equal(pay.periodEnd.getTime(), histEnd.getTime(), "Payment.periodEnd sin cambios");
  assert.equal(pay.approvedEffectAppliedAt, null, "no reclama efecto");
  assert.equal(pay.approvedEffectReconciliationRequired, true, "sigue en cuarentena");
  // Subscription sin cambios (incluidos terminos pendientes) y Tenant sin cambios.
  assert.equal(sub.currentPeriodStart.getTime(), subBefore.currentPeriodStart.getTime());
  assert.equal(sub.currentPeriodEnd.getTime(), subBefore.currentPeriodEnd.getTime());
  assert.equal(sub.status, subBefore.status);
  assert.equal(sub.pendingUnitsSnapshot, 50, "los terminos pendientes no se limpian");
  assert.equal(sub.pendingPriceCents, 200000);
  assert.equal(ten.status, subBefore.status === "TRIAL" ? "TRIAL" : ten.status);
  assert.equal(ten.status, "TRIAL");
  // Ledger y auditoria.
  assert.ok(events.some((e) => e.result === "RECONCILIATION_REQUIRED"));
  const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
  assert.equal(meta.reconciliationRequired, true);
  assert.equal(meta.effectApplied, false);
});

// 14. Pago historico reconciliado manualmente no extiende ante replay (queda DUPLICATE).
test("14. Historico reconciliado manualmente no extiende ante replay", async () => {
  const start = new Date();
  const { tenant, subscription } = await createTenantWithSubscription(start);
  const externalId = `${RUN}-pay-recon-${++counter}`;
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      amountCents: 100000,
      currency: "COP",
      status: "APPROVED",
      provider: "MERCADO_PAGO",
      dueDate: start,
      paidAt: start,
      periodStart: start,
      periodEnd: start,
      mercadoPagoPaymentId: externalId,
      externalReference: externalId,
      // reconciliado: efecto marcado como aplicado, cuarentena limpia.
      approvedEffectAppliedAt: start,
      approvedEffectReconciliationRequired: false,
    },
  });

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", externalId));
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: externalId } });
  assert.equal(sub.currentPeriodEnd.getTime(), start.getTime(), "no debe extender");
  assert.ok(events.some((e) => e.result === "DUPLICATE"));
});

// 15. Pago nuevo no queda marcado para reconciliacion.
test("15. Pago nuevo no queda marcado para reconciliacion", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: String(fixture.id) } });
  assert.equal(pay.approvedEffectReconciliationRequired, false);
});

// 16. Peticion sin dataId no crea ledger, no llama a Mercado Pago, no toca modelos.
test("16. Peticion sin dataId no persiste ledger ni llama a Mercado Pago", async () => {
  const before = await prisma.webhookEvent.count();
  // fetch que falla si se invoca (no debe llamarse).
  globalThis.fetch = (async () => {
    throw new Error("fetch no debe invocarse para una peticion sin dataId");
  }) as unknown as typeof fetch;

  const result = await processMercadoPagoWebhook({
    payload: { type: "payment", data: {} },
    headers: new Headers(),
    dataIdFromQuery: null,
  });

  const afterCount = await prisma.webhookEvent.count();
  assert.equal(result.processed, false);
  assert.equal(afterCount, before, "no debe crear ninguna fila de WebhookEvent");
});

// 17. La evidencia de auditoria del CLI distingue dos pagos de la MISMA suscripcion.
test("17. findPaymentAuditEvidence distingue la evidencia por payment ID exacto", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const idA = `${RUN}-pay-evA-${++counter}`;
  const idB = `${RUN}-pay-evB-${++counter}`;
  // Dos pagos aprobados distintos en la misma suscripcion -> dos auditorias con targetId=subscriptionId.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", idA));
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", idB));

  const evidenceA = await findPaymentAuditEvidence(subscription.id, idA);
  const evidenceB = await findPaymentAuditEvidence(subscription.id, idB);
  const evidenceOther = await findPaymentAuditEvidence(subscription.id, `${RUN}-inexistente`);

  assert.equal(evidenceA.count, 1, "solo cuenta la auditoria del pago A");
  assert.equal(evidenceB.count, 1, "solo cuenta la auditoria del pago B");
  assert.equal(evidenceOther.count, 0, "un pago inexistente no tiene evidencia");
  assert.deepEqual(evidenceA.actions, ["MERCADO_PAGO_WEBHOOK_PROCESSED"]);
  assert.ok(evidenceA.latestAt !== null);
});
