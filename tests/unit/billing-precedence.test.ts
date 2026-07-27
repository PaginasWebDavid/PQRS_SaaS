// Pruebas PURAS de precedencia de estados y cobertura de facturacion.
// No importan Prisma ni abren conexiones. Cubren: normalizacion de estados
// (conocido/desconocido), precedencia de fila de Payment, decision de Subscription
// para eventos no aprobados, las tres definiciones separadas de cobertura y la
// decision de preapproval.

import test from "node:test";
import assert from "node:assert/strict";
import {
  decidePaymentRowTransition,
  decidePreapprovalOutcome,
  decideSubscriptionActionForNonApproved,
  hasCurrentAccessCoverage,
  hasCurrentAppliedAccessEvidence,
  hasCurrentRealPaymentCoverage,
  MAX_PROVIDER_STATUS_LENGTH,
  normalizePreapprovalStatus,
  normalizeProviderPaymentStatus,
  PRECEDENCE_REASON,
  providerStatusLabel,
  truncateProviderStatus,
  type PaymentCoverageRow,
} from "../../src/domains/billing/precedence";

const NOW = new Date("2026-07-26T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 60 * 60 * 1000);

// Identidad esperada por defecto para las coberturas (F2F-02).
const ID = { tenantId: "t1", subscriptionId: "s1" };

function row(overrides: Partial<PaymentCoverageRow>): PaymentCoverageRow {
  return {
    tenantId: "t1",
    subscriptionId: "s1",
    provider: "MERCADO_PAGO",
    status: "APPROVED",
    periodEnd: FUTURE,
    approvedEffectAppliedAt: NOW,
    approvedEffectReconciliationRequired: false,
    ...overrides,
  };
}

// --- Normalizacion de estados de Payment del proveedor (6) -------------------

test("normalize: approved y authorized => APPROVED conocido", () => {
  assert.deepEqual(normalizeProviderPaymentStatus("approved"), { known: true, status: "APPROVED" });
  assert.deepEqual(normalizeProviderPaymentStatus("authorized"), { known: true, status: "APPROVED" });
});

test("normalize: rejected => REJECTED conocido", () => {
  assert.deepEqual(normalizeProviderPaymentStatus("rejected"), { known: true, status: "REJECTED" });
});

test("normalize: cancelled/canceled => REJECTED conocido", () => {
  assert.deepEqual(normalizeProviderPaymentStatus("cancelled"), { known: true, status: "REJECTED" });
  assert.deepEqual(normalizeProviderPaymentStatus("canceled"), { known: true, status: "REJECTED" });
});

test("normalize: pending/in_process/in_mediation => PENDING conocido", () => {
  assert.deepEqual(normalizeProviderPaymentStatus("pending"), { known: true, status: "PENDING" });
  assert.deepEqual(normalizeProviderPaymentStatus("in_process"), { known: true, status: "PENDING" });
  assert.deepEqual(normalizeProviderPaymentStatus("in_mediation"), { known: true, status: "PENDING" });
});

test("normalize: valor no reconocido NO se degrada a PENDING => desconocido", () => {
  assert.deepEqual(normalizeProviderPaymentStatus("refunded"), { known: false, rawStatus: "refunded" });
  assert.deepEqual(normalizeProviderPaymentStatus("charged_back"), { known: false, rawStatus: "charged_back" });
});

test("normalize: vacio/undefined => desconocido", () => {
  assert.deepEqual(normalizeProviderPaymentStatus(""), { known: false, rawStatus: "" });
  assert.deepEqual(normalizeProviderPaymentStatus(undefined), { known: false, rawStatus: "" });
  assert.deepEqual(normalizeProviderPaymentStatus(null), { known: false, rawStatus: "" });
});

// --- Precedencia de fila de Payment (8) --------------------------------------

test("precedencia: fila nueva aplica el estado entrante", () => {
  const d = decidePaymentRowTransition({ incoming: "PENDING", current: null });
  assert.equal(d.paymentStatusAction, "APPLY");
  assert.equal(d.nextPaymentStatus, "PENDING");
});

test("precedencia: APPROVED con efecto aplicado + PENDING entrante => PRESERVE (terminal)", () => {
  const d = decidePaymentRowTransition({ incoming: "PENDING", current: { status: "APPROVED", approvedEffectAppliedAt: NOW } });
  assert.equal(d.paymentStatusAction, "PRESERVE");
  assert.equal(d.nextPaymentStatus, "APPROVED");
  assert.equal(d.reason, PRECEDENCE_REASON.APPROVED_IS_TERMINAL);
});

test("precedencia: APPROVED + REJECTED entrante => PRESERVE (no retrocede)", () => {
  const d = decidePaymentRowTransition({ incoming: "REJECTED", current: { status: "APPROVED", approvedEffectAppliedAt: null } });
  assert.equal(d.paymentStatusAction, "PRESERVE");
  assert.equal(d.nextPaymentStatus, "APPROVED");
});

test("precedencia: PENDING + APPROVED entrante => APPLY APPROVED", () => {
  const d = decidePaymentRowTransition({ incoming: "APPROVED", current: { status: "PENDING", approvedEffectAppliedAt: null } });
  assert.equal(d.paymentStatusAction, "APPLY");
  assert.equal(d.nextPaymentStatus, "APPROVED");
});

test("precedencia: REJECTED + APPROVED entrante => APPLY APPROVED", () => {
  const d = decidePaymentRowTransition({ incoming: "APPROVED", current: { status: "REJECTED", approvedEffectAppliedAt: null } });
  assert.equal(d.paymentStatusAction, "APPLY");
  assert.equal(d.nextPaymentStatus, "APPROVED");
});

test("precedencia: REJECTED + PENDING entrante => PRESERVE (no baja a PENDING)", () => {
  const d = decidePaymentRowTransition({ incoming: "PENDING", current: { status: "REJECTED", approvedEffectAppliedAt: null } });
  assert.equal(d.paymentStatusAction, "PRESERVE");
  assert.equal(d.nextPaymentStatus, "REJECTED");
  assert.equal(d.reason, PRECEDENCE_REASON.LOWER_PRECEDENCE_STATUS);
});

test("precedencia: PENDING + REJECTED entrante => APPLY REJECTED", () => {
  const d = decidePaymentRowTransition({ incoming: "REJECTED", current: { status: "PENDING", approvedEffectAppliedAt: null } });
  assert.equal(d.paymentStatusAction, "APPLY");
  assert.equal(d.nextPaymentStatus, "REJECTED");
});

test("precedencia: APPROVED + APPROVED entrante => APPLY (refresco idempotente)", () => {
  const d = decidePaymentRowTransition({ incoming: "APPROVED", current: { status: "APPROVED", approvedEffectAppliedAt: NOW } });
  assert.equal(d.paymentStatusAction, "APPLY");
  assert.equal(d.nextPaymentStatus, "APPROVED");
});

// --- Cobertura de ACCESO (10) ------------------------------------------------

test("acceso: TRIAL con trialEndsAt futuro => cubierto", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "TRIAL", currentPeriodEnd: PAST, graceEndsAt: null, trialEndsAt: FUTURE, now: NOW }),
    true
  );
});

