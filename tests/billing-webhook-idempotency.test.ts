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
  createMercadoPagoSubscriptionForTenant,
  __unsafeSetBillingTestHooks,
  type BillingTransactionStep,
} from "../src/domains/billing/mercado-pago.service";
import { addDays, BILLING_PERIOD_DAYS } from "../src/domains/billing/period";
import { findPaymentAuditEvidence } from "../scripts/reconcile-historical-payment-effects";
import { updateTenantStatusForSuperAdmin, SerializationConflictError } from "../src/domains/platform/tenant-admin.service";

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
const extraUserIds: string[] = [];

// Crea un usuario SUPER_ADMIN (sin tenant) para actuar como actor de acciones
// manuales. Se limpia en after() por id. Email unico por RUN.
async function createSuperAdminActor(): Promise<string> {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `${RUN}-sa-${counter}@example.test`,
      password: "x",
      name: "QA SuperAdmin",
      role: "SUPER_ADMIN",
    },
  });
  extraUserIds.push(user.id);
  return user.id;
}

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
  // AuditLog de acciones manuales (actor SUPER_ADMIN) o por tenant.
  await prisma.auditLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { actorUserId: { in: extraUserIds } }] } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: { in: extraUserIds } }] } });
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

// 11. Preapproval "paused" NO degrada una suscripcion con cobertura vigente (F2-01).
// (Antes de Fase 2C este webhook movia la suscripcion a GRACE_PERIOD siempre.)
test("11. Preapproval paused preserva el acceso vigente (no degrada)", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
  const preId = `${RUN}-pre-${++counter}`;
  // Suscripcion ACTIVE con periodo vigente (cobertura de acceso real).
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

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
  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  // Acceso preservado: sub y tenant siguen ACTIVE; solo se refresco la metadata MP.
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
  assert.equal(sub.mercadoPagoStatus, "paused");
  // Ledger IGNORED con la razon de pausa (no cambio de acceso).
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored, "el evento paused queda IGNORED");
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "PREAPPROVAL_PAUSED_PRESERVED");
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

// ============================================================================
// FASE 2C - Precedencia de estados y cobertura
// ============================================================================

// status es unknown a proposito: permite simular payloads con tipos no string (F2D-05).
async function sendPreapprovalWebhook(preId: string, status: unknown, subscriptionId: string) {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ id: preId, status, external_reference: subscriptionId }),
      text: async () => "",
      headers: new Headers(),
    }) as unknown as Response) as unknown as typeof fetch;
  return processMercadoPagoWebhook({
    payload: { type: "subscription_preapproval", data: { id: preId } },
    headers: signedHeaders(preId),
    dataIdFromQuery: null,
  });
}

// Fixture de pago con status arbitrario (permite tipos no string en runtime).
function rawPaymentFixture(subscriptionId: string, status: unknown, id: string) {
  return {
    id,
    status,
    transaction_amount: 1000,
    currency_id: "COP",
    date_approved: new Date().toISOString(),
    external_reference: subscriptionId,
  } as Record<string, unknown>;
}

// Crea un Payment directamente (para simular evidencia real/simulada/cuarentena).
async function createDirectPayment(
  tenantId: string,
  subscriptionId: string,
  data: {
    provider: "MERCADO_PAGO" | "SIMULATED";
    status: "APPROVED" | "PENDING" | "REJECTED";
    periodEnd: Date;
    approvedEffectAppliedAt?: Date | null;
    approvedEffectReconciliationRequired?: boolean;
    externalId?: string;
  }
) {
  const now = new Date();
  return prisma.payment.create({
    data: {
      tenantId,
      subscriptionId,
      amountCents: 100000,
      currency: "COP",
      status: data.status,
      provider: data.provider,
      dueDate: now,
      paidAt: data.status === "APPROVED" ? now : null,
      periodStart: new Date(data.periodEnd.getTime() - BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      periodEnd: data.periodEnd,
      externalReference: data.externalId ?? `${RUN}-direct-${++counter}`,
      mercadoPagoPaymentId: data.provider === "MERCADO_PAGO" ? data.externalId ?? `${RUN}-mp-${++counter}` : null,
      approvedEffectAppliedAt: data.approvedEffectAppliedAt ?? null,
      approvedEffectReconciliationRequired: data.approvedEffectReconciliationRequired ?? false,
    },
  });
}

// 18. APPROVED y luego PENDING tardio: el APPROVED aplicado NO retrocede (F2-01/F2-08).
test("18. APPROVED aplicado no retrocede ante un PENDING tardio del mismo pago", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-late-pend-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const afterApproved = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

  await sendPaymentWebhook(paymentFixture(subscription.id, "pending", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });

  assert.equal(pay.status, "APPROVED", "el Payment no retrocede a PENDING");
  assert.ok(pay.paidAt !== null, "no se borra paidAt");
  assert.ok(pay.approvedEffectAppliedAt !== null, "el marcador de efecto se conserva");
  assert.equal(sub.status, "ACTIVE", "la Subscription sigue ACTIVE");
  assert.equal(ten.status, "ACTIVE", "el Tenant sigue ACTIVE");
  assert.equal(sub.currentPeriodEnd.getTime(), afterApproved.currentPeriodEnd.getTime(), "el periodo no cambia");
  assert.ok(events.some((e) => e.result === "IGNORED"), "el evento tardio queda IGNORED");
});

// 19. APPROVED y luego REJECTED tardio: no retrocede (F2-01/F2-08).
test("19. APPROVED aplicado no retrocede ante un REJECTED tardio del mismo pago", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-late-rej-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));

  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.paidAt !== null);
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
});

// 20. REJECTED y luego APPROVED aplica el efecto exactamente una vez.
test("20. REJECTED y luego APPROVED aplica el efecto una vez", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-rej-appr-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));
  const afterRejected = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  assert.equal(afterRejected.status, "REJECTED");
  assert.equal(afterRejected.approvedEffectAppliedAt, null);

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.approvedEffectAppliedAt !== null);
  assert.equal(sub.status, "ACTIVE");
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
});

// 21. Un rechazo de un pago DISTINTO no degrada una suscripcion cubierta por otro pago.
test("21. REJECTED de otro pago no degrada una suscripcion cubierta", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  // Pago A aprobado -> cobertura vigente.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", `${RUN}-payA-${++counter}`));
  const afterA = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(afterA.status, "ACTIVE");

  // Pago B (distinto) llega REJECTED.
  const idB = `${RUN}-payB-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", idB));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const payB = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: idB } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: idB } });
  assert.equal(sub.status, "ACTIVE", "la suscripcion cubierta no se degrada");
  assert.equal(ten.status, "ACTIVE");
  assert.equal(sub.currentPeriodEnd.getTime(), afterA.currentPeriodEnd.getTime());
  assert.equal(payB.status, "REJECTED", "el pago B si refleja su estado real");
  assert.ok(events.some((e) => e.result === "IGNORED"));
});

// 22. PENDING sobre un trial vigente no degrada (cobertura de acceso por trial).
test("22. PENDING con trial vigente no degrada la suscripcion", async () => {
  const trialEnd = addDays(new Date(), BILLING_PERIOD_DAYS);
  const { tenant, subscription } = await createTenantWithSubscription(trialEnd);
  const id = `${RUN}-pay-trial-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "pending", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(sub.status, "TRIAL", "el trial vigente se conserva");
  assert.equal(ten.status, "TRIAL");
  assert.ok(events.some((e) => e.result === "IGNORED"));
});

