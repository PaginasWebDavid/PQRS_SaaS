// Pruebas PURAS de la fuente unica de periodo y de las utilidades del ledger.
// No importan Prisma ni abren conexiones.

import test from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_PERIOD_DAYS,
  computeNextPeriod,
  resolveEffectiveTerms,
} from "../../src/domains/billing/period";
import {
  buildPaymentEffectKey,
  PAYMENT_EFFECT_TYPE,
  sanitizeWebhookMetadata,
} from "../../src/domains/billing/webhook-metadata";

// 1. Periodo con fecha vencida: arranca en `now`.
test("computeNextPeriod: periodo vencido arranca en now", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  const currentPeriodEnd = new Date("2026-01-10T00:00:00.000Z"); // ya vencido
  const result = computeNextPeriod({ currentPeriodEnd, now, periodDays: BILLING_PERIOD_DAYS });
  assert.equal(result.periodStart.toISOString(), now.toISOString());
  assert.equal(result.periodEnd.toISOString(), new Date("2026-03-03T00:00:00.000Z").toISOString());
  assert.equal(result.effectiveTerms, null);
  assert.equal(result.clearPending, false);
});

// 2. Periodo vigente: arranca donde termina el actual (no se pierden dias).
test("computeNextPeriod: periodo vigente encadena desde currentPeriodEnd", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const currentPeriodEnd = new Date("2026-01-10T00:00:00.000Z"); // aun vigente
  const result = computeNextPeriod({ currentPeriodEnd, now, periodDays: BILLING_PERIOD_DAYS });
  assert.equal(result.periodStart.toISOString(), currentPeriodEnd.toISOString());
  assert.equal(result.periodEnd.toISOString(), new Date("2026-02-09T00:00:00.000Z").toISOString());
});

// 3. Aplicacion de terminos pendientes.
test("computeNextPeriod: aplica terminos pendientes cuando existen", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  const result = computeNextPeriod({
    currentPeriodEnd: new Date("2026-01-10T00:00:00.000Z"),
    now,
    periodDays: BILLING_PERIOD_DAYS,
    pending: {
      pendingUnitsSnapshot: 80,
      pendingPriceCents: 250000,
      pendingCurrency: "COP",
      fallbackCurrency: "COP",
    },
  });
  assert.deepEqual(result.effectiveTerms, { unitsSnapshot: 80, priceCents: 250000, currency: "COP" });
  assert.equal(result.clearPending, true);
});

// 4. Limpieza de campos pendientes: sin pending -> no hay terminos ni limpieza.
test("computeNextPeriod: sin pending no hay terminos efectivos ni limpieza", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");
  const result = computeNextPeriod({
    currentPeriodEnd: new Date("2026-01-10T00:00:00.000Z"),
    now,
    periodDays: BILLING_PERIOD_DAYS,
    pending: { pendingUnitsSnapshot: null, pendingPriceCents: null, pendingCurrency: null, fallbackCurrency: "COP" },
  });
  assert.equal(result.effectiveTerms, null);
  assert.equal(result.clearPending, false);
});

test("resolveEffectiveTerms: usa fallbackCurrency cuando no hay pendingCurrency", () => {
  const terms = resolveEffectiveTerms({
    pendingUnitsSnapshot: 30,
    pendingPriceCents: 90000,
    pendingCurrency: null,
    fallbackCurrency: "COP",
  });
  assert.deepEqual(terms, { unitsSnapshot: 30, priceCents: 90000, currency: "COP" });
});

// 5. Construccion segura de metadata: conserva primitivos, descarta objetos.
test("sanitizeWebhookMetadata: conserva primitivos y descarta objetos anidados", () => {
  const clean = sanitizeWebhookMetadata({
    topic: "payment",
    dataId: "123",
    amount: 250000,
    approved: true,
    nested: { foo: "bar" },
    missing: undefined,
    empty: null,
  });
  assert.deepEqual(clean, { topic: "payment", dataId: "123", amount: 250000, approved: true, empty: null });
});

// 6. Clave del efecto economico.
test("buildPaymentEffectKey: formato provider:paymentId:tipo", () => {
  assert.equal(buildPaymentEffectKey("WOMPI", "999"), `WOMPI:999:${PAYMENT_EFFECT_TYPE}`);
});

// 7. No exposicion de secretos.
test("sanitizeWebhookMetadata: nunca filtra secretos ni firmas", () => {
  const clean = sanitizeWebhookMetadata({
    topic: "payment",
    authorization: "Bearer APP_USR-super-secreto",
    "x-signature": "ts=1,v1=abcdef",
    accessToken: "APP_USR-token",
    webhookSecret: "shhh",
    card_number: "4111111111111111",
    cvv: "123",
    password: "hunter2",
  });
  assert.deepEqual(clean, { topic: "payment" });
  const serialized = JSON.stringify(clean);
  assert.doesNotMatch(serialized, /APP_USR/);
  assert.doesNotMatch(serialized, /4111111111111111/);
  assert.doesNotMatch(serialized, /hunter2/);
  assert.doesNotMatch(serialized, /abcdef/);
});