test("acceso: TRIAL vencido => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "TRIAL", currentPeriodEnd: PAST, graceEndsAt: null, trialEndsAt: PAST, now: NOW }),
    false
  );
});

test("acceso: ACTIVE con periodo vigente => cubierto", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "ACTIVE", currentPeriodEnd: FUTURE, graceEndsAt: null, trialEndsAt: null, now: NOW }),
    true
  );
});

test("acceso: ACTIVE con periodo vencido => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "ACTIVE", currentPeriodEnd: PAST, graceEndsAt: null, trialEndsAt: null, now: NOW }),
    false
  );
});

test("acceso: GRACE_PERIOD con graceEndsAt futuro => cubierto (provisional)", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: PAST, graceEndsAt: FUTURE, trialEndsAt: null, now: NOW }),
    true
  );
});

test("acceso: GRACE_PERIOD con graceEndsAt vencido => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: PAST, graceEndsAt: PAST, trialEndsAt: null, now: NOW }),
    false
  );
});

test("acceso: GRACE_PERIOD con graceEndsAt null (inconsistencia) => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: PAST, graceEndsAt: null, trialEndsAt: null, now: NOW }),
    false
  );
});

test("acceso: SUSPENDED => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "SUSPENDED", currentPeriodEnd: FUTURE, graceEndsAt: FUTURE, trialEndsAt: FUTURE, now: NOW }),
    false
  );
});