// 23. Estado desconocido sobre un pago NUEVO: no crea Payment, no degrada, IGNORED.
test("23. Estado desconocido en pago nuevo no crea Payment ni degrada", async () => {
  const trialEnd = addDays(new Date(), BILLING_PERIOD_DAYS);
  const { tenant, subscription } = await createTenantWithSubscription(trialEnd);
  const id = `${RUN}-pay-unknown-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "refunded", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUnique({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(pay, null, "no se crea un Payment ambiguo");
  assert.equal(sub.status, "TRIAL", "no se modifica la Subscription");
  assert.equal(ten.status, "TRIAL", "no se modifica el Tenant");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored, "queda IGNORED");
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "UNKNOWN_PROVIDER_STATUS");
});

// 24. Estado desconocido sobre un pago APPROVED existente: conserva TODO el estado
// economico y solo refresca rawStatus; Subscription/Tenant intactos (aserciones ampliadas).
test("24. Estado desconocido sobre APPROVED existente conserva estado y refresca rawStatus", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-unknown-exist-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const payBefore = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });

  await sendPaymentWebhook(paymentFixture(subscription.id, "some_new_state", id));

  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  // Payment: status, marcador, cuarentena, paidAt y periodos intactos; solo rawStatus cambia.
  assert.equal(pay.status, "APPROVED", "conserva el status economico");
  assert.equal(pay.approvedEffectAppliedAt?.getTime(), payBefore.approvedEffectAppliedAt?.getTime(), "conserva el marcador");
  assert.equal(pay.approvedEffectReconciliationRequired, false);
  assert.equal(pay.paidAt?.getTime(), payBefore.paidAt?.getTime(), "no se borra paidAt");
  assert.equal(pay.periodStart.getTime(), payBefore.periodStart.getTime());
  assert.equal(pay.periodEnd.getTime(), payBefore.periodEnd.getTime());
  assert.equal(pay.rawStatus, "some_new_state", "rawStatus refrescado como metadata");
  // Subscription y Tenant sin cambios.
  assert.equal(sub.status, subBefore.status);
  assert.equal(sub.currentPeriodEnd.getTime(), subBefore.currentPeriodEnd.getTime());
  assert.equal(ten.status, "ACTIVE");
  // Ledger IGNORED con metadata completa y sanitizada (F2D-07).
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored, "queda IGNORED");
  const meta = ignored?.metadata as Record<string, unknown>;
  assert.equal(meta.ignoredReason, "UNKNOWN_PROVIDER_STATUS");
  assert.equal(meta.providerStatus, "some_new_state");
  assert.equal(meta.incomingPaymentStatus, "UNKNOWN");
  assert.equal(meta.previousPaymentStatus, "APPROVED");
  assert.equal(meta.persistedPaymentStatus, "APPROVED");
  assert.equal(meta.paymentExists, true);
  assert.equal(meta.realPaymentCovered, true);
  assert.equal(meta.appliedAccessEvidence, true);
  assert.equal(meta.subscriptionId, subscription.id);
  assert.equal(meta.tenantId, tenant.id);
});

// 25. Preapproval "authorized" sin pago real vigente NO activa por si solo.
test("25. Preapproval authorized sin pago real no activa (sin cobertura real)", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-auth-${++counter}`;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PENDING_PAYMENT", mercadoPagoPreapprovalId: preId, trialEndsAt: new Date(Date.now() - 1000) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });

  await sendPreapprovalWebhook(preId, "authorized", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.notEqual(sub.status, "ACTIVE", "no activa sin un pago real vigente");
  assert.equal(sub.status, "PENDING_PAYMENT");
  assert.notEqual(ten.status, "ACTIVE");
});

// 26. Preapproval "authorized" CON pago real vigente activa.
test("26. Preapproval authorized con pago real vigente activa", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-auth2-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { mercadoPagoPreapprovalId: preId } });
  // Pago real aplicado -> cobertura real vigente.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", `${RUN}-pay-auth2-${++counter}`));

  await sendPreapprovalWebhook(preId, "authorized", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
});

// 27. Preapproval con estado desconocido no modifica Subscription ni Tenant (IGNORED).
test("27. Preapproval desconocido no modifica acceso (IGNORED)", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
  const preId = `${RUN}-pre-unknown-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

  await sendPreapprovalWebhook(preId, "some_weird_status", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored);
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "UNKNOWN_PROVIDER_STATUS");
});

// 28. Reactivacion manual con pago real: el webhook NO auto-reactiva; la accion
// manual es quien mueve a ACTIVE (F2D-04 + F2D-06). No se prepara el tenant activo.
test("28. Reactivacion manual con pago real: el webhook no reactiva, la accion manual si", async () => {
  const actorId = await createSuperAdminActor();
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  // Suspension administrativa previa.
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  // Sin evidencia: la reactivacion manual falla dentro de la transaccion.
  await assert.rejects(
    () => updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE"),
    /no tiene evidencia/i,
    "sin pago vigente no reactiva"
  );

  // Llega un pago real APPROVED: se aplica economicamente pero NO reactiva el acceso.
  const payId = `${RUN}-pay-react-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", payId));
  const subAfterPay = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const tenAfterPay = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const payAfter = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: payId } });
  assert.equal(subAfterPay.status, "SUSPENDED", "el webhook NO reactiva la Subscription");
  assert.equal(tenAfterPay.status, "SUSPENDED", "el webhook NO reactiva el Tenant");
  assert.ok(payAfter.approvedEffectAppliedAt !== null, "el pago si aplica su efecto economico");
  assert.ok(payAfter.periodEnd.getTime() > subAfterPay.currentPeriodStart.getTime(), "el periodo se extiende");

  // La accion manual es quien reactiva.
  const reactivated = await updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE");
  const subFinal = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(reactivated.status, "ACTIVE", "la accion manual reactiva el Tenant");
  assert.equal(subFinal.status, "ACTIVE", "y la Subscription");
});

// ============================================================================
// FASE 2E - Correcciones F2D-01..F2D-08 (integracion)
// ============================================================================

