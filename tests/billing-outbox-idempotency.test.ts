import "dotenv/config";
import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { applyOverdueLicenseRules } from "../src/domains/billing/billing.service";
import {
  __unsafeResetBillingOutboxTestHooks,
  __unsafeSetBillingOutboxTestHooks,
  dispatchBillingOutbox,
} from "../src/domains/billing/billing-outbox.service";
import { buildBillingOutboxDedupeKey } from "../src/domains/billing/billing-outbox-policy";

const RUN = `billing-outbox-${Date.now()}`;
const tenantIds = new Set<string>();
let seq = 0;
let fetchCalls = 0;
const realFetch = globalThis.fetch;
const previousResendKey = process.env.RESEND_API_KEY;
const past = () => new Date(Date.now() - 60 * 60 * 1000);
const future = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function mockResend(status = 200, id = `resend-${RUN}`) {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify(status < 300 ? { id } : { message: "sanitized" }), { status });
  }) as typeof fetch;
}

async function fixture(options: { status?: "ACTIVE" | "GRACE_PERIOD"; admin?: boolean } = {}) {
  const number = ++seq;
  const status = options.status ?? "ACTIVE";
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN} ${number}`, slug: `${RUN}-${number}`, units: 20, status },
  });
  tenantIds.add(tenant.id);
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id, status, unitsSnapshot: 20, priceCents: 100000, currency: "COP",
      currentPeriodStart: past(), currentPeriodEnd: status === "ACTIVE" ? past() : future(),
      graceEndsAt: status === "GRACE_PERIOD" ? past() : null,
    },
  });
  const admin = options.admin === false ? null : await prisma.user.create({
    data: {
      email: `${RUN}-${number}@example.test`, password: "x", name: "QA Admin",
      role: "ADMIN", tenantId: tenant.id, isActive: true,
    },
  });
  return { tenant, subscription, admin };
}

async function pending(input: {
  tenantId: string; subscriptionId: string; recipientUserId: string | null;
  channel: "IN_APP" | "EMAIL"; suffix: string;
}) {
  const boundary = new Date("2026-07-27T12:00:00.000Z");
  const eventType = "BILLING_GRACE_STARTED" as const;
  const dedupeKey = buildBillingOutboxDedupeKey({
    subscriptionId: `${input.subscriptionId}-${input.suffix}`, eventType, boundary,
    recipientUserId: input.recipientUserId ?? `missing-${input.suffix}`, channel: input.channel,
  });
  return prisma.billingNotificationOutbox.create({
    data: {
      tenantId: input.tenantId,
      subscriptionId: input.subscriptionId,
      recipientUserId: input.recipientUserId,
      channel: input.channel,
      eventType,
      dedupeKey,
      payload: { version: 1, graceDays: 5 },
    },
  });
}

before(async () => {
  await prisma.$connect();
  process.env.RESEND_API_KEY = "re_test_only_never_sent";
  mockResend();
});
afterEach(() => { __unsafeResetBillingOutboxTestHooks(); mockResend(); });
after(async () => {
  __unsafeResetBillingOutboxTestHooks();
  const ids = Array.from(tenantIds);
  await prisma.emailLog.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.billingNotificationOutbox.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: ids } } });
  await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
  globalThis.fetch = realFetch;
  if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousResendKey;
  await prisma.$disconnect();
});

test("1. transitions create audit and one durable intent per recipient/channel", async () => {
  const grace = await fixture();
  const graceSummary = await applyOverdueLicenseRules(null, { tenantIds: [grace.tenant.id] });
  const graceRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: grace.tenant.id } });
  assert.equal(graceSummary.movedToGracePeriod, 1);
  assert.equal(graceSummary.outboxCreation.created, 2);
  assert.deepEqual(new Set(graceRows.map((row) => row.channel)), new Set(["IN_APP", "EMAIL"]));
  assert.equal(await prisma.auditLog.count({ where: { tenantId: grace.tenant.id, action: "TENANT_OVERDUE_RULES_APPLIED" } }), 1);
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: grace.subscription.id } })).status, "GRACE_PERIOD");

  const suspended = await fixture({ status: "GRACE_PERIOD" });
  const suspendedSummary = await applyOverdueLicenseRules(null, { tenantIds: [suspended.tenant.id] });
  const suspendedRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: suspended.tenant.id } });
  assert.equal(suspendedSummary.movedToSuspended, 1);
  assert.equal(suspendedRows.length, 2);
  assert.ok(suspendedRows.every((row) => row.eventType === "BILLING_SUSPENDED"));
});

test("2. outbox failure rolls back the whole transition; no recipient remains a controlled success", async () => {
  const rollback = await fixture();
  __unsafeSetBillingOutboxTestHooks({ onStep: (step, context) => {
    if (step === "AFTER_OUTBOX_CREATED" && context.tenantId === rollback.tenant.id) throw new Error("TEST_ROLLBACK");
  } });
  const failed = await applyOverdueLicenseRules(null, { tenantIds: [rollback.tenant.id] });
  __unsafeResetBillingOutboxTestHooks();
  assert.equal(failed.errors, 1);
  assert.equal((await prisma.subscription.findUniqueOrThrow({ where: { id: rollback.subscription.id } })).status, "ACTIVE");
  assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: rollback.tenant.id } })).status, "ACTIVE");
  assert.equal(await prisma.auditLog.count({ where: { tenantId: rollback.tenant.id, action: "TENANT_OVERDUE_RULES_APPLIED" } }), 0);
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: rollback.tenant.id } }), 0);

  const noAdmin = await fixture({ admin: false });
  const controlled = await applyOverdueLicenseRules(null, { tenantIds: [noAdmin.tenant.id] });
  assert.equal(controlled.movedToGracePeriod, 1);
  assert.equal(controlled.outboxCreation.transitionsWithoutRecipients, 1);
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: noAdmin.tenant.id } }), 0);
});

test("3. concurrent crons and dispatchers produce one Notification and one provider fetch", async () => {
  const value = await fixture();
  mockResend(200, "concurrent-id");
  const [a, b] = await Promise.all([
    applyOverdueLicenseRules(null, { tenantIds: [value.tenant.id] }),
    applyOverdueLicenseRules(null, { tenantIds: [value.tenant.id] }),
  ]);
  assert.equal(a.movedToGracePeriod + b.movedToGracePeriod, 1);
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: value.tenant.id } }), 2);
  assert.equal(await prisma.notification.count({ where: { tenantId: value.tenant.id } }), 1);
  assert.equal(fetchCalls, 1);
  const before = await prisma.billingNotificationOutbox.count({ where: { tenantId: value.tenant.id } });
  await applyOverdueLicenseRules(null, { tenantIds: [value.tenant.id] });
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: value.tenant.id } }), before);

  const worker = await fixture();
  await pending({ tenantId: worker.tenant.id, subscriptionId: worker.subscription.id, recipientUserId: worker.admin!.id, channel: "EMAIL", suffix: "workers" });
  mockResend(200, "one-worker-id");
  const [first, second] = await Promise.all([
    dispatchBillingOutbox({ tenantIds: [worker.tenant.id] }),
    dispatchBillingOutbox({ tenantIds: [worker.tenant.id] }),
  ]);
  assert.equal(fetchCalls, 1);
  assert.equal(first.skippedConcurrentClaim + second.skippedConcurrentClaim, 1);
});

test("4. pending work survives a crash before dispatch and an empty cron drains it", async () => {
  const value = await fixture();
  __unsafeSetBillingOutboxTestHooks({ onStep: (step, context) => {
    if (step === "AFTER_OUTBOX_SELECTED" && context.outboxIds?.length) throw new Error("TEST_CRASH");
  } });
  const first = await applyOverdueLicenseRules(null, { tenantIds: [value.tenant.id] });
  assert.equal(first.movedToGracePeriod, 1);
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: value.tenant.id, status: "PENDING" } }), 2);
  __unsafeResetBillingOutboxTestHooks();
  mockResend(200, "later-id");
  const second = await applyOverdueLicenseRules(null, { tenantIds: [value.tenant.id] });
  assert.equal(second.movedToGracePeriod, 0);
  assert.equal(second.outboxDispatch.completedInApp, 1);
  assert.equal(second.outboxDispatch.completedEmail, 1);
});

test("5. IN_APP is exactly-once even if Notification already exists", async () => {
  const value = await fixture();
  const row = await pending({ tenantId: value.tenant.id, subscriptionId: value.subscription.id, recipientUserId: value.admin!.id, channel: "IN_APP", suffix: "existing" });
  await prisma.notification.create({
    data: { tenantId: value.tenant.id, userId: value.admin!.id, type: "LICENSE_EXPIRING", title: "Existing", message: "Existing", dedupeKey: row.dedupeKey },
  });
  const summary = await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  assert.equal(summary.internalDuplicates, 1);
  assert.equal(summary.completedInApp, 1);
  assert.equal(await prisma.notification.count({ where: { dedupeKey: row.dedupeKey } }), 1);
  await assert.rejects(() => prisma.notification.create({
    data: { tenantId: value.tenant.id, userId: value.admin!.id, type: "LICENSE_EXPIRING", title: "Duplicate", message: "Duplicate", dedupeKey: row.dedupeKey },
  }));
});

test("6. email success, retryable, final and missing-key outcomes are durable", async () => {
  const success = await fixture();
  const sent = await pending({ tenantId: success.tenant.id, subscriptionId: success.subscription.id, recipientUserId: success.admin!.id, channel: "EMAIL", suffix: "sent" });
  mockResend(200, "provider-id-bounded");
  const sentSummary = await dispatchBillingOutbox({ tenantIds: [success.tenant.id] });
  const sentLog = await prisma.emailLog.findUniqueOrThrow({ where: { outboxId: sent.id } });
  assert.equal(sentSummary.providerAttempts, 1);
  assert.equal(sentLog.status, "SENT");
  assert.equal(sentLog.providerMessageId, "provider-id-bounded");
  assert.equal(sentLog.attemptCount, 1);

  const temporary = await fixture();
  const retry = await pending({ tenantId: temporary.tenant.id, subscriptionId: temporary.subscription.id, recipientUserId: temporary.admin!.id, channel: "EMAIL", suffix: "retry" });
  mockResend(503);
  const retrySummary = await dispatchBillingOutbox({ tenantIds: [temporary.tenant.id] });
  const retryState = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: retry.id } });
  assert.equal(retrySummary.retriesScheduled, 1);
  assert.equal(retryState.status, "FAILED_RETRYABLE");
  mockResend(200, "retry-id");
  await dispatchBillingOutbox({ tenantIds: [temporary.tenant.id], now: new Date(retryState.nextAttemptAt.getTime() + 1) });
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: retry.id } })).status, "COMPLETED");

  const permanent = await fixture();
  const final = await pending({ tenantId: permanent.tenant.id, subscriptionId: permanent.subscription.id, recipientUserId: permanent.admin!.id, channel: "EMAIL", suffix: "final" });
  mockResend(400);
  await dispatchBillingOutbox({ tenantIds: [permanent.tenant.id] });
  const calls = fetchCalls;
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: final.id } })).status, "FAILED_FINAL");
  await dispatchBillingOutbox({ tenantIds: [permanent.tenant.id], now: new Date(Date.now() + 30 * 86400000) });
  assert.equal(fetchCalls, calls);

const exhausted = await fixture();
  const lastAttempt = await pending({ tenantId: exhausted.tenant.id, subscriptionId: exhausted.subscription.id, recipientUserId: exhausted.admin!.id, channel: "EMAIL", suffix: "max-attempt" });
  await prisma.billingNotificationOutbox.update({
    where: { id: lastAttempt.id },
    data: { status: "FAILED_RETRYABLE", attemptCount: 4, nextAttemptAt: new Date(0) },
  });
  mockResend(503);
  const exhaustedSummary = await dispatchBillingOutbox({ tenantIds: [exhausted.tenant.id] });
  assert.equal(exhaustedSummary.retriesScheduled, 0);
  assert.equal(exhaustedSummary.failedFinal, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: lastAttempt.id } })).status, "FAILED_FINAL");
  const noKey = await fixture();
  const keyless = await pending({ tenantId: noKey.tenant.id, subscriptionId: noKey.subscription.id, recipientUserId: noKey.admin!.id, channel: "EMAIL", suffix: "no-key" });
  delete process.env.RESEND_API_KEY;
  mockResend();
  await dispatchBillingOutbox({ tenantIds: [noKey.tenant.id] });
  process.env.RESEND_API_KEY = "re_test_only_never_sent";
  assert.equal(fetchCalls, 0);
  assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { outboxId: keyless.id } })).status, "FAILED_FINAL");
});

test("7. abandoned claims recover before provider and become DELIVERY_UNKNOWN after provider", async () => {
  const recoverable = await fixture();
  const before = await pending({ tenantId: recoverable.tenant.id, subscriptionId: recoverable.subscription.id, recipientUserId: recoverable.admin!.id, channel: "EMAIL", suffix: "before" });
  const old = new Date(Date.now() - 30 * 60 * 1000);
  await prisma.$transaction([
    prisma.billingNotificationOutbox.update({ where: { id: before.id }, data: { status: "PROCESSING", attemptCount: 1, lockedAt: old, processingStartedAt: old } }),
    prisma.billingOutboxAttempt.create({ data: { outboxId: before.id, attemptNumber: 1, status: "STARTED", startedAt: old } }),
  ]);
  mockResend(200, "recovered-id");
  await dispatchBillingOutbox({ tenantIds: [recoverable.tenant.id] });
  assert.equal(fetchCalls, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: before.id } })).status, "COMPLETED");

  const ambiguous = await fixture();
  const afterProvider = await pending({ tenantId: ambiguous.tenant.id, subscriptionId: ambiguous.subscription.id, recipientUserId: ambiguous.admin!.id, channel: "EMAIL", suffix: "after" });
  mockResend(200, "accepted-id");
  __unsafeSetBillingOutboxTestHooks({ onStep: (step, context) => {
    if (step === "AFTER_EMAIL_PROVIDER_RESPONSE" && context.outboxId === afterProvider.id) throw new Error("TEST_AFTER_PROVIDER");
  } });
  await dispatchBillingOutbox({ tenantIds: [ambiguous.tenant.id] });
  assert.equal(fetchCalls, 1);
  __unsafeResetBillingOutboxTestHooks();
  await prisma.billingNotificationOutbox.update({ where: { id: afterProvider.id }, data: { lockedAt: old } });
  const calls = fetchCalls;
  const summary = await dispatchBillingOutbox({ tenantIds: [ambiguous.tenant.id] });
  assert.equal(summary.deliveryUnknown, 1);
  assert.equal(fetchCalls, calls);
  assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { outboxId: afterProvider.id } })).status, "DELIVERY_UNKNOWN");
});

test("8. invalid cross-tenant recipient is final, does not block valid work, and summary has no email PII", async () => {
  const value = await fixture();
  const other = await fixture();
  const invalid = await pending({ tenantId: value.tenant.id, subscriptionId: value.subscription.id, recipientUserId: other.admin!.id, channel: "IN_APP", suffix: "cross" });
  const valid = await pending({ tenantId: value.tenant.id, subscriptionId: value.subscription.id, recipientUserId: value.admin!.id, channel: "IN_APP", suffix: "valid" });
  const summary = await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  assert.equal(summary.noValidRecipient, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: invalid.id } })).status, "FAILED_FINAL");
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: valid.id } })).status, "COMPLETED");
  assert.equal(await prisma.notification.count({ where: { tenantId: value.tenant.id } }), 1);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes(value.admin!.email), false);
  assert.equal(serialized.includes(other.admin!.email), false);
  const compatible = await applyOverdueLicenseRules(null, { tenantIds: [value.tenant.id] });
  assert.ok("movedToGracePeriod" in compatible && "movedToSuspended" in compatible && "externalEffects" in compatible);
});
test("9. summary limits sanitized error details and reports truncation", async () => {
  const value = await fixture();
  const boundary = new Date("2026-07-27T00:00:00.000Z");
  const rows = Array.from({ length: 51 }, (_, index) => ({
    tenantId: value.tenant.id,
    subscriptionId: value.subscription.id,
    recipientUserId: null,
    channel: "IN_APP" as const,
    eventType: "BILLING_GRACE_STARTED" as const,
    dedupeKey: buildBillingOutboxDedupeKey({
      subscriptionId: `${value.subscription.id}-summary-${index}`,
      eventType: "BILLING_GRACE_STARTED",
      boundary,
      recipientUserId: `missing-${index}`,
      channel: "IN_APP",
    }),
    payload: { version: 1, graceDays: 5 },
  }));
  await prisma.billingNotificationOutbox.createMany({ data: rows });
  const summary = await dispatchBillingOutbox({ tenantIds: [value.tenant.id], batchLimit: 51 });
  assert.equal(summary.failedFinal, 51);
  assert.equal(summary.noValidRecipient, 51);
  assert.equal(summary.errors, 51);
  assert.equal(summary.errorDetails.length, 50);
  assert.equal(summary.errorDetailsTruncated, true);
  assert.equal(JSON.stringify(summary).includes("@example.test"), false);
});

// FASE 2Q - pruebas adicionales de fencing, destinatarios y respuestas ambiguas.

test("10. a late worker cannot overwrite DELIVERY_UNKNOWN (real recovery fencing)", async () => {
  const value = await fixture();
  const row = await pending({
    tenantId: value.tenant.id, subscriptionId: value.subscription.id,
    recipientUserId: value.admin!.id, channel: "EMAIL", suffix: "fence",
  });
  mockResend(200, "late-success-id");
  let recovered = false;
  __unsafeSetBillingOutboxTestHooks({
    onStep: async (step, ctx) => {
      // A marco la frontera y recibio un exito del proveedor; queda detenido justo
      // antes de finalizar. En esa pausa, un segundo flujo ejecuta la RECUPERACION
      // REAL con el reloj avanzado mas alla del lease (10 min): la fila EMAIL con
      // providerAttemptStartedAt pasa a DELIVERY_UNKNOWN via el CAS de recuperacion.
      if (step === "BEFORE_OUTBOX_FINALIZE" && ctx.outboxId === row.id && !recovered) {
        recovered = true;
        __unsafeResetBillingOutboxTestHooks(); // evita recursion del seam en la recuperacion
        await dispatchBillingOutbox({
          tenantIds: [value.tenant.id],
          now: new Date(Date.now() + 11 * 60 * 1000),
        });
      }
    },
  });
  const summary = await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  __unsafeResetBillingOutboxTestHooks();

  assert.equal(fetchCalls, 1, "solo hubo un fetch (A); la recuperacion no reenvia");
  assert.equal(summary.completedEmail, 0, "A no reclama COMPLETED tras perder el ownership");
  const finalRow = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(finalRow.status, "DELIVERY_UNKNOWN", "la recuperacion real prevalece sobre el exito tardio de A");
  const finalLog = await prisma.emailLog.findUniqueOrThrow({ where: { outboxId: row.id } });
  assert.notEqual(finalLog.status, "SENT", "no se afirma SENT si se perdio el ownership");
  const attempt = await prisma.billingOutboxAttempt.findFirstOrThrow({ where: { outboxId: row.id, attemptNumber: 1 } });
  assert.equal(attempt.status, "DELIVERY_UNKNOWN", "el attempt conserva un resultado coherente");
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { id: row.id, status: "PROCESSING" } }), 0, "sin PROCESSING residual");
  // DELIVERY_UNKNOWN no es elegible para reintento en ninguna corrida futura.
  const retry = await dispatchBillingOutbox({ tenantIds: [value.tenant.id], now: new Date(Date.now() + 30 * 86400000) });
  assert.equal(retry.eligible, 0, "DELIVERY_UNKNOWN nunca se reintenta");
  assert.equal(fetchCalls, 1, "no hubo un segundo fetch");
});

test("11. inactive or removed recipients finalize as final without provider contact", async () => {
  const inactive = await fixture();
  const inactiveRow = await pending({
    tenantId: inactive.tenant.id, subscriptionId: inactive.subscription.id,
    recipientUserId: inactive.admin!.id, channel: "EMAIL", suffix: "inactive",
  });
  await prisma.user.update({ where: { id: inactive.admin!.id }, data: { isActive: false } });
  mockResend(200, "should-not-be-used");
  const inactiveSummary = await dispatchBillingOutbox({ tenantIds: [inactive.tenant.id] });
  assert.equal(fetchCalls, 0, "sin destinatario valido no se contacta al proveedor");
  assert.equal(inactiveSummary.noValidRecipient, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: inactiveRow.id } })).status, "FAILED_FINAL");

  // Usuario eliminado: la FK usa SET NULL, dejando recipientUserId nulo.
  const removed = await fixture();
  const removedRow = await pending({
    tenantId: removed.tenant.id, subscriptionId: removed.subscription.id,
    recipientUserId: removed.admin!.id, channel: "IN_APP", suffix: "removed",
  });
  await prisma.billingNotificationOutbox.update({ where: { id: removedRow.id }, data: { recipientUserId: null } });
  const removedSummary = await dispatchBillingOutbox({ tenantIds: [removed.tenant.id] });
  assert.equal(removedSummary.noValidRecipient, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: removedRow.id } })).status, "FAILED_FINAL");
  assert.equal(await prisma.notification.count({ where: { tenantId: removed.tenant.id } }), 0);
});

test("12. ambiguous provider responses become DELIVERY_UNKNOWN and never retry", async () => {
  async function runAmbiguous(suffix: string, fetchImpl: () => Promise<Response>) {
    const value = await fixture();
    const row = await pending({
      tenantId: value.tenant.id, subscriptionId: value.subscription.id,
      recipientUserId: value.admin!.id, channel: "EMAIL", suffix,
    });
    globalThis.fetch = (async () => { fetchCalls += 1; return fetchImpl(); }) as unknown as typeof fetch;
    fetchCalls = 0;
    await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
    assert.equal(fetchCalls, 1, `${suffix}: el proveedor se contacto una vez`);
    assert.equal(
      (await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status,
      "DELIVERY_UNKNOWN",
      `${suffix}: queda DELIVERY_UNKNOWN`
    );
    const retry = await dispatchBillingOutbox({ tenantIds: [value.tenant.id], now: new Date(Date.now() + 30 * 86400000) });
    assert.equal(retry.eligible, 0, `${suffix}: no reintenta`);
    return value;
  }

  // 2xx sin provider id.
  await runAmbiguous("no-id", async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  // 2xx con cuerpo ilegible.
  await runAmbiguous("unreadable", async () => new Response("<<not-json>>", { status: 200 }));
  // Timeout (AbortError).
  await runAmbiguous("timeout", async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); });
  // Error de red generico.
  await runAmbiguous("network", async () => { throw new Error("ECONNRESET"); });
});

// FASE 2S - cierre de R-01: ventanas reales que faltaban por provocar.

test("13. two concurrent dispatchers on one IN_APP row: exactly one claim and one Notification", async () => {
  const value = await fixture();
  const row = await pending({
    tenantId: value.tenant.id, subscriptionId: value.subscription.id,
    recipientUserId: value.admin!.id, channel: "IN_APP", suffix: "two-inapp",
  });

  // Barrera determinista: ambos dispatchers seleccionan la MISMA fila antes de reclamar.
  let readers = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => { release = resolve; });
  __unsafeSetBillingOutboxTestHooks({
    onStep: async (step, ctx) => {
      if (step === "AFTER_OUTBOX_SELECTED" && ctx.outboxIds?.includes(row.id)) {
        readers += 1;
        if (readers === 2) release();
        await barrier;
      }
    },
  });

  let a; let b;
  try {
    [a, b] = await Promise.all([
      dispatchBillingOutbox({ tenantIds: [value.tenant.id] }),
      dispatchBillingOutbox({ tenantIds: [value.tenant.id] }),
    ]);
  } finally {
    release();
    __unsafeResetBillingOutboxTestHooks();
  }

  assert.equal(readers, 2, "ambos dispatchers seleccionaron la misma fila antes del claim");
  assert.equal(a.claimed + b.claimed, 1, "exactamente un claim ganado");
  assert.equal(a.skippedConcurrentClaim + b.skippedConcurrentClaim, 1, "el otro reporta claim perdido");
  assert.equal(a.completedInApp + b.completedInApp, 1, "una sola finalizacion valida");
  assert.equal(await prisma.notification.count({ where: { dedupeKey: row.dedupeKey } }), 1, "exactamente una Notification");
  assert.equal(await prisma.auditLog.count({ where: { tenantId: value.tenant.id, action: "NOTIFICATION_CREATED" } }), 1, "un solo AuditLog de Notification");
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "COMPLETED");
  assert.equal(await prisma.billingOutboxAttempt.count({ where: { outboxId: row.id } }), 1, "un solo attempt, sin dos con el mismo numero");
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { id: row.id, status: "PROCESSING" } }), 0, "sin PROCESSING residual");
});

test("14. a crash after Notification (before finalize) rolls back atomically; retry completes once", async () => {
  const value = await fixture();
  const row = await pending({
    tenantId: value.tenant.id, subscriptionId: value.subscription.id,
    recipientUserId: value.admin!.id, channel: "IN_APP", suffix: "rollback-notif",
  });
  __unsafeSetBillingOutboxTestHooks({
    onStep: (step, ctx) => {
      if (step === "AFTER_NOTIFICATION_CREATE" && ctx.outboxId === row.id) throw new Error("TEST_CRASH_AFTER_NOTIFICATION");
    },
  });
  await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  __unsafeResetBillingOutboxTestHooks();

  // Notification y finalizacion comparten transaccion: el throw revierte AMBAS.
  assert.equal(await prisma.notification.count({ where: { dedupeKey: row.dedupeKey } }), 0, "Notification revertida");
  assert.equal(await prisma.auditLog.count({ where: { tenantId: value.tenant.id, action: "NOTIFICATION_CREATED" } }), 0, "sin AuditLog de Notification");
  const afterCrash = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  assert.notEqual(afterCrash.status, "COMPLETED", "outbox no quedo COMPLETED");
  const attemptAfterCrash = await prisma.billingOutboxAttempt.findFirst({ where: { outboxId: row.id, attemptNumber: 1 } });
  assert.notEqual(attemptAfterCrash?.status, "COMPLETED", "attempt no quedo COMPLETED");

  // Un retry posterior crea exactamente una Notification y completa el outbox.
  const retry = await dispatchBillingOutbox({ tenantIds: [value.tenant.id], now: new Date(afterCrash.nextAttemptAt.getTime() + 1) });
  assert.equal(retry.completedInApp, 1);
  assert.equal(await prisma.notification.count({ where: { dedupeKey: row.dedupeKey } }), 1, "exactamente una Notification tras el retry");
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "COMPLETED");
});

test("15. a crash after the provider marker (before fetch) recovers as DELIVERY_UNKNOWN", async () => {
  const value = await fixture();
  const row = await pending({
    tenantId: value.tenant.id, subscriptionId: value.subscription.id,
    recipientUserId: value.admin!.id, channel: "EMAIL", suffix: "post-marker",
  });
  mockResend(200, "should-not-be-fetched");
  fetchCalls = 0;
  __unsafeSetBillingOutboxTestHooks({
    onStep: (step, ctx) => {
      if (step === "AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED" && ctx.outboxId === row.id) throw new Error("TEST_CRASH_POST_MARKER");
    },
  });
  await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  __unsafeResetBillingOutboxTestHooks();

  assert.equal(fetchCalls, 0, "el fetch nunca ocurrio");
  const marked = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  assert.ok(marked.providerAttemptStartedAt instanceof Date, "la frontera quedo persistida (durable)");
  assert.equal(marked.status, "PROCESSING", "la fila sigue PROCESSING hasta que venza el lease");

  // Recuperacion REAL (reloj mas alla del lease) -> DELIVERY_UNKNOWN, sin fetch.
  const recovery = await dispatchBillingOutbox({ tenantIds: [value.tenant.id], now: new Date(Date.now() + 11 * 60 * 1000) });
  assert.equal(recovery.deliveryUnknown, 1);
  assert.equal(fetchCalls, 0, "la recuperacion no llama al proveedor");
  const recovered = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(recovered.status, "DELIVERY_UNKNOWN", "no vuelve a PENDING");
  assert.equal((await prisma.emailLog.findUniqueOrThrow({ where: { outboxId: row.id } })).status, "DELIVERY_UNKNOWN");
  assert.equal((await prisma.billingOutboxAttempt.findFirstOrThrow({ where: { outboxId: row.id, attemptNumber: 1 } })).status, "DELIVERY_UNKNOWN");

  // Ninguna corrida posterior reintenta ni contacta al proveedor.
  const retry = await dispatchBillingOutbox({ tenantIds: [value.tenant.id], now: new Date(Date.now() + 30 * 86400000) });
  assert.equal(retry.eligible, 0);
  assert.equal(fetchCalls, 0);
});

test("16. a real User deletion applies SET NULL and finalizes as FAILED_FINAL without blocking others", async () => {
  const deleted = await fixture();
  const survivor = await fixture();
  const deletedRow = await pending({
    tenantId: deleted.tenant.id, subscriptionId: deleted.subscription.id,
    recipientUserId: deleted.admin!.id, channel: "EMAIL", suffix: "user-del",
  });
  const survivorRow = await pending({
    tenantId: survivor.tenant.id, subscriptionId: survivor.subscription.id,
    recipientUserId: survivor.admin!.id, channel: "IN_APP", suffix: "user-keep",
  });
  const deletedEmail = deleted.admin!.email;

  // Eliminacion REAL del User en PostgreSQL (no un update de recipientUserId).
  await prisma.user.delete({ where: { id: deleted.admin!.id } });
  const dbRow = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: deletedRow.id } });
  assert.equal(dbRow.recipientUserId, null, "la FK SetNull dejo recipientUserId nulo y conservo la fila");

  mockResend(200, "should-not-be-used");
  fetchCalls = 0;
  const summary = await dispatchBillingOutbox({ tenantIds: [deleted.tenant.id, survivor.tenant.id] });

  assert.equal(fetchCalls, 0, "sin destinatario valido no se contacta al proveedor");
  assert.equal(summary.noValidRecipient, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: deletedRow.id } })).status, "FAILED_FINAL");
  assert.equal(await prisma.notification.count({ where: { tenantId: deleted.tenant.id } }), 0, "sin Notification para el eliminado");
  assert.equal(await prisma.emailLog.count({ where: { outboxId: deletedRow.id } }), 0, "sin EmailLog para un destinatario ausente");
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: survivorRow.id } })).status, "COMPLETED", "el lote continua con la fila valida");
  assert.equal(await prisma.notification.count({ where: { tenantId: survivor.tenant.id } }), 1);
  assert.equal(JSON.stringify(summary).includes(deletedEmail), false, "el resumen no filtra el email eliminado");
});

test("17. EmailLog uniques (outboxId, dedupeKey) are enforced by PostgreSQL", async () => {
  const value = await fixture();
  const row = await pending({
    tenantId: value.tenant.id, subscriptionId: value.subscription.id,
    recipientUserId: value.admin!.id, channel: "EMAIL", suffix: "email-unique",
  });
  mockResend(200, "email-unique-id");
  await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });

  assert.equal(await prisma.emailLog.count({ where: { outboxId: row.id } }), 1, "una sola fila EmailLog por intencion");
  const log = await prisma.emailLog.findUniqueOrThrow({ where: { outboxId: row.id } });
  assert.equal(log.status, "SENT");
  // Restriccion real de PostgreSQL: no se puede duplicar por outboxId ni dedupeKey.
  await assert.rejects(
    () => prisma.emailLog.create({ data: { tenantId: value.tenant.id, recipient: "dup@example.test", template: "license-status-change", provider: "RESEND", outboxId: row.id, status: "PENDING" } }),
    /P2002|nique/,
    "unique outboxId real"
  );
  await assert.rejects(
    () => prisma.emailLog.create({ data: { tenantId: value.tenant.id, recipient: "dup2@example.test", template: "license-status-change", provider: "RESEND", dedupeKey: log.dedupeKey, status: "PENDING" } }),
    /P2002|nique/,
    "unique dedupeKey real"
  );
});

test("18. a real BillingOutboxAttempt unique conflict reverts the claim atomically", async () => {
  const value = await fixture();
  const row = await pending({
    tenantId: value.tenant.id, subscriptionId: value.subscription.id,
    recipientUserId: value.admin!.id, channel: "IN_APP", suffix: "attempt-unique",
  });
  // Pre-inserta el attempt #1 para forzar un conflicto real de @@unique([outboxId, attemptNumber]).
  await prisma.billingOutboxAttempt.create({ data: { outboxId: row.id, attemptNumber: 1, status: "STARTED" } });
  const before = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(before.status, "PENDING");
  assert.equal(before.attemptCount, 0);

  // El claim intenta crear el attempt #1 (attemptCount 0 -> 1) y choca con el unique;
  // claim y Attempt comparten transaccion, asi que TODO revierte.
  const conflict = await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  assert.ok(conflict.errors >= 1, "el conflicto se reporta como error de claim");
  const afterConflict = await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(afterConflict.status, "PENDING", "el claim revirtio: sigue PENDING");
  assert.equal(afterConflict.attemptCount, 0, "attemptCount no se incremento sin un Attempt propio");
  assert.equal(await prisma.billingOutboxAttempt.count({ where: { outboxId: row.id } }), 1, "solo el attempt pre-insertado, sin duplicado");

  // Tras limpiar el conflicto, un intento posterior limpio funciona.
  await prisma.billingOutboxAttempt.deleteMany({ where: { outboxId: row.id } });
  const retry = await dispatchBillingOutbox({ tenantIds: [value.tenant.id] });
  assert.equal(retry.completedInApp, 1);
  assert.equal((await prisma.billingNotificationOutbox.findUniqueOrThrow({ where: { id: row.id } })).status, "COMPLETED");
  assert.equal(await prisma.billingOutboxAttempt.count({ where: { outboxId: row.id, status: "COMPLETED" } }), 1);
});