test("acceso: CANCELLED => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "CANCELLED", currentPeriodEnd: FUTURE, graceEndsAt: FUTURE, trialEndsAt: FUTURE, now: NOW }),
    false
  );
});

test("acceso: PENDING_PAYMENT => sin cobertura", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "PENDING_PAYMENT", currentPeriodEnd: FUTURE, graceEndsAt: null, trialEndsAt: null, now: NOW }),
    false
  );
});

// --- Cobertura de PAGO REAL (7) ----------------------------------------------

test("pago real: MP aprobado, efecto aplicado, sin cuarentena, periodo vigente => cubre", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({})], NOW, ID), true);
});

test("pago real: SIMULATED no cuenta como ingreso real", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ provider: "SIMULATED" })], NOW, ID), false);
});

test("pago real: sin efecto aplicado no cuenta", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ approvedEffectAppliedAt: null })], NOW, ID), false);
});

test("pago real: en cuarentena no cuenta", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ approvedEffectReconciliationRequired: true })], NOW, ID), false);
});

test("pago real: periodo vencido no cuenta", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ periodEnd: PAST })], NOW, ID), false);
});

test("pago real: estado PENDING no cuenta", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ status: "PENDING", approvedEffectAppliedAt: null })], NOW, ID), false);
});

test("pago real: sin filas => sin cobertura", () => {
  assert.equal(hasCurrentRealPaymentCoverage([], NOW, ID), false);
});

// --- EVIDENCIA de acceso aplicada (5) ----------------------------------------

test("evidencia: pago real vigente => hay evidencia", () => {
  assert.equal(hasCurrentAppliedAccessEvidence([row({})], NOW, ID), true);
});

test("evidencia: SIMULATED aprobado vigente => hay evidencia (acceso, no ingreso)", () => {
  assert.equal(
    hasCurrentAppliedAccessEvidence([row({ provider: "SIMULATED", approvedEffectAppliedAt: null })], NOW, ID),
    true
  );
});

test("evidencia: SIMULATED con periodo vencido => sin evidencia", () => {
  assert.equal(
    hasCurrentAppliedAccessEvidence([row({ provider: "SIMULATED", approvedEffectAppliedAt: null, periodEnd: PAST })], NOW, ID),
    false
  );
});

test("evidencia: pago real en cuarentena => sin evidencia", () => {
  assert.equal(hasCurrentAppliedAccessEvidence([row({ approvedEffectReconciliationRequired: true })], NOW, ID), false);
});

test("evidencia: sin filas => sin evidencia", () => {
  assert.equal(hasCurrentAppliedAccessEvidence([], NOW, ID), false);
});

// --- Decision de Subscription para evento no aprobado (5) --------------------

test("no-aprobado: suscripcion CANCELLED => PRESERVE (terminal)", () => {
  const d = decideSubscriptionActionForNonApproved({
    incoming: "REJECTED",
    currentSubscriptionStatus: "CANCELLED",
    currentPaymentIsTerminal: false,
    accessCovered: false,
    appliedAccessEvidenceElsewhere: false,
  });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.TERMINAL_SUBSCRIPTION_STATUS);
});

test("no-aprobado: el propio pago ya es terminal => PRESERVE", () => {
  const d = decideSubscriptionActionForNonApproved({
    incoming: "PENDING",
    currentSubscriptionStatus: "ACTIVE",
    currentPaymentIsTerminal: true,
    accessCovered: false,
    appliedAccessEvidenceElsewhere: false,
  });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.APPROVED_IS_TERMINAL);
});