// Prepara una suscripcion en GRACE_PERIOD con un graceEndsAt exacto.
async function makeGraceSubscription(graceEndsAt: Date | null) {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "GRACE_PERIOD", graceEndsAt, trialEndsAt: new Date(Date.now() - 1000) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "GRACE_PERIOD" } });
  return { tenant, subscription };
}

// 29. Grace VIGENTE no renueva su frontera ante un webhook no aprobado (F2D-01).
test("29. REJECTED sobre Grace vigente no renueva graceEndsAt", async () => {
  const graceEnd = addDays(new Date(), 3);
  const { tenant, subscription } = await makeGraceSubscription(graceEnd);
  const id = `${RUN}-pay-grace-vig-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(sub.status, "GRACE_PERIOD");
  assert.equal(sub.graceEndsAt?.getTime(), graceEnd.getTime(), "graceEndsAt exactamente preservado");
  assert.equal(ten.status, "GRACE_PERIOD");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored);
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "EXISTING_GRACE_PRESERVED");
});

// 30. Grace VENCIDA no renueva su frontera; replays repetidos tampoco (F2D-01).
test("30. REJECTED/PENDING sobre Grace vencida no renueva graceEndsAt (ni en replays)", async () => {
  const graceEnd = new Date(Date.now() - 60 * 60 * 1000); // vencida
  const { tenant, subscription } = await makeGraceSubscription(graceEnd);
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const lastId = `${RUN}-pay-grace-venc3-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", `${RUN}-pay-grace-venc1-${++counter}`));
  await sendPaymentWebhook(paymentFixture(subscription.id, "pending", `${RUN}-pay-grace-venc2-${++counter}`));
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", lastId));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: lastId } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: lastId } });
  const audits = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED" } });
  // Subscription: estado y frontera vencida preservados exactamente; periodos intactos.
  assert.equal(sub.status, "GRACE_PERIOD");
  assert.equal(sub.graceEndsAt?.getTime(), graceEnd.getTime(), "graceEndsAt vencido se conserva, no se renueva");
  assert.equal(sub.currentPeriodEnd.getTime(), subBefore.currentPeriodEnd.getTime());
  // Tenant intacto; Payment refleja su estado real; ledger IGNORED con la razon; hay auditoria por evento.
  assert.equal(ten.status, "GRACE_PERIOD");
  assert.equal(pay.status, "REJECTED");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored, "el ultimo evento queda IGNORED");
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "EXISTING_GRACE_PRESERVED");
  assert.equal(audits, 3, "una auditoria por cada uno de los 3 eventos");
});

// 31. Grace con graceEndsAt = null permanece null (F2D-01).
test("31. Webhook no aprobado sobre Grace null no inventa frontera", async () => {
  const { tenant, subscription } = await makeGraceSubscription(null);
  const id = `${RUN}-pay-grace-null-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED" }, orderBy: { createdAt: "desc" } });
  assert.equal(sub.status, "GRACE_PERIOD");
  assert.equal(sub.graceEndsAt, null, "graceEndsAt null permanece null");
  assert.equal(ten.status, "GRACE_PERIOD", "Tenant sin cambios");
  assert.equal(pay.status, "REJECTED");
  assert.ok(events.some((e) => e.result === "IGNORED"));
  assert.equal((audit?.metadata as Record<string, unknown>)?.ignoredReason, "EXISTING_GRACE_PRESERVED");
});

// 32. REJECTED con cortesia/SIMULATED vigente no degrada la suscripcion.
test("32. REJECTED con SIMULATED vigente no degrada", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  // Cortesia/renovacion simulada vigente.
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "SIMULATED",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
  });
  // Estado base: PENDING_PAYMENT (sin cobertura por si mismo), pero con evidencia SIMULATED.
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "PENDING_PAYMENT", trialEndsAt: new Date(Date.now() - 1000) } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });

  const id = `${RUN}-pay-sim-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.notEqual(sub.status, "GRACE_PERIOD", "la evidencia simulada evita la degradacion");
  assert.equal(sub.status, "PENDING_PAYMENT");
  assert.ok(events.some((e) => e.result === "IGNORED"));
});

// 33. Preapproval pending con ACTIVE vigente => PRESERVE.
test("33. Preapproval pending con ACTIVE vigente preserva", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
  const preId = `${RUN}-pre-pend-act-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

  await sendPreapprovalWebhook(preId, "pending", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
});

// 34. Preapproval pending SIN cobertura ni trial => SET PENDING_PAYMENT y Tenant coherente.
test("34. Preapproval pending sin cobertura sincroniza a PENDING_PAYMENT", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-pend-nocov-${++counter}`;
  // ACTIVE vencido (period ya paso) y trial vencido, sin pago real.
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId, trialEndsAt: new Date(Date.now() - 1000) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

  await sendPreapprovalWebhook(preId, "pending", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "PENDING_PAYMENT", "sin cobertura baja a PENDING_PAYMENT");
  assert.equal(ten.status, "PENDING_PAYMENT", "el Tenant se sincroniza (no queda ACTIVE)");
});

// 35. Preapproval pending con trial valido desde PENDING_PAYMENT => SET TRIAL y Tenant TRIAL (F2D-02).
test("35. Preapproval pending con trial valido sincroniza Tenant a TRIAL", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-pend-trial-${++counter}`;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PENDING_PAYMENT", mercadoPagoPreapprovalId: preId, trialEndsAt: addDays(new Date(), 10) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });

  await sendPreapprovalWebhook(preId, "pending", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "TRIAL");
  assert.equal(ten.status, "TRIAL", "TRIAL no exige pago real y sincroniza el Tenant");
});

// 36. Preapproval paused SIN cobertura (ACTIVE vencido) => SET PENDING_PAYMENT (F2D-03).
test("36. Preapproval paused sin cobertura no conserva Active vencido", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-paused-nocov-${++counter}`;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId, trialEndsAt: new Date(Date.now() - 1000) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

  await sendPreapprovalWebhook(preId, "paused", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "PENDING_PAYMENT", "no conserva ACTIVE vencido");
  assert.equal(ten.status, "PENDING_PAYMENT");
});

