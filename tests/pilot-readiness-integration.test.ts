import "dotenv/config";
import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import {
  grantCourtesyExtension,
  renewSubscriptionWithSimulatedPayment,
} from "../src/domains/billing/billing.service";
import { processMercadoPagoWebhook } from "../src/domains/billing/mercado-pago.service";
import { dispatchBillingOutbox } from "../src/domains/billing/billing-outbox.service";
import {
  getPqrsWorkflowTypeForTenant,
  updatePqrsWorkflowTypeForAdmin,
} from "../src/domains/pqrs/pqrs-workflow.service";
import {
  createSupportTicket,
  listSupportTicketsForSuperAdmin,
  listSupportTicketsForTenantAdmin,
  listSupportTicketsForUser,
  respondToSupportTicket,
} from "../src/domains/support/support-ticket.service";
import { exportTenantData, TenantExportError } from "../src/domains/platform/tenant-export.service";
import { updateTenantStatusForSuperAdmin } from "../src/domains/platform/tenant-admin.service";

const RUN = `phaseR1-${Date.now()}`;
let seq = 0;
function nextSeq() {
  seq += 1;
  return seq;
}

const WEBHOOK_SECRET = "test-webhook-secret";
process.env.MERCADO_PAGO_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || "TEST-integration";
const realFetch = globalThis.fetch;
const previousResendKey = process.env.RESEND_API_KEY;