test("no-aprobado: acceso vigente => PRESERVE (cubierto)", () => {
  const d = decideSubscriptionActionForNonApproved({
    incoming: "REJECTED",
    currentSubscriptionStatus: "ACTIVE",
    currentPaymentIsTerminal: false,
    accessCovered: true,
    appliedAccessEvidenceElsewhere: false,
  });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.CURRENT_ACCESS_COVERED);
});

test("no-aprobado: evidencia aplicada en otro pago => PRESERVE", () => {
  const d = decideSubscriptionActionForNonApproved({
    incoming: "REJECTED",
    currentSubscriptionStatus: "ACTIVE",
    currentPaymentIsTerminal: false,
    accessCovered: false,
    appliedAccessEvidenceElsewhere: true,
  });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.CURRENT_ACCESS_COVERED);
});

test("no-aprobado: sin cobertura ni evidencia => ENTER_GRACE", () => {
  const d = decideSubscriptionActionForNonApproved({
    incoming: "REJECTED",
    currentSubscriptionStatus: "TRIAL",
    currentPaymentIsTerminal: false,
    accessCovered: false,
    appliedAccessEvidenceElsewhere: false,
  });
  assert.equal(d.subscriptionAction, "ENTER_GRACE");
  assert.equal(d.reason, PRECEDENCE_REASON.APPLIES);
});

// --- Normalizacion y decision de preapproval (9) -----------------------------

test("preapproval normalize: authorized/paused/cancelled/pending conocidos, otro desconocido", () => {
  assert.deepEqual(normalizePreapprovalStatus("authorized"), { known: true, kind: "AUTHORIZED" });
  assert.deepEqual(normalizePreapprovalStatus("paused"), { known: true, kind: "PAUSED" });
  assert.deepEqual(normalizePreapprovalStatus("cancelled"), { known: true, kind: "CANCELLED" });
  assert.deepEqual(normalizePreapprovalStatus("pending"), { known: true, kind: "PENDING" });
  assert.deepEqual(normalizePreapprovalStatus("weird"), { known: false, rawStatus: "weird" });
});

test("preapproval: estado desconocido => IGNORE (no toca acceso)", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: false, rawStatus: "weird" },
    accessCovered: true,
    realPaymentCovered: true,
    trialValid: false,
    currentStatus: "ACTIVE",
  });
  assert.equal(d.action, "IGNORE");
  assert.equal(d.nextStatus, "ACTIVE");
  assert.equal(d.reason, PRECEDENCE_REASON.UNKNOWN_PROVIDER_STATUS);
});

test("preapproval: authorized con pago real vigente => SET ACTIVE", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "AUTHORIZED" },
    accessCovered: true,
    realPaymentCovered: true,
    trialValid: false,
    currentStatus: "GRACE_PERIOD",
  });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "ACTIVE");
});

// F2E: corregido. El caso realista de "trial disponible desde PENDING_PAYMENT" tiene
// accessCovered=false (PENDING_PAYMENT no da cobertura); el trial disponible es lo que
// activa SET TRIAL. La version 2C usaba accessCovered=true, entrada contradictoria.
test("preapproval: authorized sin pago real pero trial disponible desde PENDING_PAYMENT => SET TRIAL", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "AUTHORIZED" },
    accessCovered: false,
    realPaymentCovered: false,
    trialValid: true,
    currentStatus: "PENDING_PAYMENT",
  });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "TRIAL");
});

test("preapproval: authorized sin pago real ni trial pero con acceso vigente => PRESERVE", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "AUTHORIZED" },
    accessCovered: true,
    realPaymentCovered: false,
    trialValid: false,
    currentStatus: "GRACE_PERIOD",
  });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "GRACE_PERIOD");
  assert.equal(d.reason, PRECEDENCE_REASON.CURRENT_ACCESS_COVERED);
});

test("preapproval: authorized sin nada => SET PENDING_PAYMENT", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "AUTHORIZED" },
    accessCovered: false,
    realPaymentCovered: false,
    trialValid: false,
    currentStatus: "GRACE_PERIOD",
  });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