// 37. Preapproval authorized sobre SUSPENDED => PRESERVE (F2D-03).
test("37. Preapproval authorized sobre SUSPENDED preserva el terminal", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-auth-susp-${++counter}`;
  // Pago real vigente + terminal SUSPENDED: aun asi no debe reactivar.
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED", mercadoPagoPreapprovalId: preId } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  await sendPreapprovalWebhook(preId, "authorized", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  assert.equal(sub.status, "SUSPENDED", "no reactiva un terminal");
  assert.equal(ten.status, "SUSPENDED");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "TERMINAL_SUBSCRIPTION_STATUS");
});

// 38. Preapproval pending sobre CANCELLED => PRESERVE (F2D-03).
test("38. Preapproval pending sobre CANCELLED preserva el terminal", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-pend-canc-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "CANCELLED", mercadoPagoPreapprovalId: preId } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "CANCELLED" } });

  await sendPreapprovalWebhook(preId, "pending", subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "CANCELLED");
  assert.equal(ten.status, "CANCELLED");
});

// 39. Payment APPROVED sobre SUSPENDED: aplica economicamente, NO reactiva (F2D-04).
test("39. APPROVED sobre SUSPENDED aplica el pago y conserva SUSPENDED", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
  const subBefore = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const id = `${RUN}-pay-appr-susp-${++counter}`;

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
    orderBy: { createdAt: "desc" },
  });
  // Economico: aplica, marca efecto, extiende periodo.
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.approvedEffectAppliedAt !== null, "reclama el efecto una vez");
  assert.ok(pay.paidAt !== null);
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assert.ok(sub.currentPeriodEnd.getTime() > subBefore.currentPeriodEnd.getTime(), "el periodo se extiende");
  // Acceso: sigue SUSPENDED en ambos.
  assert.equal(sub.status, "SUSPENDED", "no auto-reactiva la Subscription");
  assert.equal(ten.status, "SUSPENDED", "no auto-reactiva el Tenant");
  // Ledger PROCESSED (el efecto economico si se proceso) y auditoria explicita.
  assert.ok(events.some((e) => e.result === "PROCESSED"));
  const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
  assert.equal(meta.paymentEffectApplied, true);
  assert.equal(meta.accessStatePreserved, true);
  assert.equal(meta.previousSubscriptionStatus, "SUSPENDED");
  assert.equal(meta.persistedSubscriptionStatus, "SUSPENDED");
  assert.equal(meta.ignoredAccessReason, "SUSPENDED_REQUIRES_MANUAL_REACTIVATION");
});

// 40. Payment APPROVED sobre CANCELLED: aplica economicamente (periodo, paidAt,
// marcador, terminos pendientes), NO reactiva, y el replay no vuelve a extender.
test("40. APPROVED sobre CANCELLED aplica el pago y conserva CANCELLED", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "CANCELLED", pendingUnitsSnapshot: 50, pendingPriceCents: 200000, pendingCurrency: "COP", pendingPriceEffectiveAt: new Date() },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "CANCELLED" } });
  const id = `${RUN}-pay-appr-canc-${++counter}`;

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
    orderBy: { createdAt: "desc" },
  });
  // Economico: efecto aplicado, paidAt, periodo extendido y compartido, terminos aplicados+limpiados.
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.approvedEffectAppliedAt !== null, "marcador aplicado");
  assert.ok(pay.paidAt !== null, "paidAt fijado");
  assertThirtyDayPeriod(sub.currentPeriodStart, sub.currentPeriodEnd);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assert.equal(sub.unitsSnapshot, 50, "terminos pendientes aplicados");
  assert.equal(sub.pendingUnitsSnapshot, null, "terminos pendientes limpiados");
  // Acceso terminal preservado en ambos.
  assert.equal(sub.status, "CANCELLED", "no auto-reactiva");
  assert.equal(ten.status, "CANCELLED");
  assert.ok(events.some((e) => e.result === "PROCESSED"), "el efecto economico si se proceso");
  const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
  assert.equal(meta.paymentEffectApplied, true);
  assert.equal(meta.accessStatePreserved, true);
  assert.equal(meta.ignoredAccessReason, "CANCELLED_ACCESS_PRESERVED");

  // Replay: no vuelve a extender ni re-aplica terminos; queda DUPLICATE.
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const afterReplay = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const eventsAfter = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(afterReplay.currentPeriodEnd.getTime(), sub.currentPeriodEnd.getTime(), "el replay no vuelve a extender");
  assert.equal(afterReplay.status, "CANCELLED");
  assert.ok(eventsAfter.some((e) => e.result === "DUPLICATE"), "el replay queda DUPLICATE");
});

// 41. Reactivacion manual con Payment vencido: no permite (Subscription+Tenant intactos, sin auditoria).
test("41. Reactivacion con Payment vencido no permite", async () => {
  const actorId = await createSuperAdminActor();
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: new Date(Date.now() - 60 * 60 * 1000), // vencido
    approvedEffectAppliedAt: new Date(),
  });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  await assert.rejects(() => updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE"), /no tiene evidencia/i);
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const audits = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "TENANT_REACTIVATED" } });
  assert.equal(ten.status, "SUSPENDED", "no cambia el Tenant");
  assert.equal(sub.status, "SUSPENDED", "no cambia la Subscription");
  assert.equal(audits, 0, "no queda auditoria de reactivacion");
});

// 42. Reactivacion manual con Payment en cuarentena: no permite.
test("42. Reactivacion con Payment en cuarentena no permite", async () => {
  const actorId = await createSuperAdminActor();
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: null,
    approvedEffectReconciliationRequired: true, // cuarentena
  });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  await assert.rejects(() => updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE"), /no tiene evidencia/i);
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(ten.status, "SUSPENDED");
  assert.equal(sub.status, "SUSPENDED");
});

// 43. Reactivacion manual con SIMULATED vigente: permite (politica administrativa).
test("43. Reactivacion con SIMULATED vigente permite", async () => {
  const actorId = await createSuperAdminActor();
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "SIMULATED",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
  });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  const reactivated = await updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE");
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const audits = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "TENANT_REACTIVATED" } });
  assert.equal(reactivated.status, "ACTIVE", "Tenant reactivado");
  assert.equal(sub.status, "ACTIVE", "Subscription reactivada");
  assert.equal(audits, 1, "una auditoria de reactivacion (dentro de la transaccion)");
});

// 44. Unknown Payment NUEVO con tipo no string: IGNORED, no crea Payment, no 500.
test("44. Payment con status no-string (numero) en pago nuevo => IGNORED sin crear Payment", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
  const id = `${RUN}-pay-nonstr-new-${++counter}`;
  const result = await sendPaymentWebhook(rawPaymentFixture(subscription.id, 42, id));

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUnique({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(pay, null, "no crea Payment ambiguo");
  assert.equal(sub.status, "TRIAL");
  assert.equal(ten.status, "TRIAL");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored, "IGNORED, no FAILED/500");
  const meta = ignored?.metadata as Record<string, unknown>;
  assert.equal(meta.ignoredReason, "UNKNOWN_PROVIDER_STATUS");
  assert.equal(meta.providerStatus, "number", "providerStatus acotado al nombre del tipo");
  assert.equal(meta.incomingPaymentStatus, "UNKNOWN");
  assert.ok(!events.some((e) => e.result === "FAILED"), "no debe fallar");
});

// 45. Unknown Payment EXISTENTE con tipo no string: IGNORED, refresca rawStatus seguro.
test("45. Payment con status no-string sobre APPROVED existente => IGNORED, conserva estado", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-nonstr-exist-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));

  await sendPaymentWebhook(rawPaymentFixture(subscription.id, { a: 1 }, id));

  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(pay.status, "APPROVED", "conserva el status economico");
  assert.ok(pay.approvedEffectAppliedAt !== null);
  assert.equal(pay.rawStatus, "object", "rawStatus seguro (nombre del tipo)");
  assert.ok(events.some((e) => e.result === "IGNORED"));
  assert.ok(!events.some((e) => e.result === "FAILED"));
});

// 46. Unknown preapproval con tipo no string: IGNORED, no toca acceso.
test("46. Preapproval con status no-string => IGNORED sin modificar acceso", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
  const preId = `${RUN}-pre-nonstr-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

  await sendPreapprovalWebhook(preId, ["array-value"], subscription.id);

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored);
  assert.equal((ignored?.metadata as Record<string, unknown>)?.ignoredReason, "UNKNOWN_PROVIDER_STATUS");
  assert.equal((ignored?.metadata as Record<string, unknown>)?.providerStatus, "array");
  assert.ok(!events.some((e) => e.result === "FAILED"));
});

