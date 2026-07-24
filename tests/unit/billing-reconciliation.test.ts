// Pruebas PURAS de la cuarentena historica, clasificacion del efecto, enmascarado
// y validacion del CLI. No importan Prisma ni abren conexiones.

import test from "node:test";
import assert from "node:assert/strict";
import {
  auditMetadataMatchesPayment,
  buildReconciliationAuditMetadata,
  canClaimApprovedEffect,
  isHistoricalQuarantined,
  maskExternalId,
  parseReconcileArgs,
  summarizeAuditEvidence,
  validateProductionConfirmation,
  type AuditEvidenceRow,
} from "../../src/domains/billing/reconciliation";

// --- Clasificacion historico/nuevo y condiciones de reclamo ------------------

test("canClaimApprovedEffect: pago nuevo APPROVED sin efecto ni cuarentena => reclama", () => {
  assert.equal(
    canClaimApprovedEffect({ status: "APPROVED", approvedEffectAppliedAt: null, approvedEffectReconciliationRequired: false }),
    true
  );
});

test("canClaimApprovedEffect: pago en cuarentena NUNCA reclama", () => {
  assert.equal(
    canClaimApprovedEffect({ status: "APPROVED", approvedEffectAppliedAt: null, approvedEffectReconciliationRequired: true }),
    false
  );
  assert.equal(
    isHistoricalQuarantined({ status: "APPROVED", approvedEffectAppliedAt: null, approvedEffectReconciliationRequired: true }),
    true
  );
});

test("canClaimApprovedEffect: efecto ya aplicado no vuelve a reclamar", () => {
  assert.equal(
    canClaimApprovedEffect({ status: "APPROVED", approvedEffectAppliedAt: new Date(), approvedEffectReconciliationRequired: false }),
    false
  );
});

test("canClaimApprovedEffect: estado no APPROVED no reclama", () => {
  assert.equal(
    canClaimApprovedEffect({ status: "PENDING", approvedEffectAppliedAt: null, approvedEffectReconciliationRequired: false }),
    false
  );
});

// --- Enmascarado del ID externo ----------------------------------------------

test("maskExternalId: enmascara el medio de un id largo", () => {
  assert.equal(maskExternalId("1234567890abcdef"), "1234...cdef");
});

test("maskExternalId: ids cortos se ocultan por completo", () => {
  assert.equal(maskExternalId("1234"), "****");
  assert.equal(maskExternalId(""), "(vacio)");
});

// --- Metadata de reconciliacion (segura) -------------------------------------