test("preapproval: pending con acceso vigente => PRESERVE (no degrada)", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "PENDING" },
    accessCovered: true,
    realPaymentCovered: false,
    trialValid: false,
    currentStatus: "ACTIVE",
  });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "ACTIVE");
});

test("preapproval: paused NO degrada acceso vigente => PRESERVE", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "PAUSED" },
    accessCovered: true,
    realPaymentCovered: true,
    trialValid: false,
    currentStatus: "ACTIVE",
  });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "ACTIVE");
  assert.equal(d.reason, PRECEDENCE_REASON.PREAPPROVAL_PAUSED_PRESERVED);
});

// F2E (F2D-03): corregido. paused sin cobertura NO debe conservar un ACTIVE vencido;
// no inventa acceso: fallback tecnico SET PENDING_PAYMENT. (La version 2C conservaba
// ACTIVE, comportamiento reconocido como defecto.)
test("preapproval: paused sin cobertura (ACTIVE vencido) => SET PENDING_PAYMENT (no inventa acceso)", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "PAUSED" },
    accessCovered: false,
    realPaymentCovered: false,
    trialValid: false,
    currentStatus: "ACTIVE",
  });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

test("preapproval: cancelled conserva comportamiento previo => SET CANCELLED", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "CANCELLED" },
    accessCovered: true,
    realPaymentCovered: true,
    trialValid: false,
    currentStatus: "ACTIVE",
  });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "CANCELLED");
  assert.equal(d.reason, PRECEDENCE_REASON.PREAPPROVAL_CANCELLED);
});

// ============================================================================
// FASE 2E - Correcciones F2D-01..F2D-08
// ============================================================================

// --- F2D-05: normalizacion segura ante tipos runtime inesperados -------------

test("F2E normalize payment: tipos no-string (null/undefined/numero/booleano/objeto/array) => desconocido sin lanzar", () => {
  const inputs: unknown[] = [null, undefined, 42, true, false, {}, [], { status: "approved" }];
  for (const value of inputs) {
    const result = normalizeProviderPaymentStatus(value);
    assert.equal(result.known, false, `valor ${JSON.stringify(value)} debe ser desconocido`);
  }
});

test("F2E normalize preapproval: tipos no-string => desconocido sin lanzar", () => {
  const inputs: unknown[] = [null, undefined, 0, true, {}, [], { status: "authorized" }];
  for (const value of inputs) {
    const result = normalizePreapprovalStatus(value);
    assert.equal(result.known, false, `valor ${JSON.stringify(value)} debe ser desconocido`);
  }
});

test("F2E normalize: mayusculas y espacios se normalizan (APPROVED conocido)", () => {
  assert.deepEqual(normalizeProviderPaymentStatus("  APPROVED  "), { known: true, status: "APPROVED" });
  assert.deepEqual(normalizeProviderPaymentStatus("Rejected"), { known: true, status: "REJECTED" });
  assert.deepEqual(normalizePreapprovalStatus("  Authorized "), { known: true, kind: "AUTHORIZED" });
});

test("F2E normalize: cadena vacia y solo-espacios => desconocido con rawStatus vacio", () => {
  assert.deepEqual(normalizeProviderPaymentStatus(""), { known: false, rawStatus: "" });
  assert.deepEqual(normalizeProviderPaymentStatus("   "), { known: false, rawStatus: "" });
});

test("F2E providerStatusLabel: etiqueta acotada segun tipo", () => {
  assert.equal(providerStatusLabel("approved"), "approved");
  assert.equal(providerStatusLabel("  spaced  "), "spaced");
  assert.equal(providerStatusLabel(42), "number");
  assert.equal(providerStatusLabel(true), "boolean");
  assert.equal(providerStatusLabel({}), "object");
  assert.equal(providerStatusLabel([]), "array");
  assert.equal(providerStatusLabel(null), "");
  assert.equal(providerStatusLabel(undefined), "");
});

// --- Fronteras temporales exactas (== now no cubre) --------------------------