// 47. Fetch se invoca EXACTAMENTE una vez para un unknown (consulta MP + nada mas).
test("47. Unknown consulta Mercado Pago exactamente una vez", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-fetchonce-${++counter}`;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      json: async () => rawPaymentFixture(subscription.id, "refunded", id),
      text: async () => "",
      headers: new Headers(),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  await processMercadoPagoWebhook({
    payload: { type: "payment", data: { id } },
    headers: signedHeaders(id),
    dataIdFromQuery: null,
  });

  assert.equal(fetchCount, 1, "exactamente una consulta a Mercado Pago");
});

// 48. Fallo de auditoria en un evento IGNORED: rollback total, ledger FAILED (F2D-08 / §9.24).
test("48. Fallo de auditoria en unknown hace rollback y deja ledger FAILED", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-ignored-rb-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const payBefore = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });

  // Inyecta un fallo justo antes de auditar el evento ignorado.
  __unsafeSetBillingTestHooks({
    onStep: (step) => {
      if (step === "BEFORE_AUDIT_LOG") throw new Error("inyeccion de fallo en auditoria de ignored");
    },
  });
  try {
    await sendPaymentWebhook(rawPaymentFixture(subscription.id, "some_unknown", id));
  } catch {
    // esperado
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  // rawStatus NO cambio (rollback de la metadata local del evento ignorado).
  assert.equal(pay.rawStatus, payBefore.rawStatus, "rollback: rawStatus sin cambios");
  assert.equal(pay.status, "APPROVED");
  // El evento ignorado que fallo termina FAILED; nunca IGNORED parcial.
  assert.ok(events.some((e) => e.result === "FAILED"), "ledger del evento fallido termina FAILED");
  assert.ok(events.some((e) => e.result === "PROCESSED"), "el approved previo sigue PROCESSED");
});

// ============================================================================
// FASE 2G - Concurrencia (CAS), identidad cruzada y atomicidad (F2F-01..F2F-06)
// ============================================================================

// Ejecuta `fn` (una transaccion concurrente) exactamente cuando la operacion bajo
// prueba alcanza `step`. Deterministico: sin sleeps.
function setConcurrentHook(step: BillingTransactionStep, fn: () => Promise<void>) {
  let fired = false;
  __unsafeSetBillingTestHooks({
    onStep: async (s) => {
      if (s === step && !fired) {
        fired = true;
        await fn();
      }
    },
  });
}

// A. Carrera preapproval vs suspension administrativa: el CAS pierde y SUSPENDED prevalece.
test("49. Carrera preapproval SET vs suspension concurrente: CAS pierde, preserva SUSPENDED", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-race-${++counter}`;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PENDING_PAYMENT", mercadoPagoPreapprovalId: preId, trialEndsAt: addDays(new Date(), 10) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });

  setConcurrentHook("BEFORE_WEBHOOK_SUBSCRIPTION_CAS", async () => {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
  });
  try {
    await sendPreapprovalWebhook(preId, "pending", subscription.id);
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  const audits = await prisma.auditLog.findMany({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(sub.status, "SUSPENDED", "la suspension concurrente prevalece");
  assert.equal(ten.status, "SUSPENDED", "el Tenant no fue reactivado por el webhook");
  const ignored = events.find((event) => event.result === "IGNORED");
  assert.ok(ignored, "el webhook queda IGNORED");
  const eventMeta = ignored.metadata as Record<string, unknown>;
  assert.equal(eventMeta.ignoredReason, "CONCURRENT_SUBSCRIPTION_CHANGE");
  assert.equal(eventMeta.concurrentAccessChange, true);
  assert.equal(eventMeta.persistedSubscriptionStatus, "SUSPENDED");
  assert.equal(eventMeta.currentPeriodStart, sub.currentPeriodStart.toISOString());
  assert.equal(eventMeta.currentPeriodEnd, sub.currentPeriodEnd.toISOString());
  assert.equal(eventMeta.graceEndsAt, null);
  assert.equal(audits.length, 1, "solo queda la auditoria de la decision confirmada");
  const auditMeta = audits[0]?.metadata as Record<string, unknown>;
  assert.equal(auditMeta.persistedSubscriptionStatus, "SUSPENDED");
  assert.equal(auditMeta.ignoredReason, "CONCURRENT_SUBSCRIPTION_CHANGE");
});
// B. Carrera Payment no aprobado vs cancelacion administrativa: CANCELLED prevalece, no Grace.
test("50. Carrera REJECTED (ENTER_GRACE) vs cancelacion concurrente: preserva CANCELLED", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PENDING_PAYMENT", trialEndsAt: new Date(Date.now() - 1000) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });
  const id = `${RUN}-pay-race-canc-${++counter}`;

  setConcurrentHook("BEFORE_WEBHOOK_SUBSCRIPTION_CAS", async () => {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "CANCELLED" } });
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "CANCELLED" } });
  });
  try {
    await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const audits = await prisma.auditLog.findMany({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(pay.status, "REJECTED");
  assert.equal(pay.paidAt, null);
  assert.equal(sub.status, "CANCELLED", "la cancelacion concurrente prevalece");
  assert.equal(sub.graceEndsAt, null, "no se creo un periodo de gracia");
  assert.equal(ten.status, "CANCELLED");
  const ignored = events.find((event) => event.result === "IGNORED");
  assert.ok(ignored);
  const eventMeta = ignored.metadata as Record<string, unknown>;
  assert.equal(eventMeta.ignoredReason, "CONCURRENT_SUBSCRIPTION_CHANGE");
  assert.equal(eventMeta.persistedSubscriptionStatus, "CANCELLED");
  assert.equal(eventMeta.currentPeriodStart, sub.currentPeriodStart.toISOString());
  assert.equal(eventMeta.currentPeriodEnd, sub.currentPeriodEnd.toISOString());
  assert.equal(eventMeta.graceEndsAt, null);
  assert.equal(audits.length, 1);
  const auditMeta = audits[0]?.metadata as Record<string, unknown>;
  assert.equal(auditMeta.persistedSubscriptionStatus, "CANCELLED");
  assert.equal(auditMeta.ignoredReason, "CONCURRENT_SUBSCRIPTION_CHANGE");
});
// C. APPROVED vs suspension concurrente: efecto economico se conserva, acceso queda SUSPENDED.
test("51. Carrera APPROVED vs suspension concurrente: efecto economico preservado, acceso SUSPENDED", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      pendingUnitsSnapshot: 77,
      pendingPriceCents: 300000,
      pendingCurrency: "COP",
      pendingPriceEffectiveAt: subscription.currentPeriodEnd,
    },
  });
  const id = `${RUN}-pay-race-appr-${++counter}`;

  // La suspension ocurre despues del snapshot economico y antes de sus CAS. El CAS
  // economico ignora status; la relectura de acceso observa y preserva SUSPENDED.
  setConcurrentHook("AFTER_APPROVED_ECONOMIC_SNAPSHOT", async () => {
    await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
  });
  try {
    await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const audit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
    orderBy: { createdAt: "desc" },
  });
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.approvedEffectAppliedAt !== null, "marcador aplicado");
  assert.ok(pay.paidAt !== null);
  assertThirtyDayPeriod(pay.periodStart, pay.periodEnd);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assert.equal(sub.unitsSnapshot, 77, "terminos pendientes aplicados pese a la suspension");
  assert.equal(sub.priceCents, 300000);
  assert.equal(sub.pendingUnitsSnapshot, null);
  assert.equal(sub.pendingPriceCents, null);
  assert.equal(sub.pendingCurrency, null);
  assert.equal(sub.pendingPriceEffectiveAt, null);
  assert.equal(sub.status, "SUSPENDED", "el acceso no se reactiva");
  assert.equal(ten.status, "SUSPENDED");
  const processed = events.find((event) => event.result === "PROCESSED");
  assert.ok(processed);
  const eventMeta = processed.metadata as Record<string, unknown>;
  assert.equal(eventMeta.persistedSubscriptionStatus, "SUSPENDED");
  assert.equal(eventMeta.currentPeriodStart, sub.currentPeriodStart.toISOString());
  assert.equal(eventMeta.currentPeriodEnd, sub.currentPeriodEnd.toISOString());
  assert.equal(eventMeta.ignoredAccessReason, "CONCURRENT_SUBSCRIPTION_CHANGE");
  const auditMeta = (audit?.metadata ?? {}) as Record<string, unknown>;
  assert.equal(auditMeta.paymentEffectApplied, true);
  assert.equal(auditMeta.accessStatePreserved, true);
  assert.equal(auditMeta.concurrentAccessChange, true);
  assert.equal(auditMeta.persistedSubscriptionStatus, "SUSPENDED");
  assert.equal(auditMeta.ignoredAccessReason, "CONCURRENT_SUBSCRIPTION_CHANGE");

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const payAfter = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const subAfter = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const eventsAfter = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(payAfter.periodEnd.getTime(), pay.periodEnd.getTime(), "el replay no vuelve a extender Payment");
  assert.equal(subAfter.currentPeriodEnd.getTime(), sub.currentPeriodEnd.getTime(), "el replay no vuelve a extender Subscription");
  assert.equal(subAfter.unitsSnapshot, 77, "los terminos no se aplican por segunda vez");
  assert.equal(subAfter.pendingUnitsSnapshot, null);
  assert.equal(subAfter.status, "SUSPENDED");
  assert.ok(eventsAfter.some((event) => event.result === "DUPLICATE"));
});
// D. Payment cruzado (tenant objetivo + subscription ajena) no cuenta como evidencia.
test("52. Payment cruzado tenant+subscription no cuenta para reactivacion", async () => {
  const actorId = await createSuperAdminActor();
  const target = await createTenantWithSubscription(new Date());
  const other = await createTenantWithSubscription(new Date());
  // Payment con el tenant OBJETIVO pero la subscription de OTRO conjunto.
  await createDirectPayment(target.tenant.id, other.subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });
  await prisma.subscription.update({ where: { id: target.subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: target.tenant.id }, data: { status: "SUSPENDED" } });

  // La evidencia cruzada no cubre la subscription objetivo: la reactivacion se rechaza.
  await assert.rejects(() => updateTenantStatusForSuperAdmin(actorId, target.tenant.id, "ACTIVE"), /no tiene evidencia/i);
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: target.tenant.id } });
  assert.equal(ten.status, "SUSPENDED", "no reactiva por evidencia cruzada");
});

