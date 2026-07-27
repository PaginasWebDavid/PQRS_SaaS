// Pruebas PURAS de la decision de transiciones del cron de mora
// (`decideCronTransition`). No importan Prisma ni abren conexiones. Cubren:
// estados terminales, ACTIVE/TRIAL/GRACE vigentes y vencidos, la frontera exacta
// `= now`, graceEndsAt = null (INCONSISTENT), PENDING_PAYMENT, estado desconocido,
// fechas invalidas/ausentes y la ausencia de mutacion de los inputs.

import test from "node:test";
import assert from "node:assert/strict";
import {
  decideCronTransition,
  CRON_DECISION_REASON,
  type CronSubscriptionSnapshot,
} from "../../src/domains/billing/cron-decision";

const NOW = new Date("2026-07-27T12:00:00.000Z");
const FUTURE = new Date(NOW.getTime() + 60 * 60 * 1000);
const PAST = new Date(NOW.getTime() - 60 * 60 * 1000);
const AT_NOW = new Date(NOW.getTime());

function snapshot(overrides: Partial<CronSubscriptionSnapshot>): CronSubscriptionSnapshot {
  return {
    status: "ACTIVE",
    currentPeriodEnd: FUTURE,
    trialEndsAt: null,
    graceEndsAt: null,
    ...overrides,
  };
}

// 1. ACTIVE vigente -> PRESERVE.
test("1. ACTIVE con periodo vigente se preserva", () => {
  const decision = decideCronTransition(snapshot({ status: "ACTIVE", currentPeriodEnd: FUTURE }), NOW);
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.ACTIVE_CURRENT);
});

// 2. ACTIVE vencida -> transicion a GRACE_PERIOD.
test("2. ACTIVE vencida transiciona a GRACE_PERIOD", () => {
  const decision = decideCronTransition(snapshot({ status: "ACTIVE", currentPeriodEnd: PAST }), NOW);
  assert.equal(decision.action, "TRANSITION");
  if (decision.action !== "TRANSITION") return;
  assert.equal(decision.transition, "ACTIVE_EXPIRED");
  assert.equal(decision.nextStatus, "GRACE_PERIOD");
});

// 3. ACTIVE con currentPeriodEnd = now -> transiciona (frontera <= now, seccion 5).
test("3. ACTIVE con currentPeriodEnd = now transiciona", () => {
  const decision = decideCronTransition(snapshot({ status: "ACTIVE", currentPeriodEnd: AT_NOW }), NOW);
  assert.equal(decision.action, "TRANSITION");
  if (decision.action !== "TRANSITION") return;
  assert.equal(decision.nextStatus, "GRACE_PERIOD");
});

// 4. TRIAL vigente -> PRESERVE.
test("4. TRIAL con trialEndsAt vigente se preserva", () => {
  const decision = decideCronTransition(
    snapshot({ status: "TRIAL", trialEndsAt: FUTURE, currentPeriodEnd: FUTURE }),
    NOW
  );
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.TRIAL_CURRENT);
});

// 5. TRIAL vencido -> transicion a GRACE_PERIOD.
test("5. TRIAL vencido transiciona a GRACE_PERIOD", () => {
  const decision = decideCronTransition(
    snapshot({ status: "TRIAL", trialEndsAt: PAST, currentPeriodEnd: PAST }),
    NOW
  );
  assert.equal(decision.action, "TRANSITION");
  if (decision.action !== "TRANSITION") return;
  assert.equal(decision.transition, "TRIAL_EXPIRED");
  assert.equal(decision.nextStatus, "GRACE_PERIOD");
});

// 6. TRIAL con trialEndsAt = now -> transiciona.
test("6. TRIAL con trialEndsAt = now transiciona", () => {
  const decision = decideCronTransition(
    snapshot({ status: "TRIAL", trialEndsAt: AT_NOW, currentPeriodEnd: FUTURE }),
    NOW
  );
  assert.equal(decision.action, "TRANSITION");
  if (decision.action !== "TRANSITION") return;
  assert.equal(decision.transition, "TRIAL_EXPIRED");
});

// 6b. TRIAL sin trialEndsAt usa currentPeriodEnd como respaldo.
test("6b. TRIAL sin trialEndsAt respalda en currentPeriodEnd", () => {
  const vigente = decideCronTransition(
    snapshot({ status: "TRIAL", trialEndsAt: null, currentPeriodEnd: FUTURE }),
    NOW
  );
  assert.equal(vigente.action, "PRESERVE");
  const vencido = decideCronTransition(
    snapshot({ status: "TRIAL", trialEndsAt: null, currentPeriodEnd: PAST }),
    NOW
  );
  assert.equal(vencido.action, "TRANSITION");
});

// 7. GRACE vigente -> PRESERVE.
test("7. GRACE con graceEndsAt vigente se preserva", () => {
  const decision = decideCronTransition(snapshot({ status: "GRACE_PERIOD", graceEndsAt: FUTURE }), NOW);
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.GRACE_CURRENT);
});