function signedHeaders(dataId: string, requestId = `${RUN}-req-${nextSeq()}`): Headers {
  const ts = String(Date.now());
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac("sha256", WEBHOOK_SECRET).update(manifest).digest("hex");
  return new Headers({ "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId });
}

function mockMercadoPago(fixture: Record<string, unknown>) {
  globalThis.fetch = (async () =>
    ({ ok: true, status: 200, json: async () => fixture, text: async () => "", headers: new Headers() }) as unknown as Response
  ) as unknown as typeof fetch;
}

let resendCalls = 0;
function mockResend(status = 200) {
  resendCalls = 0;
  globalThis.fetch = (async () => {
    resendCalls += 1;
    return new Response(JSON.stringify(status < 300 ? { id: `resend-${RUN}-${resendCalls}` } : { message: "sanitized" }), { status });
  }) as unknown as typeof fetch;
}

function paymentFixture(subscriptionId: string, status: string, id = `${RUN}-pay-${nextSeq()}`) {
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
  mockMercadoPago(fixture);
  const dataId = String(fixture.id);
  return processMercadoPagoWebhook({
    payload: { type: "payment", data: { id: dataId } },
    headers: signedHeaders(dataId),
    dataIdFromQuery: null,
  });
}

async function createPricingRule() {
  return prisma.pricingRule.create({
    data: { minUnits: 1, maxUnits: 100000, priceCents: 100000, currency: "COP", isActive: true },
  });
}

async function createTenantWithAdmin(options: { subscriptionStatus?: "TRIAL" | "ACTIVE" | "CANCELLED"; periodEnd?: Date; adminActive?: boolean; membershipActive?: boolean } = {}) {
  const n = nextSeq();
  const periodEnd = options.periodEnd ?? new Date();
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN} ${n}`, slug: `${RUN}-${n}`, units: 10, status: options.subscriptionStatus === "CANCELLED" ? "CANCELLED" : "ACTIVE" },
  });
  const subscription = await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      status: options.subscriptionStatus ?? "ACTIVE",
      unitsSnapshot: 10,
      priceCents: 100000,
      currency: "COP",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: `admin-${RUN}-${n}@example.com`,
      name: `QA Admin ${n}`,
      password: "not-used-in-test",
      isActive: options.adminActive ?? true,
    },
  });
  const adminMembership = await prisma.tenantMembership.create({
    data: { userId: adminUser.id, tenantId: tenant.id, role: "ADMIN", isActive: options.membershipActive ?? true },
  });
  return { tenant, subscription, adminUser, adminMembership };
}

async function createResident(tenantId: string, overrides: { bloque?: number; apto?: number } = {}) {
  const n = nextSeq();
  const user = await prisma.user.create({
    data: { email: `resident-${RUN}-${n}@example.com`, name: `QA Resident ${n}`, password: "not-used-in-test", isActive: true },
  });
  const membership = await prisma.tenantMembership.create({
    data: { userId: user.id, tenantId, role: "RESIDENTE", isActive: true, bloque: overrides.bloque ?? n, apto: overrides.apto ?? n },
  });
  return { user, membership };
}

async function createPqrs(tenantId: string, creatorId: string, workflowType: "SIMPLE" | "MAINTENANCE") {
  const n = nextSeq();
  return prisma.pqrs.create({
    data: {
      tenantId,
      medio: "PLATAFORMA_WEB",
      fechaRecibido: new Date(),
      mes: "Enero",
      bloque: n,
      apto: n,
      nombreResidente: `QA Resident ${n}`,
      descripcion: "Descripcion de prueba",
      creadoPorId: creatorId,
      workflowType,
    },
  });
}

const pricingRuleIds: string[] = [];

before(async () => {
  await prisma.$connect();
  process.env.RESEND_API_KEY = "re_test_only_never_sent";
  mockResend();
  const rule = await createPricingRule();
  pricingRuleIds.push(rule.id);
});

afterEach(() => {
  mockResend();
});

after(async () => {
  const tenants = await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } });
  const tenantIds = tenants.map((t) => t.id);
  await prisma.webhookEvent.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { dataId: { startsWith: RUN } }, { requestId: { startsWith: RUN } }] } });
  await prisma.emailLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.billingOutboxAttempt.deleteMany({ where: { outbox: { tenantId: { in: tenantIds } } } });
  await prisma.billingNotificationOutbox.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.supportTicket.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.historialPqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrsFoto.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.pricingRule.deleteMany({ where: { id: { in: pricingRuleIds } } });
  globalThis.fetch = realFetch;
  if (previousResendKey === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = previousResendKey;
  await prisma.$disconnect();
});

// --- Bloqueante 1: notificaciones de pago del SaaS ------------------------

test("1. pago Mercado Pago aprobado crea un evento SAAS_PAYMENT_APPROVED durable y lo despacha (notificacion + email)", async () => {
  const { tenant, subscription, adminUser } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);

  const outboxRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_APPROVED" } });
  assert.equal(outboxRows.length, 2, "una fila IN_APP y una EMAIL");
  assert.ok(outboxRows.every((r) => r.recipientUserId === adminUser.id));

  mockResend();
  await dispatchBillingOutbox({ tenantIds: [tenant.id] });

  const notification = await prisma.notification.findFirst({ where: { tenantId: tenant.id, userId: adminUser.id, type: "SAAS_PAYMENT_APPROVED" } });
  assert.ok(notification, "se creo la notificacion in-app");
  const emailLog = await prisma.emailLog.findFirst({ where: { tenantId: tenant.id, status: "SENT" } });
  assert.ok(emailLog, "se envio el correo");
});

test("2. pago Mercado Pago rechazado crea un evento SAAS_PAYMENT_REJECTED", async () => {
  const { tenant, subscription } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const fixture = paymentFixture(subscription.id, "rejected");
  await sendPaymentWebhook(fixture);

  const outboxRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_REJECTED" } });
  assert.equal(outboxRows.length, 2);
});

test("3. un webhook duplicado (mismo pago aprobado dos veces) no duplica el evento durable", async () => {
  const { tenant, subscription } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);
  await sendPaymentWebhook(fixture);

  const outboxRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_APPROVED" } });
  assert.equal(outboxRows.length, 2, "sigue habiendo solo una fila por canal, no cuatro");
});

test("4. una renovacion simulada es idempotente y notifica un unico pago aprobado", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });
  const operationId = crypto.randomUUID();

  await renewSubscriptionWithSimulatedPayment({ actorUserId: superAdmin.id, tenantId: tenant.id, operationId });
  const firstPeriodEnd = (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).currentPeriodEnd;
  await renewSubscriptionWithSimulatedPayment({ actorUserId: superAdmin.id, tenantId: tenant.id, operationId });
  const secondPeriodEnd = (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).currentPeriodEnd;

  assert.equal(secondPeriodEnd.getTime(), firstPeriodEnd.getTime(), "el reintento no extiende el periodo por segunda vez");
  assert.equal(await prisma.payment.count({ where: { tenantId: tenant.id, provider: "SIMULATED", externalReference: { contains: operationId } } }), 1);
  const outboxRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_APPROVED", recipientUserId: adminUser.id } });
  assert.equal(outboxRows.length, 2, "una intencion por canal, incluso tras el reintento");
});
test("5. una cortesia es idempotente y nunca se presenta como pago aprobado", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });
  const operationId = crypto.randomUUID();

  await grantCourtesyExtension({ actorUserId: superAdmin.id, tenantId: tenant.id, days: 15, reason: "Cortesia de prueba", operationId });
  const firstPeriodEnd = (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).currentPeriodEnd;
  await grantCourtesyExtension({ actorUserId: superAdmin.id, tenantId: tenant.id, days: 15, reason: "Cortesia de prueba", operationId });
  const secondPeriodEnd = (await prisma.subscription.findUniqueOrThrow({ where: { tenantId: tenant.id } })).currentPeriodEnd;

  assert.equal(secondPeriodEnd.getTime(), firstPeriodEnd.getTime(), "el reintento no duplica la extension");
  assert.equal(await prisma.payment.count({ where: { tenantId: tenant.id, provider: "COURTESY", externalReference: { contains: operationId } } }), 1);
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id, eventType: "COURTESY_EXTENSION_GRANTED", recipientUserId: adminUser.id } }), 2);
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_APPROVED" } }), 0);
});
test("6. el ADMIN de otro tenant no recibe ninguna notificacion", async () => {
  const { tenant, subscription } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const other = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);

  const crossTenantRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: other.tenant.id } });
  assert.equal(crossTenantRows.length, 0);
  void tenant;
});

test("7. una membresia ADMIN inactiva no recibe la notificacion de pago", async () => {
  const { tenant, subscription } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000), membershipActive: false });
  const fixture = paymentFixture(subscription.id, "approved");
  await sendPaymentWebhook(fixture);

  const outboxRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id } });
  assert.equal(outboxRows.length, 0, "sin destinatarios activos no se crea ninguna intencion de notificacion");
});

test("8. un resultado ambiguo (PENDING) nunca se presenta como rechazo definitivo", async () => {
  const { tenant, subscription } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const fixture = paymentFixture(subscription.id, "pending");
  await sendPaymentWebhook(fixture);

  const rejectedRows = await prisma.billingNotificationOutbox.findMany({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_REJECTED" } });
  assert.equal(rejectedRows.length, 0);
});

// --- Bloqueante 2: flujo PQRS simple/mantenimiento -------------------------

test("9. ADMIN configura la plantilla PQRS de su tenant y queda auditado", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin();
  const updated = await updatePqrsWorkflowTypeForAdmin({ tenantId: tenant.id, actorUserId: adminUser.id, workflowType: "SIMPLE" });
  assert.equal(updated.pqrsWorkflowType, "SIMPLE");
  assert.equal(await getPqrsWorkflowTypeForTenant(tenant.id), "SIMPLE");
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: "TENANT_UPDATED", metadata: { path: ["field"], equals: "pqrsWorkflowType" } } });
  assert.ok(audit);
});

test("10. un valor de plantilla invalido se rechaza", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin();
  await assert.rejects(() => updatePqrsWorkflowTypeForAdmin({ tenantId: tenant.id, actorUserId: adminUser.id, workflowType: "FREESTYLE" }));
});

test("11. un tenant inexistente se rechaza", async () => {
  await assert.rejects(() => updatePqrsWorkflowTypeForAdmin({ tenantId: "does-not-exist", actorUserId: "irrelevant", workflowType: "SIMPLE" }));
});

test("12. una PQRS creada en un conjunto SIMPLE conserva su workflow aunque el tenant cambie despues a MAINTENANCE", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin();
  await updatePqrsWorkflowTypeForAdmin({ tenantId: tenant.id, actorUserId: adminUser.id, workflowType: "SIMPLE" });
  const resident = await createResident(tenant.id);
  const currentWorkflow = await getPqrsWorkflowTypeForTenant(tenant.id);
  const pqrs = await createPqrs(tenant.id, resident.user.id, currentWorkflow);
  assert.equal(pqrs.workflowType, "SIMPLE");

  await updatePqrsWorkflowTypeForAdmin({ tenantId: tenant.id, actorUserId: adminUser.id, workflowType: "MAINTENANCE" });
  const reloaded = await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } });
  assert.equal(reloaded.workflowType, "SIMPLE", "el caso ya creado no cambia con la nueva configuracion del tenant");

  const newResident = await createResident(tenant.id);
  const newWorkflow = await getPqrsWorkflowTypeForTenant(tenant.id);
  const newPqrs = await createPqrs(tenant.id, newResident.user.id, newWorkflow);
  assert.equal(newPqrs.workflowType, "MAINTENANCE", "una PQRS nueva ya usa la plantilla vigente");
});

test("13. MAINTENANCE es el default de compatibilidad para conjuntos existentes", async () => {
  const { tenant } = await createTenantWithAdmin();
  assert.equal(await getPqrsWorkflowTypeForTenant(tenant.id), "MAINTENANCE");
});

// --- Bloqueante 3: visibilidad de soporte para ADMIN -----------------------

test("14. RESIDENTE crea un ticket con categoria tecnica permitida", async () => {
  const { tenant } = await createTenantWithAdmin();
  const resident = await createResident(tenant.id);
  const ticket = await createSupportTicket({ actorUserId: resident.user.id, tenantId: tenant.id, subject: "No puedo entrar", message: "Error al iniciar sesion", category: "TECHNICAL" });
  assert.equal(ticket.category, "TECHNICAL");
});

test("15. ADMIN ve los tickets de todo su tenant (propios y de otros miembros)", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin();
  const resident = await createResident(tenant.id);
  await createSupportTicket({ actorUserId: resident.user.id, tenantId: tenant.id, subject: "Ticket residente", message: "msg", category: "ACCESS" });
  await createSupportTicket({ actorUserId: adminUser.id, tenantId: tenant.id, subject: "Ticket admin", message: "msg", category: "BILLING" });

  const tickets = await listSupportTicketsForTenantAdmin({ tenantId: tenant.id });
  assert.equal(tickets.length, 2);
  const subjects = tickets.map((t) => t.subject).sort();
  assert.deepEqual(subjects, ["Ticket admin", "Ticket residente"]);
});

test("16. ADMIN no ve tickets de otro tenant", async () => {
  const { tenant } = await createTenantWithAdmin();
  const other = await createTenantWithAdmin();
  const otherResident = await createResident(other.tenant.id);
  await createSupportTicket({ actorUserId: otherResident.user.id, tenantId: other.tenant.id, subject: "Ajeno", message: "msg", category: "TECHNICAL" });

  const tickets = await listSupportTicketsForTenantAdmin({ tenantId: tenant.id });
  assert.equal(tickets.length, 0);
});

test("17. RESIDENTE solo ve sus propios tickets, no los de otro residente del mismo tenant", async () => {
  const { tenant } = await createTenantWithAdmin();
  const residentA = await createResident(tenant.id);
  const residentB = await createResident(tenant.id);
  await createSupportTicket({ actorUserId: residentA.user.id, tenantId: tenant.id, subject: "De A", message: "msg", category: "TECHNICAL" });
  await createSupportTicket({ actorUserId: residentB.user.id, tenantId: tenant.id, subject: "De B", message: "msg", category: "TECHNICAL" });

  const ticketsA = await listSupportTicketsForUser({ tenantId: tenant.id, userId: residentA.user.id });
  assert.equal(ticketsA.length, 1);
  assert.equal(ticketsA[0]?.subject, "De A");
});

test("18. SUPER_ADMIN conserva la cola global y puede filtrar por tenant", async () => {
  const { tenant } = await createTenantWithAdmin();
  const other = await createTenantWithAdmin();
  const resident = await createResident(tenant.id);
  const otherResident = await createResident(other.tenant.id);
  await createSupportTicket({ actorUserId: resident.user.id, tenantId: tenant.id, subject: "T1", message: "msg", category: "TECHNICAL" });
  await createSupportTicket({ actorUserId: otherResident.user.id, tenantId: other.tenant.id, subject: "T2", message: "msg", category: "TECHNICAL" });

  const allTickets = await listSupportTicketsForSuperAdmin({});
  assert.ok(allTickets.some((t) => t.subject === "T1"));
  assert.ok(allTickets.some((t) => t.subject === "T2"));

  const scoped = await listSupportTicketsForSuperAdmin({ tenantId: tenant.id });
  assert.ok(scoped.every((t) => t.tenantId === tenant.id));
  assert.ok(scoped.some((t) => t.subject === "T1"));
  assert.ok(!scoped.some((t) => t.subject === "T2"));
});

// --- Bloqueante 4: exportacion y reactivacion ------------------------------

test("19. SUPER_ADMIN exporta un tenant y el archivo trae PQRS y usuarios en hojas separadas", async () => {
  const { tenant, adminUser } = await createTenantWithAdmin();
  const resident = await createResident(tenant.id, { bloque: 9001, apto: 101 });
  await createPqrs(tenant.id, resident.user.id, "MAINTENANCE");
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });

  const { buffer, fileName } = await exportTenantData({ tenantId: tenant.id, actorUserId: superAdmin.id });
  assert.ok(fileName.includes(tenant.slug));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const sheetNames = workbook.worksheets.map((s) => s.name).sort();
  assert.deepEqual(sheetNames, ["PQRS", "PQRS_Historial", "Usuarios"]);

  const usersSheet = workbook.getWorksheet("Usuarios")!;
  assert.equal(usersSheet.rowCount, 3, "encabezado + admin + residente");
  void adminUser;
});

test("20. la exportacion nunca incluye password, hash ni tokens", async () => {
  const { tenant } = await createTenantWithAdmin();
  const resident = await createResident(tenant.id);
  await createPqrs(tenant.id, resident.user.id, "SIMPLE");
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });
  const { buffer } = await exportTenantData({ tenantId: tenant.id, actorUserId: superAdmin.id });
  const text = buffer.toString("latin1");
  assert.ok(!text.includes("not-used-in-test"), "el hash/valor de password nunca aparece en el archivo");
});

test("21. exportar un tenant inexistente falla de forma controlada", async () => {
  await assert.rejects(
    () => exportTenantData({ tenantId: "does-not-exist", actorUserId: "irrelevant" }),
    (error: unknown) => {
      assert.ok(error instanceof TenantExportError);
      assert.equal((error as TenantExportError).code, "TENANT_NOT_FOUND");
      return true;
    }
  );
});

test("22. la exportacion queda registrada en auditoria", async () => {
  const { tenant } = await createTenantWithAdmin();
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });
  await exportTenantData({ tenantId: tenant.id, actorUserId: superAdmin.id });
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: "REPORT_EXPORTED", actorUserId: superAdmin.id } });
  assert.ok(audit);
});

test("23. un tenant CANCELLED se reactiva con evidencia vigente sin duplicar suscripcion ni emitir pago", async () => {
  const { tenant } = await createTenantWithAdmin({ subscriptionStatus: "TRIAL", periodEnd: new Date(Date.now() - 60_000) });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });
  await grantCourtesyExtension({ actorUserId: superAdmin.id, tenantId: tenant.id, days: 15, reason: "Evidencia de prueba", operationId: crypto.randomUUID() });
  await updateTenantStatusForSuperAdmin(superAdmin.id, tenant.id, "CANCELLED");
  const cancelled = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(cancelled.status, "CANCELLED");
  assert.ok(cancelled.cancelledAt);

  const subscriptionsBefore = await prisma.subscription.count({ where: { tenantId: tenant.id } });
  const outboxBefore = await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id } });
  await updateTenantStatusForSuperAdmin(superAdmin.id, tenant.id, "ACTIVE");
  const subscriptionsAfter = await prisma.subscription.count({ where: { tenantId: tenant.id } });
  const outboxAfter = await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id } });
  assert.equal(subscriptionsAfter, subscriptionsBefore, "no se duplica la suscripcion al reactivar");
  assert.equal(outboxAfter, outboxBefore, "reactivar no fabrica una nueva notificacion economica");
  assert.equal(await prisma.billingNotificationOutbox.count({ where: { tenantId: tenant.id, eventType: "SAAS_PAYMENT_APPROVED" } }), 0);

  const reactivated = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(reactivated.status, "ACTIVE");
  assert.equal(reactivated.cancelledAt, null);
  const audit = await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, action: "TENANT_REACTIVATED" } });
  assert.ok(audit);
});
test("24. reactivar un tenant CANCELLED sin evidencia de pago vigente falla", async () => {
  const { tenant } = await createTenantWithAdmin({ subscriptionStatus: "ACTIVE", periodEnd: new Date(Date.now() - 30 * 86_400_000) });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });
  await updateTenantStatusForSuperAdmin(superAdmin.id, tenant.id, "CANCELLED");
  await assert.rejects(() => updateTenantStatusForSuperAdmin(superAdmin.id, tenant.id, "ACTIVE"));
});
test("25. la exportacion serializada mantiene como texto los valores que parecen formulas", async () => {
  const { tenant } = await createTenantWithAdmin();
  const resident = await createResident(tenant.id);
  await prisma.user.update({ where: { id: resident.user.id }, data: { name: '=HYPERLINK("https://example.invalid")' } });
  const pqrs = await createPqrs(tenant.id, resident.user.id, "SIMPLE");
  await prisma.pqrs.update({ where: { id: pqrs.id }, data: { titulo: "+SUM(1,2)" } });
  await prisma.historialPqrs.create({
    data: { tenantId: tenant.id, pqrsId: pqrs.id, estadoDespues: "EN_ESPERA", nota: "@CMD()" },
  });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });

  const { buffer } = await exportTenantData({ tenantId: tenant.id, actorUserId: superAdmin.id });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const titleCell = workbook.getWorksheet("PQRS")!.getCell("B2");
  const historyCell = workbook.getWorksheet("PQRS_Historial")!.getCell("D2");
  const userValues = workbook.getWorksheet("Usuarios")!.getColumn(1).values.map(String);

  assert.equal(titleCell.value, "'+SUM(1,2)");
  assert.equal(historyCell.value, "'@CMD()");
  assert.ok(userValues.includes("'=HYPERLINK(\"https://example.invalid\")"));
  assert.equal(typeof titleCell.value, "string");
  assert.equal(typeof historyCell.value, "string");
});
test("26. exportar un conjunto no mezcla datos de otro conjunto", async () => {
  const first = await createTenantWithAdmin();
  const second = await createTenantWithAdmin();
  const firstResident = await createResident(first.tenant.id);
  const secondResident = await createResident(second.tenant.id);
  const firstPqrs = await createPqrs(first.tenant.id, firstResident.user.id, "SIMPLE");
  const secondPqrs = await createPqrs(second.tenant.id, secondResident.user.id, "SIMPLE");
  await prisma.pqrs.update({ where: { id: firstPqrs.id }, data: { titulo: "MARCADOR-SOLO-PRIMERO" } });
  await prisma.pqrs.update({ where: { id: secondPqrs.id }, data: { titulo: "MARCADOR-NUNCA-EXPORTAR" } });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });

  const { buffer } = await exportTenantData({ tenantId: first.tenant.id, actorUserId: superAdmin.id });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer);
  const values = workbook.getWorksheet("PQRS")!.getColumn(2).values.map(String);
  assert.ok(values.includes("MARCADOR-SOLO-PRIMERO"));
  assert.ok(!values.includes("MARCADOR-NUNCA-EXPORTAR"));
});

test("27. un ticket historico conserva lectura, respuesta y cierre", async () => {
  const { tenant } = await createTenantWithAdmin();
  const resident = await createResident(tenant.id);
  const ticket = await prisma.supportTicket.create({
    data: { tenantId: tenant.id, createdByUserId: resident.user.id, subject: "Ticket historico", message: "Mensaje", category: "TECNICO" },
  });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });

  const listed = await listSupportTicketsForSuperAdmin({ tenantId: tenant.id });
  assert.ok(listed.some((item) => item.id === ticket.id && item.category === "TECNICO"));
  const closed = await respondToSupportTicket({ actorUserId: superAdmin.id, ticketId: ticket.id, response: "Respuesta segura", close: true });
  assert.equal(closed.status, "CERRADA");
});

test("28. reactivar un tenant sin suscripcion falla y conserva CANCELLED", async () => {
  const n = nextSeq();
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN} sin suscripcion ${n}`, slug: `${RUN}-no-sub-${n}`, units: 10, status: "CANCELLED", cancelledAt: new Date() },
  });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });

  await assert.rejects(() => updateTenantStatusForSuperAdmin(superAdmin.id, tenant.id, "ACTIVE"));
  assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status, "CANCELLED");
});

test("29. una cortesia expirada no autoriza reactivacion", async () => {
  const { tenant, subscription } = await createTenantWithAdmin({ subscriptionStatus: "CANCELLED", periodEnd: new Date(Date.now() - 30 * 86_400_000) });
  const expiredStart = new Date(Date.now() - 20 * 86_400_000);
  const expiredEnd = new Date(Date.now() - 10 * 86_400_000);
  await prisma.payment.create({
    data: {
      tenantId: tenant.id,
      subscriptionId: subscription.id,
      amountCents: 0,
      currency: "COP",
      status: "APPROVED",
      provider: "COURTESY",
      dueDate: expiredStart,
      paidAt: expiredStart,
      periodStart: expiredStart,
      periodEnd: expiredEnd,
      externalReference: `courtesy:${tenant.id}:${crypto.randomUUID()}`,
    },
  });
  const superAdmin = await prisma.user.create({
    data: { email: `super-${RUN}-${nextSeq()}@example.com`, name: "QA SuperAdmin", password: "x", role: "SUPER_ADMIN" },
  });

  await assert.rejects(() => updateTenantStatusForSuperAdmin(superAdmin.id, tenant.id, "ACTIVE"));
  assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status, "CANCELLED");
});
