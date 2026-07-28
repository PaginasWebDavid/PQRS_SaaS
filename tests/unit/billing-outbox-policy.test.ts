import test from "node:test";
import assert from "node:assert/strict";
import {
  BILLING_OUTBOX_MAX_ATTEMPTS,
  buildBillingOutboxDedupeKey,
  classifyLocalOutboxError,
  classifyProviderHttpStatus,
  computeBillingOutboxNextAttemptAt,
  decideAbandonedBillingOutbox,
  hasBillingOutboxAttemptsRemaining,
  sanitizeBillingOutboxPayload,
} from "../../src/domains/billing/billing-outbox-policy";

const BOUNDARY = new Date("2026-07-27T12:00:00.000Z");
const BASE = {
  subscriptionId: "sub-stable-1",
  eventType: "BILLING_GRACE_STARTED" as const,
  boundary: BOUNDARY,
  recipientUserId: "user-stable-1",
  channel: "IN_APP" as const,
};

test("1. dedupe key is deterministic", () => {
  assert.equal(buildBillingOutboxDedupeKey(BASE), buildBillingOutboxDedupeKey({ ...BASE }));
});

test("2. dedupe key changes by recipient", () => {
  assert.notEqual(buildBillingOutboxDedupeKey(BASE), buildBillingOutboxDedupeKey({ ...BASE, recipientUserId: "user-2" }));
});

test("3. dedupe key changes by channel", () => {
  assert.notEqual(buildBillingOutboxDedupeKey(BASE), buildBillingOutboxDedupeKey({ ...BASE, channel: "EMAIL" }));
});

test("4. dedupe key changes by real transition boundary and event", () => {
  assert.notEqual(buildBillingOutboxDedupeKey(BASE), buildBillingOutboxDedupeKey({ ...BASE, boundary: new Date(BOUNDARY.getTime() + 1) }));
  assert.notEqual(buildBillingOutboxDedupeKey(BASE), buildBillingOutboxDedupeKey({ ...BASE, eventType: "BILLING_SUSPENDED" }));
});

test("5. dedupe key contains no recipient, subscription or email PII", () => {
  const key = buildBillingOutboxDedupeKey(BASE);
  assert.equal(key.includes(BASE.recipientUserId), false);
  assert.equal(key.includes(BASE.subscriptionId), false);
  assert.equal(key.includes("@"), false);
});

test("6. dedupe key is bounded to 255 characters", () => {
  const key = buildBillingOutboxDedupeKey({
    ...BASE,
    subscriptionId: "s".repeat(500),
    recipientUserId: "u".repeat(500),
  });
  assert.ok(key.length <= 255);
});

test("7. provider and local errors have stable classifications", () => {
  assert.equal(classifyProviderHttpStatus(201), "COMPLETED");
  assert.equal(classifyProviderHttpStatus(429), "FAILED_RETRYABLE");
  assert.equal(classifyProviderHttpStatus(503), "FAILED_RETRYABLE");
  assert.equal(classifyProviderHttpStatus(400), "FAILED_FINAL");
  assert.equal(classifyLocalOutboxError({ code: "RESEND_API_KEY_MISSING", providerAttemptStarted: false }), "FAILED_FINAL");
  assert.equal(classifyLocalOutboxError({ code: "P1001", providerAttemptStarted: false }), "FAILED_RETRYABLE");
  assert.equal(classifyLocalOutboxError({ code: "P1001", providerAttemptStarted: true }), "DELIVERY_UNKNOWN");
});

test("8. backoff is deterministic and exponential", () => {
  const first = computeBillingOutboxNextAttemptAt(BOUNDARY, 1);
  const second = computeBillingOutboxNextAttemptAt(BOUNDARY, 2);
  assert.equal(first.getTime() - BOUNDARY.getTime(), 15 * 60 * 1000);
  assert.equal(second.getTime() - BOUNDARY.getTime(), 30 * 60 * 1000);
  assert.equal(computeBillingOutboxNextAttemptAt(BOUNDARY, 1).toISOString(), first.toISOString());
});

test("9. maximum attempt policy is bounded", () => {
  assert.equal(hasBillingOutboxAttemptsRemaining(BILLING_OUTBOX_MAX_ATTEMPTS - 1), true);
  assert.equal(hasBillingOutboxAttemptsRemaining(BILLING_OUTBOX_MAX_ATTEMPTS), false);
});

test("10. abandoned claim before provider is recoverable", () => {
  assert.equal(decideAbandonedBillingOutbox({ channel: "EMAIL", providerAttemptStartedAt: null }), "RECOVERABLE");
});

test("11. abandoned email claim after provider becomes delivery unknown", () => {
  assert.equal(decideAbandonedBillingOutbox({ channel: "EMAIL", providerAttemptStartedAt: BOUNDARY }), "DELIVERY_UNKNOWN");
  assert.equal(decideAbandonedBillingOutbox({ channel: "IN_APP", providerAttemptStartedAt: BOUNDARY }), "RECOVERABLE");
});

test("12. payload keeps only the allowed bounded fields", () => {
  const payload = sanitizeBillingOutboxPayload({ graceDays: 99999 });
  assert.deepEqual(payload, { version: 1, graceDays: 3650 });
  assert.deepEqual(sanitizeBillingOutboxPayload({ graceDays: -2 }), { version: 1 });
});

test("13. helpers do not mutate their inputs", () => {
  const input = { graceDays: 7 };
  const before = structuredClone(input);
  sanitizeBillingOutboxPayload(input);
  buildBillingOutboxDedupeKey(BASE);
  assert.deepEqual(input, before);
  assert.equal(BOUNDARY.toISOString(), "2026-07-27T12:00:00.000Z");
});

test("14. backoff covers attempts 1..5 and is capped at 24h without overflow", () => {
  assert.equal(computeBillingOutboxNextAttemptAt(BOUNDARY, 1).getTime() - BOUNDARY.getTime(), 15 * 60 * 1000);
  assert.equal(computeBillingOutboxNextAttemptAt(BOUNDARY, 2).getTime() - BOUNDARY.getTime(), 30 * 60 * 1000);
  assert.equal(computeBillingOutboxNextAttemptAt(BOUNDARY, 3).getTime() - BOUNDARY.getTime(), 60 * 60 * 1000);
  assert.equal(computeBillingOutboxNextAttemptAt(BOUNDARY, 4).getTime() - BOUNDARY.getTime(), 120 * 60 * 1000);
  assert.equal(computeBillingOutboxNextAttemptAt(BOUNDARY, 5).getTime() - BOUNDARY.getTime(), 240 * 60 * 1000);
  // Un numero de intento grande queda acotado a 24h y nunca desborda.
  const capped = computeBillingOutboxNextAttemptAt(BOUNDARY, 40);
  assert.equal(capped.getTime() - BOUNDARY.getTime(), 24 * 60 * 60 * 1000);
  assert.ok(Number.isFinite(capped.getTime()));
});

test("15. dedupe key and backoff reject invalid inputs", () => {
  assert.throws(() => buildBillingOutboxDedupeKey({ ...BASE, boundary: new Date("invalid") }), /boundary/);
  assert.throws(() => computeBillingOutboxNextAttemptAt(new Date("invalid"), 1), /now/);
  assert.throws(() => computeBillingOutboxNextAttemptAt(BOUNDARY, 0), /attemptCount/);
});