test("buildReconciliationAuditMetadata: no incluye importes ni el id externo completo", () => {
  const meta = buildReconciliationAuditMetadata({
    paymentId: "pay_1",
    externalId: "1234567890abcdef",
    reason: "  pago verificado con soporte  ",
    appliedAt: new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(meta.paymentId, "pay_1");
  assert.equal(meta.externalId, "1234...cdef");
  assert.equal(meta.reason, "pago verificado con soporte");
  assert.equal(meta.appliedAt, "2026-01-01T00:00:00.000Z");
  assert.doesNotMatch(JSON.stringify(meta), /1234567890abcdef/);
});

// --- Validacion del CLI (sin conexion) ---------------------------------------

test("parseReconcileArgs: sin args => list (solo lectura)", () => {
  assert.deepEqual(parseReconcileArgs([]), { command: "list" });
});

test("parseReconcileArgs: mark-applied exige --payment-id", () => {
  const result = parseReconcileArgs(["mark-applied", "--reason", "x"]);
  assert.equal(result.command, "error");
});

test("parseReconcileArgs: mark-applied exige --reason no vacio", () => {
  const result = parseReconcileArgs(["mark-applied", "--payment-id", "pay_1"]);
  assert.equal(result.command, "error");
});

test("parseReconcileArgs: mark-applied valido devuelve payload", () => {
  const result = parseReconcileArgs(["mark-applied", "--payment-id", "pay_1", "--reason", "verificado"]);
  assert.deepEqual(result, {
    command: "mark-applied",
    paymentId: "pay_1",
    reason: "verificado",
    confirmProduction: false,
    confirmPaymentId: null,
  });
});

test("parseReconcileArgs: --confirm-production se refleja", () => {
  const result = parseReconcileArgs(["mark-applied", "--payment-id", "pay_1", "--reason", "verificado", "--confirm-production"]);
  assert.equal(result.command === "mark-applied" && result.confirmProduction, true);
});

test("parseReconcileArgs: comando desconocido => error", () => {
  assert.equal(parseReconcileArgs(["borrar-todo"]).command, "error");
});

test("parseReconcileArgs: incluye confirmPaymentId y confirmProduction", () => {
  const result = parseReconcileArgs([
    "mark-applied",
    "--payment-id",
    "pay_1",
    "--reason",
    "verificado",
    "--confirm-production",
    "--confirm-payment-id",
    "pay_1",
  ]);
  assert.deepEqual(result, {
    command: "mark-applied",
    paymentId: "pay_1",
    reason: "verificado",
    confirmProduction: true,
    confirmPaymentId: "pay_1",
  });
});

test("parseReconcileArgs: wildcard y multiples --payment-id se rechazan", () => {
  assert.equal(parseReconcileArgs(["mark-applied", "--payment-id", "*", "--reason", "x"]).command, "error");
  assert.equal(
    parseReconcileArgs(["mark-applied", "--payment-id", "a", "--payment-id", "b", "--reason", "x"]).command,
    "error"
  );
});

// --- Doble confirmacion en produccion ----------------------------------------

test("validateProductionConfirmation: en base de test no exige repetir el ID", () => {
  assert.deepEqual(
    validateProductionConfirmation({ isTestTarget: true, paymentId: "pay_1", confirmProduction: false, confirmPaymentId: null }),
    { ok: true }
  );
});

test("validateProductionConfirmation: produccion exige --confirm-production", () => {
  const r = validateProductionConfirmation({ isTestTarget: false, paymentId: "pay_1", confirmProduction: false, confirmPaymentId: "pay_1" });
  assert.equal(r.ok, false);
});

test("validateProductionConfirmation: produccion exige --confirm-payment-id", () => {
  const r = validateProductionConfirmation({ isTestTarget: false, paymentId: "pay_1", confirmProduction: true, confirmPaymentId: null });
  assert.equal(r.ok, false);
});

test("validateProductionConfirmation: rechaza ID repetido que no coincide", () => {
  const r = validateProductionConfirmation({ isTestTarget: false, paymentId: "pay_1", confirmProduction: true, confirmPaymentId: "pay_2" });
  assert.equal(r.ok, false);
});

test("validateProductionConfirmation: acepta produccion con doble confirmacion coincidente", () => {
  const r = validateProductionConfirmation({ isTestTarget: false, paymentId: "pay_1", confirmProduction: true, confirmPaymentId: "pay_1" });
  assert.deepEqual(r, { ok: true });
});

// --- Evidencia de auditoria por subscriptionId + externalId ------------------

function auditRow(externalId: string | null, createdAt = new Date(), provider = "MERCADO_PAGO"): AuditEvidenceRow {
  return {
    action: "MERCADO_PAGO_WEBHOOK_PROCESSED",
    createdAt,
    metadata: externalId === null ? null : { provider, externalId, topic: "payment" },
  };
}

test("auditMetadataMatchesPayment: cuenta el mismo payment ID", () => {
  assert.equal(auditMetadataMatchesPayment({ provider: "MERCADO_PAGO", externalId: "999" }, "999"), true);
});

test("auditMetadataMatchesPayment: NO cuenta otro payment ID de la misma suscripcion", () => {
  assert.equal(auditMetadataMatchesPayment({ provider: "MERCADO_PAGO", externalId: "111" }, "999"), false);
});

test("auditMetadataMatchesPayment: metadata nula o malformada no cuenta y no lanza", () => {
  assert.equal(auditMetadataMatchesPayment(null, "999"), false);
  assert.equal(auditMetadataMatchesPayment("texto", "999"), false);
  assert.equal(auditMetadataMatchesPayment(["array"], "999"), false);
  assert.equal(auditMetadataMatchesPayment({ provider: "MERCADO_PAGO" }, "999"), false);
});

test("summarizeAuditEvidence: cuenta solo las auditorias del pago exacto", () => {
  const rows: AuditEvidenceRow[] = [
    auditRow("999", new Date("2026-01-01T00:00:00.000Z")),
    auditRow("999", new Date("2026-01-03T00:00:00.000Z")),
    auditRow("111", new Date("2026-01-05T00:00:00.000Z")), // otro pago
    auditRow(null), // metadata nula
  ];
  const summary = summarizeAuditEvidence(rows, "999");
  assert.equal(summary.count, 2);
  assert.deepEqual(summary.actions, ["MERCADO_PAGO_WEBHOOK_PROCESSED"]);
  assert.equal(summary.latestAt, "2026-01-03T00:00:00.000Z");
});

test("summarizeAuditEvidence: no filtra IDs externos completos ni secretos en la salida", () => {
  const rows: AuditEvidenceRow[] = [
    { action: "MERCADO_PAGO_WEBHOOK_PROCESSED", createdAt: new Date(), metadata: { provider: "MERCADO_PAGO", externalId: "sensitive-999", authorization: "Bearer APP_USR-x" } },
  ];
  const summary = summarizeAuditEvidence(rows, "sensitive-999");
  const serialized = JSON.stringify(summary);
  assert.doesNotMatch(serialized, /APP_USR/);
  assert.doesNotMatch(serialized, /sensitive-999/);
  assert.equal(summary.count, 1);
});