test("F2E frontera: currentPeriodEnd == now no cubre (ACTIVE)", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "ACTIVE", currentPeriodEnd: NOW, graceEndsAt: null, trialEndsAt: null, now: NOW }),
    false
  );
});

test("F2E frontera: trialEndsAt == now no cubre (TRIAL)", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "TRIAL", currentPeriodEnd: PAST, graceEndsAt: null, trialEndsAt: NOW, now: NOW }),
    false
  );
});

test("F2E frontera: graceEndsAt == now no cubre (GRACE_PERIOD)", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: PAST, graceEndsAt: NOW, trialEndsAt: null, now: NOW }),
    false
  );
});

test("F2E frontera: periodEnd == now no cuenta como pago real", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ periodEnd: NOW })], NOW, ID), false);
});

// --- F2D-01: Grace existente se preserva (no se genera nueva frontera) --------

type NonApprovedInput = Parameters<typeof decideSubscriptionActionForNonApproved>[0];

function nonApproved(currentSubscriptionStatus: NonApprovedInput["currentSubscriptionStatus"], overrides?: Partial<NonApprovedInput>) {
  return decideSubscriptionActionForNonApproved({
    incoming: "REJECTED",
    currentSubscriptionStatus,
    currentPaymentIsTerminal: false,
    accessCovered: false,
    appliedAccessEvidenceElsewhere: false,
    ...overrides,
  });
}

test("F2E grace: GRACE vigente => PRESERVE (EXISTING_GRACE_PRESERVED)", () => {
  const d = nonApproved("GRACE_PERIOD", { accessCovered: true });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.EXISTING_GRACE_PRESERVED);
});

test("F2E grace: GRACE vencida => PRESERVE (no renueva frontera)", () => {
  const d = nonApproved("GRACE_PERIOD", { accessCovered: false });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.EXISTING_GRACE_PRESERVED);
});

test("F2E grace: GRACE con evidencia en otro pago igual se preserva por estado", () => {
  const d = nonApproved("GRACE_PERIOD", { appliedAccessEvidenceElsewhere: true });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.EXISTING_GRACE_PRESERVED);
});

test("F2E grace: PENDING entrante sobre GRACE tampoco renueva", () => {
  const d = nonApproved("GRACE_PERIOD", { incoming: "PENDING" });
  assert.equal(d.subscriptionAction, "PRESERVE");
  assert.equal(d.reason, PRECEDENCE_REASON.EXISTING_GRACE_PRESERVED);
});

test("F2E grace: solo se entra a GRACE desde un estado NO grace y sin cobertura", () => {
  // TRIAL vencido sin cobertura => ENTER_GRACE (primera entrada).
  const enter = nonApproved("TRIAL");
  assert.equal(enter.subscriptionAction, "ENTER_GRACE");
  // ACTIVE vencido sin cobertura => ENTER_GRACE.
  const enter2 = nonApproved("ACTIVE");
  assert.equal(enter2.subscriptionAction, "ENTER_GRACE");
});

// --- F2D-03: preapproval sobre terminales y paused sin cobertura -------------

function preapproval(kind: "AUTHORIZED" | "PAUSED" | "PENDING" | "CANCELLED", overrides?: Partial<Parameters<typeof decidePreapprovalOutcome>[0]>) {
  return decidePreapprovalOutcome({
    normalized: { known: true, kind },
    accessCovered: false,
    realPaymentCovered: false,
    trialValid: false,
    currentStatus: "PENDING_PAYMENT",
    ...overrides,
  });
}

test("F2E preapproval terminal: authorized sobre SUSPENDED => PRESERVE", () => {
  const d = preapproval("AUTHORIZED", { currentStatus: "SUSPENDED", realPaymentCovered: true });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "SUSPENDED");
  assert.equal(d.reason, PRECEDENCE_REASON.TERMINAL_SUBSCRIPTION_STATUS);
});

test("F2E preapproval terminal: authorized sobre CANCELLED => PRESERVE", () => {
  const d = preapproval("AUTHORIZED", { currentStatus: "CANCELLED", realPaymentCovered: true });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "CANCELLED");
});

