import test from "node:test";
import assert from "node:assert/strict";
import {
  decidePaymentRowTransition,
  decideSubscriptionActionForNonApproved,
  hasCurrentAccessCoverage,
  hasCurrentAppliedAccessEvidence,
  hasCurrentRealPaymentCoverage,
  MAX_PROVIDER_STATUS_LENGTH,
  normalizeProviderPaymentStatus,
  providerStatusLabel,
  type PaymentCoverageRow,
} from "../../src/domains/billing/precedence";

const now = new Date("2026-08-27T12:00:00.000Z");
const future = new Date(now.getTime() + 60 * 60 * 1000);
const past = new Date(now.getTime() - 60 * 60 * 1000);
const identity = { tenantId: "tenant-a", subscriptionId: "subscription-a" };

function row(overrides: Partial<PaymentCoverageRow> = {}): PaymentCoverageRow {
  return {
    tenantId: identity.tenantId,
    subscriptionId: identity.subscriptionId,
    provider: "WOMPI",
    status: "APPROVED",
    periodEnd: future,
    approvedEffectAppliedAt: now,
    approvedEffectReconciliationRequired: false,
    ...overrides,
  };
}

test("provider statuses are normalized without trusting malformed input", () => {
  assert.deepEqual(normalizeProviderPaymentStatus(" approved "), { known: true, status: "APPROVED" });
  assert.deepEqual(normalizeProviderPaymentStatus("rejected"), { known: true, status: "REJECTED" });
  assert.deepEqual(normalizeProviderPaymentStatus("unknown"), { known: false, rawStatus: "unknown" });
  assert.deepEqual(normalizeProviderPaymentStatus({ status: "approved" }), { known: false, rawStatus: "object" });
});

test("approved payment effects are terminal", () => {
  const decision = decidePaymentRowTransition({
    incoming: "REJECTED",
    current: { status: "APPROVED", approvedEffectAppliedAt: now },
  });
  assert.equal(decision.paymentStatusAction, "PRESERVE");
  assert.equal(decision.nextPaymentStatus, "APPROVED");
});

test("payment state only moves forward", () => {
  assert.equal(decidePaymentRowTransition({ incoming: "APPROVED", current: { status: "PENDING", approvedEffectAppliedAt: null } }).nextPaymentStatus, "APPROVED");
  assert.equal(decidePaymentRowTransition({ incoming: "PENDING", current: { status: "REJECTED", approvedEffectAppliedAt: null } }).paymentStatusAction, "PRESERVE");
});

test("only active, applied Wompi and manual-transfer payments are real coverage", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row()], now, identity), true);
  assert.equal(hasCurrentRealPaymentCoverage([row({ provider: "MANUAL_TRANSFER" })], now, identity), true);
  assert.equal(hasCurrentRealPaymentCoverage([row({ provider: "SIMULATED" })], now, identity), false);
  assert.equal(hasCurrentRealPaymentCoverage([row({ approvedEffectAppliedAt: null })], now, identity), false);
  assert.equal(hasCurrentRealPaymentCoverage([row({ periodEnd: past })], now, identity), false);
});

test("coverage requires the exact tenant and subscription pair", () => {
  assert.equal(hasCurrentRealPaymentCoverage([row({ tenantId: "other" })], now, identity), false);
  assert.equal(hasCurrentAppliedAccessEvidence([row({ subscriptionId: "other" })], now, identity), false);
});

test("simulated and courtesy entries can support access but never represent income", () => {
  assert.equal(hasCurrentAppliedAccessEvidence([row({ provider: "SIMULATED", approvedEffectAppliedAt: null })], now, identity), true);
  assert.equal(hasCurrentAppliedAccessEvidence([row({ provider: "COURTESY", approvedEffectAppliedAt: null })], now, identity), true);
  assert.equal(hasCurrentAppliedAccessEvidence([row({ provider: "SIMULATED", periodEnd: past, approvedEffectAppliedAt: null })], now, identity), false);
});

test("coverage follows trial, active and grace boundaries", () => {
  assert.equal(hasCurrentAccessCoverage({ subscriptionStatus: "TRIAL", currentPeriodEnd: null, graceEndsAt: null, trialEndsAt: future, now }), true);
  assert.equal(hasCurrentAccessCoverage({ subscriptionStatus: "ACTIVE", currentPeriodEnd: future, graceEndsAt: null, trialEndsAt: null, now }), true);
  assert.equal(hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: past, graceEndsAt: future, trialEndsAt: null, now }), true);
  assert.equal(hasCurrentAccessCoverage({ subscriptionStatus: "GRACE_PERIOD", currentPeriodEnd: past, graceEndsAt: null, trialEndsAt: null, now }), false);
});

test("non-approved events do not degrade covered or terminal subscriptions", () => {
  assert.equal(decideSubscriptionActionForNonApproved({ incoming: "REJECTED", currentSubscriptionStatus: "ACTIVE", currentPaymentIsTerminal: false, accessCovered: true, appliedAccessEvidenceElsewhere: false }).subscriptionAction, "PRESERVE");
  assert.equal(decideSubscriptionActionForNonApproved({ incoming: "PENDING", currentSubscriptionStatus: "SUSPENDED", currentPaymentIsTerminal: false, accessCovered: false, appliedAccessEvidenceElsewhere: false }).subscriptionAction, "PRESERVE");
  assert.equal(decideSubscriptionActionForNonApproved({ incoming: "REJECTED", currentSubscriptionStatus: "TRIAL", currentPaymentIsTerminal: false, accessCovered: false, appliedAccessEvidenceElsewhere: false }).subscriptionAction, "ENTER_GRACE");
});

test("provider labels remain bounded and non-strings do not leak payload data", () => {
  assert.equal(providerStatusLabel({ secret: "x" }), "object");
  assert.equal(providerStatusLabel("x".repeat(10_000)).length, MAX_PROVIDER_STATUS_LENGTH);
});