// E. Fallo de auditoria dentro de la reactivacion: rollback total, reintento limpio.
test("53. Fallo de AuditLog en reactivacion revierte todo; el reintento funciona", async () => {
  const actorId = await createSuperAdminActor();
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  setConcurrentHook("BEFORE_REACTIVATION_AUDIT_LOG", async () => {
    throw new Error("inyeccion de fallo antes de auditar la reactivacion");
  });
  try {
    await assert.rejects(() => updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE"));
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const subAfterFail = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const tenAfterFail = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const auditsAfterFail = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "TENANT_REACTIVATED" } });
  assert.equal(subAfterFail.status, "SUSPENDED", "Subscription revertida");
  assert.equal(tenAfterFail.status, "SUSPENDED", "Tenant revertido");
  assert.equal(auditsAfterFail, 0, "no queda auditoria parcial");

  // Reintento sin fallo: reactiva y crea exactamente una auditoria.
  const reactivated = await updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE");
  const audits = await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "TENANT_REACTIVATED" } });
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(audits, 1, "exactamente una auditoria exitosa");
});

// F. Evidencia que cambia durante la reactivacion serializable: conflicto controlado.
test("54. Reactivacion serializable aborta ante evidencia concurrente y el reintento rechaza", async () => {
  const actorId = await createSuperAdminActor();
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "SUSPENDED" } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

  // Tras leer la evidencia, otra transaccion la invalida (cuarentena) y modifica la
  // propia Subscription que la reactivacion va a escribir -> conflicto de serializacion.
  setConcurrentHook("AFTER_REACTIVATION_EVIDENCE_READ", async () => {
    await prisma.payment.updateMany({
      where: { tenantId: tenant.id, subscriptionId: subscription.id },
      data: { approvedEffectReconciliationRequired: true },
    });
    await prisma.subscription.update({ where: { id: subscription.id }, data: { lastWebhookAt: new Date() } });
  });
  try {
    await assert.rejects(
      () => updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE"),
      (err: unknown) =>
        err instanceof SerializationConflictError || /cambio durante la operacion/i.test(String((err as Error)?.message))
    );
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const auditsAfterConflict = await prisma.auditLog.count({
    where: { tenantId: tenant.id, action: "TENANT_REACTIVATED" },
  });
  assert.equal(ten.status, "SUSPENDED", "no reactiva Tenant ante el conflicto");
  assert.equal(sub.status, "SUSPENDED", "no reactiva Subscription ante el conflicto");
  assert.equal(auditsAfterConflict, 0, "la transaccion abortada no deja AuditLog parcial");

  // El reintento evalua el estado NUEVO (pago en cuarentena) y rechaza por falta de evidencia.
  await assert.rejects(() => updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE"), /no tiene evidencia/i);
});

// G. Unknown con string mayor al limite: rawStatus y metadata truncados; IGNORED sin 500.
test("55. Unknown con string enorme se trunca y queda IGNORED (sin 500)", async () => {
  const { subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-unknown-long-${++counter}`;
  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const huge = "Z".repeat(10000);
  await sendPaymentWebhook(rawPaymentFixture(subscription.id, huge, id));

  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored, "queda IGNORED, no FAILED/500");
  assert.ok(!events.some((e) => e.result === "FAILED"));
  assert.ok((pay.rawStatus?.length ?? 0) <= 255, "rawStatus truncado al maximo");
  const providerStatus = (ignored?.metadata as Record<string, unknown>)?.providerStatus as string;
  assert.ok(providerStatus.length <= 255, "providerStatus en metadata truncado");

  // Preapproval unknown enorme tambien queda IGNORED sin romper.
  const preId = `${RUN}-pre-unknown-long-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { mercadoPagoPreapprovalId: preId } });
  await sendPreapprovalWebhook(preId, huge, subscription.id);
  const preEvents = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  const preIgnored = preEvents.find((e) => e.result === "IGNORED");
  assert.ok(preIgnored, "preapproval unknown largo queda IGNORED");
  assert.ok(((preIgnored?.metadata as Record<string, unknown>)?.providerStatus as string).length <= 255);
});

