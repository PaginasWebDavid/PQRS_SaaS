import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyWompiWebhookSignature } from "../../src/domains/billing/wompi.service";

const EVENTS_SECRET = "test_events_wompi";

function eventFixture(overrides: Record<string, unknown> = {}) {
  const transaction = {
    id: "wompi-test-123",
    status: "APPROVED",
    amount_in_cents: 9500000,
    reference: "WOMPI_payment_123",
    currency: "COP",
  };
  const timestamp = 1720000000;
  const properties = ["transaction.reference", "transaction.amount_in_cents", "transaction.status"];
  const checksum = crypto.createHash("sha256").update(`${transaction.reference}${transaction.amount_in_cents}${transaction.status}${timestamp}${EVENTS_SECRET}`).digest("hex");
  return {
    event: "transaction.updated",
    environment: "test",
    timestamp,
    data: { transaction },
    signature: { properties, checksum },
    ...overrides,
  };
}

test("verifica un evento Wompi con propiedades dinamicas", () => {
  assert.equal(verifyWompiWebhookSignature(eventFixture(), EVENTS_SECRET), true);
});

test("rechaza un valor firmado que fue alterado", () => {
  const payload = eventFixture();
  (payload.data.transaction as { amount_in_cents: number }).amount_in_cents = 1;
  assert.equal(verifyWompiWebhookSignature(payload, EVENTS_SECRET), false);
});

test("rechaza una propiedad ausente o no permitida", () => {
  const payload = eventFixture();
  (payload.signature as { properties: string[] }).properties = ["transaction.id", "transaction.__proto__"];
  assert.equal(verifyWompiWebhookSignature(payload, EVENTS_SECRET), false);
});