test("F2E preapproval terminal: pending sobre SUSPENDED => PRESERVE", () => {
  const d = preapproval("PENDING", { currentStatus: "SUSPENDED" });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "SUSPENDED");
});

test("F2E preapproval terminal: pending sobre CANCELLED => PRESERVE", () => {
  const d = preapproval("PENDING", { currentStatus: "CANCELLED" });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "CANCELLED");
});

test("F2E preapproval terminal: paused sobre SUSPENDED => PRESERVE", () => {
  const d = preapproval("PAUSED", { currentStatus: "SUSPENDED" });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "SUSPENDED");
});

test("F2E preapproval paused: con ACTIVE vigente => PRESERVE", () => {
  const d = preapproval("PAUSED", { currentStatus: "ACTIVE", accessCovered: true });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "ACTIVE");
  assert.equal(d.reason, PRECEDENCE_REASON.PREAPPROVAL_PAUSED_PRESERVED);
});

test("F2E preapproval paused: ACTIVE vencido (sin cobertura) => SET PENDING_PAYMENT", () => {
  const d = preapproval("PAUSED", { currentStatus: "ACTIVE", accessCovered: false });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

test("F2E preapproval paused: TRIAL vencido (sin cobertura) => SET PENDING_PAYMENT", () => {
  const d = preapproval("PAUSED", { currentStatus: "TRIAL", accessCovered: false });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

test("F2E preapproval paused: GRACE vencida (sin cobertura) => SET PENDING_PAYMENT", () => {
  const d = preapproval("PAUSED", { currentStatus: "GRACE_PERIOD", accessCovered: false });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

test("F2E preapproval pending: sin cobertura ni trial => SET PENDING_PAYMENT", () => {
  const d = preapproval("PENDING", { currentStatus: "ACTIVE", accessCovered: false, trialValid: false });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

test("F2E preapproval pending: con trial disponible => SET TRIAL", () => {
  const d = preapproval("PENDING", { currentStatus: "PENDING_PAYMENT", accessCovered: false, trialValid: true });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "TRIAL");
});

test("F2E preapproval authorized: sin pago y sin trial => SET PENDING_PAYMENT (resultado explicito)", () => {
  const d = preapproval("AUTHORIZED", { currentStatus: "PENDING_PAYMENT", accessCovered: false, trialValid: false });
  assert.equal(d.action, "SET");
  assert.equal(d.nextStatus, "PENDING_PAYMENT");
});

// --- F2D-08: evidencia administrativa (REJECTED/PENDING/SIMULATED) -----------

test("F2E evidencia: REJECTED no cuenta", () => {
  assert.equal(hasCurrentAppliedAccessEvidence([row({ status: "REJECTED", approvedEffectAppliedAt: null })], NOW, ID), false);
});

test("F2E evidencia: PENDING no cuenta", () => {
  assert.equal(hasCurrentAppliedAccessEvidence([row({ status: "PENDING", approvedEffectAppliedAt: null })], NOW, ID), false);
});

test("F2E evidencia: SIMULATED APPROVED vigente cuenta", () => {
  assert.equal(
    hasCurrentAppliedAccessEvidence([row({ provider: "SIMULATED", approvedEffectAppliedAt: null, periodEnd: FUTURE })], NOW, ID),
    true
  );
});

test("F2E evidencia: SIMULATED vencido no cuenta", () => {
  assert.equal(
    hasCurrentAppliedAccessEvidence([row({ provider: "SIMULATED", approvedEffectAppliedAt: null, periodEnd: PAST })], NOW, ID),
    false
  );
});

// ============================================================================
// FASE 2G - Identidad exacta y limites (F2F-02, F2F-05)
// ============================================================================

// --- Identidad exacta tenant+subscription (F2F-02) ---------------------------

test("F2G identidad: pareja correcta tenant+subscription cuenta", () => {
  const rows = [row({ tenantId: "t1", subscriptionId: "s1" })];
  assert.equal(hasCurrentRealPaymentCoverage(rows, NOW, ID), true);
  assert.equal(hasCurrentAppliedAccessEvidence(rows, NOW, ID), true);
});

test("F2G identidad: tenant correcto con subscription ajena NO cuenta", () => {
  const rows = [row({ tenantId: "t1", subscriptionId: "OTRA" })];
  assert.equal(hasCurrentRealPaymentCoverage(rows, NOW, ID), false);
  assert.equal(hasCurrentAppliedAccessEvidence(rows, NOW, ID), false);
});

test("F2G identidad: subscription correcta con tenant ajeno NO cuenta", () => {
  const rows = [row({ tenantId: "OTRO", subscriptionId: "s1" })];
  assert.equal(hasCurrentRealPaymentCoverage(rows, NOW, ID), false);
  assert.equal(hasCurrentAppliedAccessEvidence(rows, NOW, ID), false);
});

test("F2G identidad: SIMULATED cruzado no cuenta como evidencia", () => {
  const rows = [row({ provider: "SIMULATED", approvedEffectAppliedAt: null, tenantId: "t1", subscriptionId: "OTRA" })];
  assert.equal(hasCurrentAppliedAccessEvidence(rows, NOW, ID), false);
});

test("F2G identidad: Mercado Pago cruzado no cuenta como pago real", () => {
  const rows = [row({ tenantId: "OTRO", subscriptionId: "OTRA" })];
  assert.equal(hasCurrentRealPaymentCoverage(rows, NOW, ID), false);
});

// --- Limite de longitud de etiquetas (F2F-05) --------------------------------

test("F2G longitud: string de 10.000 chars se limita EXACTAMENTE al maximo", () => {
  const label = providerStatusLabel("x".repeat(10000));
  assert.equal(label.length, MAX_PROVIDER_STATUS_LENGTH);
  assert.equal(label, "x".repeat(MAX_PROVIDER_STATUS_LENGTH));
});

test("F2G longitud: espacios se recortan ANTES de truncar", () => {
  const label = providerStatusLabel("   " + "y".repeat(10000) + "   ");
  assert.equal(label.length, MAX_PROVIDER_STATUS_LENGTH);
  assert.equal(label, "y".repeat(MAX_PROVIDER_STATUS_LENGTH));
});

test("F2G longitud: normalizadores truncan el rawStatus desconocido", () => {
  const p = normalizeProviderPaymentStatus("z".repeat(9000));
  assert.equal(p.known, false);
  if (!p.known) assert.equal(p.rawStatus.length, MAX_PROVIDER_STATUS_LENGTH);
  const pre = normalizePreapprovalStatus("w".repeat(9000));
  assert.equal(pre.known, false);
  if (!pre.known) assert.equal(pre.rawStatus.length, MAX_PROVIDER_STATUS_LENGTH);
});

test("F2G longitud: numero/objeto/array producen etiquetas seguras cortas", () => {
  assert.equal(providerStatusLabel(123), "number");
  assert.equal(providerStatusLabel({ a: "x".repeat(10000) }), "object");
  assert.equal(providerStatusLabel(["x".repeat(10000)]), "array");
  assert.equal(truncateProviderStatus("a".repeat(300)).length, MAX_PROVIDER_STATUS_LENGTH);
});

// --- Grace null y paused sobre CANCELLED (huecos senalados por Codex) ---------

test("F2G grace: graceEndsAt null explicito no otorga cobertura de acceso", () => {
  assert.equal(
    hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: PAST, graceEndsAt: null, trialEndsAt: null, now: NOW }),
    false
  );
});

test("F2G preapproval: paused sobre CANCELLED preserva el terminal", () => {
  const d = decidePreapprovalOutcome({
    normalized: { known: true, kind: "PAUSED" },
    accessCovered: false,
    realPaymentCovered: false,
    trialValid: false,
    currentStatus: "CANCELLED",
  });
  assert.equal(d.action, "PRESERVE");
  assert.equal(d.nextStatus, "CANCELLED");
  assert.equal(d.reason, PRECEDENCE_REASON.TERMINAL_SUBSCRIPTION_STATUS);
});