// H. Metadata completa de preapproval unknown (nulls explicitos y paymentExists real).
test("56. Preapproval unknown registra metadata completa y acotada", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
  const preId = `${RUN}-pre-unknown-meta-${++counter}`;
  await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE", mercadoPagoPreapprovalId: preId } });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
  // Existe un Payment de cobertura para verificar paymentExists=true.
  await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });

  await sendPreapprovalWebhook(preId, "quien_sabe", subscription.id);

  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  const ignored = events.find((e) => e.result === "IGNORED");
  assert.ok(ignored);
  const meta = ignored?.metadata as Record<string, unknown>;
  assert.equal(meta.ignoredReason, "UNKNOWN_PROVIDER_STATUS");
  assert.equal(meta.providerStatus, "quien_sabe");
  assert.equal(meta.previousPaymentStatus, null);
  assert.equal(meta.incomingPaymentStatus, "UNKNOWN");
  assert.equal(meta.persistedPaymentStatus, null);
  assert.equal(meta.previousSubscriptionStatus, "ACTIVE");
  assert.equal(meta.persistedSubscriptionStatus, "ACTIVE");
  assert.equal(meta.paymentExists, true);
  assert.equal(meta.subscriptionId, subscription.id);
  assert.equal(meta.tenantId, tenant.id);
  assert.equal(typeof meta.accessCovered, "boolean");
  assert.equal(typeof meta.realPaymentCovered, "boolean");
  assert.equal(typeof meta.appliedAccessEvidence, "boolean");
});

// I. Dos conflictos economicos agotan el reintento sin dejar marcador ni periodos parciales.
test("57. Conflicto economico revierte por completo y un webhook posterior aplica una vez", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const id = `${RUN}-pay-economic-conflict-${++counter}`;
  const existing = await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "PENDING",
    periodEnd: subscription.currentPeriodEnd,
    externalId: id,
  });
  let conflicts = 0;
  __unsafeSetBillingTestHooks({
    onStep: async (step) => {
      if (step !== "AFTER_APPROVED_ECONOMIC_SNAPSHOT" || conflicts >= 2) return;
      conflicts += 1;
      const live = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { currentPeriodEnd: addDays(live.currentPeriodEnd, 1) },
      });
    },
  });
  try {
    await assert.rejects(
      () => sendPaymentWebhook(paymentFixture(subscription.id, "approved", id)),
      /cambio economicamente/i
    );
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  assert.equal(conflicts, 2, "solo se ejecutan el intento inicial y un reintento");
  const payAfterConflict = await prisma.payment.findUniqueOrThrow({ where: { id: existing.id } });
  const failedEvents = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  const failedAudits = await prisma.auditLog.count({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
  });
  assert.equal(payAfterConflict.status, "PENDING", "el upsert APPROVED se revierte");
  assert.equal(payAfterConflict.approvedEffectAppliedAt, null, "el marcador sigue disponible");
  assert.equal(payAfterConflict.periodStart.getTime(), existing.periodStart.getTime());
  assert.equal(payAfterConflict.periodEnd.getTime(), existing.periodEnd.getTime(), "Payment no queda parcial");
  assert.ok(failedEvents.some((event) => event.result === "FAILED"));
  assert.equal(failedAudits, 0, "los intentos abortados no dejan auditoria");

  await sendPaymentWebhook(paymentFixture(subscription.id, "approved", id));
  const pay = await prisma.payment.findUniqueOrThrow({ where: { id: existing.id } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: id } });
  assert.equal(pay.status, "APPROVED");
  assert.ok(pay.approvedEffectAppliedAt !== null);
  assertPaymentMatchesSubscriptionPeriod(pay, sub);
  assert.equal(sub.status, "ACTIVE");
  assert.equal(ten.status, "ACTIVE");
  assert.equal(events.filter((event) => event.result === "PROCESSED").length, 1);
});