// 8. GRACE vencida -> transicion a SUSPENDED.
test("8. GRACE vencida transiciona a SUSPENDED", () => {
  const decision = decideCronTransition(snapshot({ status: "GRACE_PERIOD", graceEndsAt: PAST }), NOW);
  assert.equal(decision.action, "TRANSITION");
  if (decision.action !== "TRANSITION") return;
  assert.equal(decision.transition, "GRACE_EXPIRED");
  assert.equal(decision.nextStatus, "SUSPENDED");
});

// 9. GRACE con graceEndsAt = now -> transiciona.
test("9. GRACE con graceEndsAt = now transiciona a SUSPENDED", () => {
  const decision = decideCronTransition(snapshot({ status: "GRACE_PERIOD", graceEndsAt: AT_NOW }), NOW);
  assert.equal(decision.action, "TRANSITION");
  if (decision.action !== "TRANSITION") return;
  assert.equal(decision.nextStatus, "SUSPENDED");
});

// 10. GRACE con graceEndsAt = null -> INCONSISTENT (no suspende, no inventa fecha).
test("10. GRACE con graceEndsAt = null es INCONSISTENT", () => {
  const decision = decideCronTransition(snapshot({ status: "GRACE_PERIOD", graceEndsAt: null }), NOW);
  assert.equal(decision.action, "INCONSISTENT");
  assert.equal(decision.reason, CRON_DECISION_REASON.GRACE_WITHOUT_BOUNDARY);
});

// 11. SUSPENDED -> PRESERVE.
test("11. SUSPENDED se preserva (terminal)", () => {
  const decision = decideCronTransition(snapshot({ status: "SUSPENDED", graceEndsAt: PAST }), NOW);
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.TERMINAL_SUSPENDED);
});

// 12. CANCELLED -> PRESERVE.
test("12. CANCELLED se preserva (terminal)", () => {
  const decision = decideCronTransition(snapshot({ status: "CANCELLED", currentPeriodEnd: PAST }), NOW);
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.TERMINAL_CANCELLED);
});

// 13. PENDING_PAYMENT -> PRESERVE (politica actual: el cron no lo transiciona).
test("13. PENDING_PAYMENT se preserva aunque el periodo este vencido", () => {
  const decision = decideCronTransition(
    snapshot({ status: "PENDING_PAYMENT", currentPeriodEnd: PAST }),
    NOW
  );
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.PENDING_PAYMENT_PRESERVED);
});

// 13b. Estado desconocido -> PRESERVE (fail-safe, nunca degrada).
test("13b. Estado desconocido se preserva (fail-safe)", () => {
  const decision = decideCronTransition(
    snapshot({ status: "ALGO_RARO", currentPeriodEnd: PAST }),
    NOW
  );
  assert.equal(decision.action, "PRESERVE");
  assert.equal(decision.reason, CRON_DECISION_REASON.UNKNOWN_STATUS_PRESERVED);
});

// 14. Fechas invalidas o ausentes -> INCONSISTENT (no transiciona a ciegas).
test("14. ACTIVE sin currentPeriodEnd valido es INCONSISTENT", () => {
  const nulo = decideCronTransition(
    snapshot({ status: "ACTIVE", currentPeriodEnd: null }),
    NOW
  );
  assert.equal(nulo.action, "INCONSISTENT");
  assert.equal(nulo.reason, CRON_DECISION_REASON.ACTIVE_WITHOUT_PERIOD_END);

  const invalida = decideCronTransition(
    snapshot({ status: "ACTIVE", currentPeriodEnd: new Date("no-es-fecha") }),
    NOW
  );
  assert.equal(invalida.action, "INCONSISTENT");

  const trialSinFechas = decideCronTransition(
    snapshot({ status: "TRIAL", trialEndsAt: null, currentPeriodEnd: null }),
    NOW
  );
  assert.equal(trialSinFechas.action, "INCONSISTENT");
  assert.equal(trialSinFechas.reason, CRON_DECISION_REASON.TRIAL_WITHOUT_BOUNDARY);

  const graceInvalida = decideCronTransition(
    snapshot({ status: "GRACE_PERIOD", graceEndsAt: new Date("nope") }),
    NOW
  );
  assert.equal(graceInvalida.action, "INCONSISTENT");
  assert.equal(graceInvalida.reason, CRON_DECISION_REASON.GRACE_INVALID_BOUNDARY);
});

// 15. La funcion NO muta los inputs.
test("15. decideCronTransition no muta el snapshot ni las fechas", () => {
  const currentPeriodEnd = new Date(PAST.getTime());
  const graceEndsAt = new Date(PAST.getTime());
  const input: CronSubscriptionSnapshot = {
    status: "GRACE_PERIOD",
    currentPeriodEnd,
    trialEndsAt: null,
    graceEndsAt,
  };
  const before = JSON.stringify(input);
  decideCronTransition(input, NOW);
  assert.equal(JSON.stringify(input), before, "el snapshot no cambia");
  assert.equal(currentPeriodEnd.getTime(), PAST.getTime(), "las fechas no cambian");
  assert.equal(graceEndsAt.getTime(), PAST.getTime());
});