// J. La evidencia real entra en cuarentena durante preapproval; Serializable reevalua.
test("58. Preapproval authorized reevalua una cobertura puesta en cuarentena concurrentemente", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-quarantine-race-${++counter}`;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "PENDING_PAYMENT",
      trialEndsAt: new Date(Date.now() - 1000),
      mercadoPagoPreapprovalId: preId,
    },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });
  const evidence = await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });

  setConcurrentHook("AFTER_PREAPPROVAL_COVERAGE_READ", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: evidence.id },
        data: { approvedEffectReconciliationRequired: true },
      });
      await tx.subscription.update({ where: { id: subscription.id }, data: { lastWebhookAt: new Date() } });
    });
  });
  try {
    await sendPreapprovalWebhook(preId, "authorized", subscription.id);
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const events = await prisma.webhookEvent.findMany({ where: { dataId: preId } });
  const audits = await prisma.auditLog.findMany({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
  });
  assert.equal(sub.status, "PENDING_PAYMENT", "no activa con el Payment en cuarentena");
  assert.equal(ten.status, "PENDING_PAYMENT", "Tenant y Subscription permanecen coherentes");
  const processed = events.find((event) => event.result === "PROCESSED");
  assert.ok(processed);
  const metadata = processed.metadata as Record<string, unknown>;
  assert.equal(metadata.realPaymentCovered, false);
  assert.equal(metadata.persistedSubscriptionStatus, "PENDING_PAYMENT");
  assert.equal(metadata.serializationRetried, true);
  assert.equal(audits.length, 1, "la transaccion abortada no deja una auditoria parcial");
});

// K. La vigencia del Payment cambia concurrentemente; la decision final no activa.
test("59. Preapproval authorized reevalua un Payment vencido concurrentemente", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  const preId = `${RUN}-pre-expiry-race-${++counter}`;
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: "PENDING_PAYMENT",
      trialEndsAt: new Date(Date.now() - 1000),
      mercadoPagoPreapprovalId: preId,
    },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });
  const evidence = await createDirectPayment(tenant.id, subscription.id, {
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: addDays(new Date(), BILLING_PERIOD_DAYS),
    approvedEffectAppliedAt: new Date(),
  });

  setConcurrentHook("AFTER_PREAPPROVAL_COVERAGE_READ", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: evidence.id }, data: { periodEnd: addDays(new Date(), -1) } });
      await tx.subscription.update({ where: { id: subscription.id }, data: { lastWebhookAt: new Date() } });
    });
  });
  try {
    await sendPreapprovalWebhook(preId, "authorized", subscription.id);
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const event = await prisma.webhookEvent.findFirstOrThrow({ where: { dataId: preId } });
  const metadata = event.metadata as Record<string, unknown>;
  assert.equal(sub.status, "PENDING_PAYMENT");
  assert.equal(ten.status, "PENDING_PAYMENT");
  assert.equal(metadata.realPaymentCovered, false);
  assert.equal(metadata.persistedSubscriptionStatus, "PENDING_PAYMENT");
  assert.equal(metadata.serializationRetried, true);
});

// L. Un no-aprobado no entra en Grace si aparece cobertura concurrente.
test("60. REJECTED reevalua cobertura concurrente y preserva acceso sin crear Grace", async () => {
  const { tenant, subscription } = await createTenantWithSubscription(new Date());
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: "PENDING_PAYMENT", trialEndsAt: new Date(Date.now() - 1000) },
  });
  await prisma.tenant.update({ where: { id: tenant.id }, data: { status: "PENDING_PAYMENT" } });
  const id = `${RUN}-pay-rejected-coverage-race-${++counter}`;
  const coveredUntil = addDays(new Date(), BILLING_PERIOD_DAYS);

  setConcurrentHook("AFTER_NON_APPROVED_COVERAGE_READ", async () => {
    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.payment.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          amountCents: 0,
          currency: "COP",
          status: "APPROVED",
          provider: "SIMULATED",
          dueDate: now,
          paidAt: now,
          periodStart: now,
          periodEnd: coveredUntil,
          externalReference: `${RUN}-sim-race-${++counter}`,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: coveredUntil },
      });
      await tx.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });
    });
  });
  try {
    await sendPaymentWebhook(paymentFixture(subscription.id, "rejected", id));
  } finally {
    __unsafeSetBillingTestHooks({});
  }

  const pay = await prisma.payment.findUniqueOrThrow({ where: { mercadoPagoPaymentId: id } });
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  const event = await prisma.webhookEvent.findFirstOrThrow({ where: { dataId: id } });
  const audits = await prisma.auditLog.findMany({
    where: { tenantId: tenant.id, action: "MERCADO_PAGO_WEBHOOK_PROCESSED", targetId: subscription.id },
  });
  const metadata = event.metadata as Record<string, unknown>;
  assert.equal(pay.status, "REJECTED");
  assert.equal(sub.status, "ACTIVE");
  assert.equal(sub.graceEndsAt, null, "no crea Grace sobre la cobertura concurrente");
  assert.equal(ten.status, "ACTIVE");
  assert.equal(event.result, "IGNORED");
  assert.equal(metadata.ignoredReason, "CONCURRENT_SUBSCRIPTION_CHANGE");
  assert.equal(metadata.persistedSubscriptionStatus, "ACTIVE");
  assert.equal(metadata.appliedAccessEvidence, true);
  assert.equal(metadata.serializationRetried, true);
  assert.equal(audits.length, 1);
});

// M. El status externo de la creacion de checkout siempre usa la etiqueta segura.
test("61. Creacion de preapproval acota status largo y normaliza tipos no-string", async () => {
  const previousNextAuthUrl = process.env.NEXTAUTH_URL;
  process.env.NEXTAUTH_URL = "https://app.example.test";
  const cases: Array<{ status: unknown; expected: string | null }> = [
    { status: "S".repeat(10000), expected: "S".repeat(255) },
    { status: { nested: "secret-value" }, expected: "object" },
    { status: ["secret-value"], expected: "array" },
    { status: null, expected: null },
  ];

  try {
    for (let index = 0; index < cases.length; index += 1) {
      const testCase = cases[index];
      assert.ok(testCase);
      const { tenant, subscription } = await createTenantWithSubscription(addDays(new Date(), BILLING_PERIOD_DAYS));
      const admin = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `${RUN}-checkout-${index}-${++counter}@example.test`,
          password: "x",
          name: "QA Admin Checkout",
          role: "ADMIN",
          memberships: {
            create: { tenantId: tenant.id, role: "ADMIN", isActive: true },
          },
        },
      });
      const preId = `${RUN}-checkout-pre-${index}-${++counter}`;
      mockFetch({
        id: preId,
        init_point: `https://sandbox.mercadopago.test/${preId}`,
        status: testCase.status,
      });

      const updated = await createMercadoPagoSubscriptionForTenant({
        actorUserId: admin.id,
        tenantId: tenant.id,
        backUrl: "https://app.example.test/admin/licencias",
      });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          tenantId: tenant.id,
          action: "MERCADO_PAGO_SUBSCRIPTION_CREATED",
          targetId: subscription.id,
        },
        orderBy: { createdAt: "desc" },
      });
      const metadata = audit.metadata as Record<string, unknown>;
      assert.equal(updated.mercadoPagoStatus, testCase.expected);
      assert.equal((updated.mercadoPagoStatus?.length ?? 0) <= 255, true);
      assert.equal(metadata.mercadoPagoStatus, testCase.expected);
      assert.ok(
        metadata.mercadoPagoStatus === null || typeof metadata.mercadoPagoStatus === "string",
        "solo persiste una etiqueta string o null"
      );
      assert.equal(JSON.stringify(metadata).includes("secret-value"), false, "no guarda el payload completo");
    }
  } finally {
    if (previousNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = previousNextAuthUrl;
  }
});