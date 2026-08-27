// Pruebas de INTEGRACION del cron de mora (`applyOverdueLicenseRules`): CAS,
// precedencia y atomicidad de las transiciones automaticas (FASE 2L, F2-02/05/06).
//
// EJECUCION: requieren una base de datos DEDICADA de pruebas (.env.test) validada
// por el runner seguro. No llaman a proveedores reales ni envian
// emails reales (el correo transaccional esta desactivado -> EmailLog SKIPPED).
//
// AISLAMIENTO: todas las corridas del cron se acotan con `{ tenantIds }` a los
// tenants de ESTE archivo, para no transicionar suscripciones de otros archivos
// que corren en paralelo contra la misma base.

import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { prisma } from "../src/lib/prisma";
import {
  applyOverdueLicenseRules,
  __unsafeSetCronTestHooks,
  getGracePeriodDays,
  isCronAuthorizationValid,
  renewSubscriptionWithSimulatedPayment,
  type CronRunOptions,
} from "../src/domains/billing/billing.service";
import {
  __unsafeResetBillingOutboxTestHooks,
  __unsafeSetBillingOutboxTestHooks,
} from "../src/domains/billing/billing-outbox.service";
import { updateTenantStatusForSuperAdmin } from "../src/domains/platform/tenant-admin.service";
import { GET as overdueRulesGET } from "../src/app/api/cron/overdue-rules/route";

const RUN = `billing-cron-${Date.now()}`;
let counter = 0;
// Guarantia de "cero emails reales": este archivo corre en su propio proceso
// (node --test aisla cada archivo), asi que retirar RESEND_API_KEY aqui hace que
// `sendEmail` falle ANTES de cualquier fetch al proveedor (rama sin API key ->
// EmailLog FAILED), sin tocar `.env`, el flag de plataforma (compartido) ni el
// proceso de otros archivos. Se restaura en `after()`.
const prevResendKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;

const pricingRuleIds: string[] = [];
const extraUserIds: string[] = [];
const tenantIdsAll = new Set<string>();

const PAST = () => new Date(Date.now() - 60 * 60 * 1000);
const FUTURE = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

type SubStatus = "TRIAL" | "ACTIVE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED" | "PENDING_PAYMENT";

async function createTenantWithSub(input: {
  status: SubStatus;
  currentPeriodEnd?: Date;
  trialEndsAt?: Date | null;
  graceEndsAt?: Date | null;
  subscriptionId?: string;
}) {
  counter += 1;
  const tenant = await prisma.tenant.create({
    data: { name: `QA ${RUN} ${counter}`, slug: `${RUN}-${counter}`, units: 10, status: input.status as never },
  });
  tenantIdsAll.add(tenant.id);
  const subscription = await prisma.subscription.create({
    data: {
      ...(input.subscriptionId ? { id: input.subscriptionId } : {}),
      tenantId: tenant.id,
      status: input.status as never,
      unitsSnapshot: 10,
      priceCents: 100000,
      currency: "COP",
      currentPeriodStart: PAST(),
      currentPeriodEnd: input.currentPeriodEnd ?? PAST(),
      trialEndsAt: input.trialEndsAt === undefined ? null : input.trialEndsAt,
      graceEndsAt: input.graceEndsAt === undefined ? null : input.graceEndsAt,
    },
  });
  return { tenant, subscription };
}

async function createActiveAdmin(tenantId: string): Promise<string> {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: `${RUN}-admin-${counter}@example.test`,
      password: "x",
      name: "QA Admin",
      role: "ADMIN",
      tenantId,
      isActive: true,
      memberships: {
        create: { tenantId, role: "ADMIN", isActive: true },
      },
    },
  });
  extraUserIds.push(user.id);
  return user.id;
}

async function createSuperAdminActor(): Promise<string> {
  counter += 1;
  const user = await prisma.user.create({
    data: { email: `${RUN}-sa-${counter}@example.test`, password: "x", name: "QA SuperAdmin", role: "SUPER_ADMIN" },
  });
  extraUserIds.push(user.id);
  return user.id;
}

// Evidencia de acceso vigente (pago real aplicado) que autoriza la reactivacion
// administrativa: tenantId+subscriptionId exactos, WOMPI, APPROVED, efecto
// aplicado, sin reconciliacion, periodo vigente.
async function createAccessEvidence(tenantId: string, subscriptionId: string) {
  return prisma.payment.create({
    data: {
      tenantId,
      subscriptionId,
      amountCents: 100000,
      currency: "COP",
      status: "APPROVED",
      provider: "WOMPI",
      dueDate: PAST(),
      paidAt: PAST(),
      periodStart: PAST(),
      periodEnd: FUTURE(),
      externalReference: `${RUN}-evidence-${++counter}`,
      approvedEffectAppliedAt: new Date(),
      approvedEffectReconciliationRequired: false,
    },
  });
}

function resetCronHook() {
  __unsafeSetCronTestHooks({});
  __unsafeResetBillingOutboxTestHooks();
}

// Acota SIEMPRE la corrida del cron a los tenants de este archivo.
async function runCron(
  tenantIds: string[],
  actorUserId: string | null = null,
  options: Omit<CronRunOptions, "tenantIds"> = {}
) {
  return applyOverdueLicenseRules(actorUserId, { tenantIds, ...options });
}

async function countAudits(tenantId: string) {
  return prisma.auditLog.count({ where: { tenantId, action: "TENANT_OVERDUE_RULES_APPLIED" } });
}

before(async () => {
  await prisma.$connect();
  const rule = await prisma.pricingRule.create({
    data: { minUnits: 1, maxUnits: 100000, priceCents: 100000, currency: "COP", isActive: true },
  });
  pricingRuleIds.push(rule.id);
});

after(async () => {
  resetCronHook();
  const tenantIds = Array.from(tenantIdsAll);
  await prisma.webhookEvent.deleteMany({
    where: { OR: [{ tenantId: { in: tenantIds } }, { dataId: { startsWith: RUN } }, { requestId: { startsWith: RUN } }] },
  });
  await prisma.emailLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { actorUserId: { in: extraUserIds } }] } });
  await prisma.payment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { id: { in: extraUserIds } }] } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.pricingRule.deleteMany({ where: { id: { in: pricingRuleIds } } });
  if (prevResendKey !== undefined) process.env.RESEND_API_KEY = prevResendKey;
  else delete process.env.RESEND_API_KEY;
  await prisma.$disconnect();
});

// ===========================================================================
// Transiciones nominales
// ===========================================================================

// 1. ACTIVE vencida entra a Grace una sola vez.
test("1. ACTIVE vencida entra a GRACE una sola vez", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });

  const first = await runCron([tenant.id]);
  const subA = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const tenA = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(subA.status, "GRACE_PERIOD");
  assert.ok(subA.graceEndsAt && subA.graceEndsAt.getTime() > Date.now(), "graceEndsAt queda en el futuro");
  assert.equal(tenA.status, "GRACE_PERIOD");
  assert.equal(first.movedToGracePeriod, 1);
  assert.equal(await countAudits(tenant.id), 1, "una sola auditoria");

  // Segunda corrida: ya esta en GRACE vigente -> PRESERVE, sin segunda transicion.
  const second = await runCron([tenant.id]);
  assert.equal(second.movedToGracePeriod, 0);
  assert.equal(await countAudits(tenant.id), 1, "sigue habiendo una sola auditoria");
});

// 2. GRACE vencida pasa a SUSPENDED una sola vez.
test("2. GRACE vencida pasa a SUSPENDED una sola vez", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });

  const first = await runCron([tenant.id]);
  const subA = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const tenA = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(subA.status, "SUSPENDED");
  assert.equal(tenA.status, "SUSPENDED");
  assert.equal(first.movedToSuspended, 1);
  assert.equal(await countAudits(tenant.id), 1);

  const second = await runCron([tenant.id]);
  assert.equal(second.movedToSuspended, 0);
  assert.equal(await countAudits(tenant.id), 1);
});

// 3. Trial vencido sigue la politica (TRIAL -> GRACE).
test("3. TRIAL vencido pasa a GRACE", async () => {
  const past = PAST();
  const { tenant, subscription } = await createTenantWithSub({ status: "TRIAL", currentPeriodEnd: past, trialEndsAt: past });

  const result = await runCron([tenant.id]);
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "GRACE_PERIOD");
  assert.equal(ten.status, "GRACE_PERIOD");
  assert.equal(result.movedToGracePeriod, 1);
});

// 4. Estado vigente no cambia.
test("4. Una suscripcion vigente no cambia ni se audita", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: FUTURE() });

  const result = await runCron([tenant.id]);
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(sub.status, "ACTIVE");
  assert.equal(result.examined, 0, "ni siquiera es candidata");
  assert.equal(await countAudits(tenant.id), 0);
});

// 5. graceEndsAt = null se reporta como inconsistencia y no cambia.
test("5. GRACE con graceEndsAt = null se reporta inconsistente y no cambia", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: null });
  await createActiveAdmin(tenant.id);

  const result = await runCron([tenant.id]);
  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "GRACE_PERIOD", "no se suspende");
  assert.equal(sub.graceEndsAt, null, "no se inventa una fecha");
  assert.equal(ten.status, "GRACE_PERIOD", "el tenant no cambia");
  assert.equal(result.inconsistentGraceWithoutBoundary, 1);
  assert.equal(await countAudits(tenant.id), 0, "sin auditoria de transicion");
  assert.equal(await prisma.notification.count({ where: { tenantId: tenant.id } }), 0, "sin notificacion");
  assert.equal(await prisma.emailLog.count({ where: { tenantId: tenant.id } }), 0, "sin email");
});

// ===========================================================================
// Carreras (CAS)
// ===========================================================================

// 6. Una renovacion registrada concurrentemente gana frente al cron.
test("6. Renovacion concurrente gana: el CAS del cron pierde", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const actorUserId = await createActiveAdmin(tenant.id);

  let fired = false;
  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      if (step === "BEFORE_CRON_SUBSCRIPTION_CAS" && ctx.subscriptionId === subscription.id && !fired) {
        fired = true;
        await renewSubscriptionWithSimulatedPayment({
          actorUserId,
          tenantId: tenant.id,
          operationId: `${RUN}-renewal-${subscription.id}`,
        });
      }
    },
  });
  let result;
  try {
    result = await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "ACTIVE", "el pago prevalece: sigue ACTIVE");
  assert.ok(sub.currentPeriodEnd.getTime() > Date.now(), "el nuevo periodo permanece");
  assert.equal(ten.status, "ACTIVE", "el tenant permanece ACTIVE");
  assert.equal(result.movedToGracePeriod, 0, "el cron no aplico transicion");
  assert.equal(result.skippedConcurrentChange, 1, "el cron cedio por cambio concurrente");
  assert.equal(await countAudits(tenant.id), 0, "sin auditoria de mora/gracia");
});

// 7. Reactivacion manual gana frente al cron.
test("7. Reactivacion administrativa concurrente gana: el CAS del cron pierde", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });
  await createAccessEvidence(tenant.id, subscription.id);
  const actorId = await createSuperAdminActor();

  let fired = false;
  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      if (step === "BEFORE_CRON_SUBSCRIPTION_CAS" && ctx.subscriptionId === subscription.id && !fired) {
        fired = true;
        await updateTenantStatusForSuperAdmin(actorId, tenant.id, "ACTIVE");
      }
    },
  });
  let result;
  try {
    result = await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "ACTIVE", "la reactivacion prevalece");
  assert.equal(ten.status, "ACTIVE");
  assert.equal(result.movedToSuspended, 0, "el cron no suspendio");
  assert.equal(result.skippedConcurrentChange, 1);
  assert.equal(
    await prisma.auditLog.count({ where: { tenantId: tenant.id, action: "TENANT_OVERDUE_RULES_APPLIED" } }),
    0,
    "sin auditoria de suspension"
  );
});

// 8. Dos crons realmente concurrentes: ambos leen antes de liberar el CAS.
test("8. Dos crons concurrentes leen el mismo snapshot y solo uno gana", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });

  let readers = 0;
  let releaseBarrier!: () => void;
  const barrier = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      if (step !== "AFTER_CRON_SUBSCRIPTION_READ" || ctx.subscriptionId !== subscription.id) return;
      readers += 1;
      if (readers === 2) releaseBarrier();
      await barrier;
    },
  });

  let first;
  let second;
  try {
    [first, second] = await Promise.all([runCron([tenant.id]), runCron([tenant.id])]);
  } finally {
    releaseBarrier();
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(readers, 2, "ambos crons releyeron el mismo candidato antes del CAS");
  assert.equal(sub.status, "GRACE_PERIOD");
  assert.equal(ten.status, "GRACE_PERIOD");
  assert.equal(first.movedToGracePeriod + second.movedToGracePeriod, 1, "solo un cron aplico");
  assert.equal(first.skippedConcurrentChange + second.skippedConcurrentChange, 1, "el otro perdio el CAS");
  assert.equal(await countAudits(tenant.id), 1, "exactamente una auditoria de transicion");
});
// 9. Cambio de periodo concurrente hace perder el CAS.
test("9. Un cambio de periodo concurrente hace perder el CAS", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });

  let fired = false;
  const newEnd = FUTURE();
  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      if (step === "BEFORE_CRON_SUBSCRIPTION_CAS" && ctx.subscriptionId === subscription.id && !fired) {
        fired = true;
        await prisma.subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: newEnd } });
      }
    },
  });
  let result;
  try {
    result = await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(sub.status, "ACTIVE", "no se degrado");
  assert.equal(sub.currentPeriodEnd.getTime(), newEnd.getTime(), "el periodo concurrente permanece");
  assert.equal(result.skippedConcurrentChange, 1);
  assert.equal(await countAudits(tenant.id), 0);
});

// 10. Cambio de status concurrente hace perder el CAS.
test("10. Un cambio de status concurrente hace perder el CAS", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });

  let fired = false;
  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      if (step === "BEFORE_CRON_SUBSCRIPTION_CAS" && ctx.subscriptionId === subscription.id && !fired) {
        fired = true;
        await prisma.subscription.update({ where: { id: subscription.id }, data: { status: "ACTIVE" } });
      }
    },
  });
  let result;
  try {
    result = await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(sub.status, "ACTIVE", "el cambio concurrente prevalece, no se suspende");
  assert.equal(result.skippedConcurrentChange, 1);
  assert.equal(await countAudits(tenant.id), 0);
});

// ===========================================================================
// Atomicidad
// ===========================================================================

// 11. Fallo antes de actualizar Tenant revierte Subscription.
test("11. Fallo antes de actualizar Tenant revierte la Subscription", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });

  __unsafeSetCronTestHooks({
    onStep: (step, ctx) => {
      if (step === "BEFORE_CRON_TENANT_UPDATE" && ctx.subscriptionId === subscription.id) {
        throw new Error("fallo inyectado antes de Tenant");
      }
    },
  });
  let result;
  try {
    result = await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "ACTIVE", "la Subscription se revirtio");
  assert.equal(ten.status, "ACTIVE", "el Tenant nunca cambio");
  assert.equal(result.errors, 1);
  assert.equal(await countAudits(tenant.id), 0, "sin auditoria parcial");
});

// 12. Fallo antes de AuditLog revierte Subscription y Tenant.
test("12. Fallo antes de AuditLog revierte Subscription y Tenant", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });

  __unsafeSetCronTestHooks({
    onStep: (step, ctx) => {
      if (step === "BEFORE_CRON_AUDIT_LOG" && ctx.subscriptionId === subscription.id) {
        throw new Error("fallo inyectado antes de AuditLog");
      }
    },
  });
  let result;
  try {
    result = await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const ten = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(sub.status, "GRACE_PERIOD", "la Subscription se revirtio (no SUSPENDED)");
  assert.equal(ten.status, "GRACE_PERIOD", "el Tenant se revirtio");
  assert.equal(result.errors, 1);
  assert.equal(await countAudits(tenant.id), 0, "sin auditoria parcial");

  // 13. Reintento posterior funciona.
  const retry = await runCron([tenant.id]);
  const subRetry = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  assert.equal(subRetry.status, "SUSPENDED", "el reintento aplica la transicion");
  assert.equal(retry.movedToSuspended, 1);
  assert.equal(await countAudits(tenant.id), 1, "ahora si hay una auditoria");
});

// 14. Fallo REAL de AuditLog por actor inexistente revierte Subscription y Tenant.
test("14. Un fallo real de AuditLog revierte toda la transaccion", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });

  const failed = await runCron([tenant.id], `${RUN}-actor-inexistente`);
  const subAfterFailure = await prisma.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
  const tenantAfterFailure = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert.equal(failed.errors, 1);
  assert.equal(subAfterFailure.status, "GRACE_PERIOD", "Subscription revertida por FK de AuditLog");
  assert.equal(tenantAfterFailure.status, "GRACE_PERIOD", "Tenant revertido por FK de AuditLog");
  assert.equal(await countAudits(tenant.id), 0, "sin auditoria parcial");

  const retry = await runCron([tenant.id]);
  assert.equal(retry.movedToSuspended, 1, "un reintento limpio aplica la transicion");
  assert.equal(await countAudits(tenant.id), 1, "una sola auditoria final");
});
// ===========================================================================
// Efectos externos
// ===========================================================================

// 15. CAS perdido no crea Notification ni email.
test("15. Un CAS perdido no crea Notification ni email", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  await createActiveAdmin(tenant.id);

  let fired = false;
  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      if (step === "BEFORE_CRON_SUBSCRIPTION_CAS" && ctx.subscriptionId === subscription.id && !fired) {
        fired = true;
        await prisma.subscription.update({ where: { id: subscription.id }, data: { currentPeriodEnd: FUTURE() } });
      }
    },
  });
  try {
    await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  assert.equal(await prisma.notification.count({ where: { tenantId: tenant.id } }), 0);
  assert.equal(await prisma.emailLog.count({ where: { tenantId: tenant.id } }), 0);
});

// 16. Rollback no crea Notification ni email.
test("16. Un rollback no crea Notification ni email", async () => {
  const { tenant, subscription } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  await createActiveAdmin(tenant.id);

  __unsafeSetCronTestHooks({
    onStep: (step, ctx) => {
      if (step === "BEFORE_CRON_AUDIT_LOG" && ctx.subscriptionId === subscription.id) {
        throw new Error("fallo inyectado");
      }
    },
  });
  try {
    await runCron([tenant.id]);
  } finally {
    resetCronHook();
  }

  assert.equal(await prisma.notification.count({ where: { tenantId: tenant.id } }), 0);
  assert.equal(await prisma.emailLog.count({ where: { tenantId: tenant.id } }), 0);
});

// 17. INCONSISTENT no crea Notification ni email (ya cubierto en 5, se reafirma).
test("17. Una inconsistencia no crea Notification ni email", async () => {
  const { tenant } = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: null });
  await createActiveAdmin(tenant.id);

  await runCron([tenant.id]);
  assert.equal(await prisma.notification.count({ where: { tenantId: tenant.id } }), 0);
  assert.equal(await prisma.emailLog.count({ where: { tenantId: tenant.id } }), 0);
});

// 18. Una transicion aplicada genera el efecto externo actual una sola vez.
test("18. Una transicion aplicada notifica una sola vez y no envia email real", async () => {
  const { tenant } = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  await createActiveAdmin(tenant.id);

  await runCron([tenant.id]);
  const notifications = await prisma.notification.count({ where: { tenantId: tenant.id, type: "LICENSE_EXPIRING" } });
  const emailsSent = await prisma.emailLog.count({ where: { tenantId: tenant.id, status: "SENT" } });
  assert.equal(notifications, 1, "exactamente una notificacion para el admin");
  // Sin RESEND_API_KEY (retirada en este proceso) el envio falla antes de cualquier
  // fetch: ningun email real sale. La transicion externa ocurre a lo sumo una vez.
  assert.equal(emailsSent, 0, "no se envio ningun email real");

  // Segunda corrida: ya esta en GRACE vigente -> PRESERVE -> no re-notifica.
  await runCron([tenant.id]);
  assert.equal(
    await prisma.notification.count({ where: { tenantId: tenant.id, type: "LICENSE_EXPIRING" } }),
    1,
    "no hay notificacion duplicada"
  );
});

// 18b. Fallos posteriores al commit se reportan sin ocultar transiciones aplicadas.
test("18b. Notification y email fallidos no revierten ni detienen efectos de otros tenants", async () => {
  const failedNotification = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const successfulNotification = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const failedAdminId = await createActiveAdmin(failedNotification.tenant.id);
  await createActiveAdmin(successfulNotification.tenant.id);

  let deactivated = false;
  __unsafeSetBillingOutboxTestHooks({
    onStep: async (step, ctx) => {
      if (step === "AFTER_OUTBOX_SELECTED" && ctx.outboxIds?.length && !deactivated) {
        deactivated = true;
        await prisma.user.update({ where: { id: failedAdminId }, data: { isActive: false } });
      }
    },
  });

  let summary;
  try {
    summary = await runCron([failedNotification.tenant.id, successfulNotification.tenant.id]);
  } finally {
    resetCronHook();
  }

  const failedSub = await prisma.subscription.findUniqueOrThrow({ where: { id: failedNotification.subscription.id } });
  const successfulSub = await prisma.subscription.findUniqueOrThrow({ where: { id: successfulNotification.subscription.id } });
  assert.equal(summary.movedToGracePeriod, 2, "ambas transiciones siguen aplicadas");
  assert.equal(failedSub.status, "GRACE_PERIOD");
  assert.equal(successfulSub.status, "GRACE_PERIOD");
  assert.equal(await countAudits(failedNotification.tenant.id), 1);
  assert.equal(await countAudits(successfulNotification.tenant.id), 1);

  assert.equal(summary.externalEffects.notificationTenantsAttempted, 2);
  assert.equal(summary.externalEffects.notificationAttempts, 2);
  assert.equal(summary.externalEffects.notificationSucceeded, 1);
  assert.equal(summary.externalEffects.notificationFailed, 1);
  assert.equal(summary.externalEffects.emailAttempts, 2);
  assert.equal(summary.externalEffects.emailSucceeded, 0);
  assert.equal(summary.externalEffects.emailFailed, 2, "sin API key, ambos emails fallan controladamente");
  assert.equal(summary.externalEffects.errorCount, 3);
  assert.equal(summary.externalEffects.errorsTruncated, false);
  assert.equal(
    await prisma.notification.count({ where: { tenantId: successfulNotification.tenant.id } }),
    1,
    "el fallo de un tenant no corta la notificacion del otro"
  );
  assert.equal(await prisma.notification.count({ where: { tenantId: failedNotification.tenant.id } }), 0);
});
// ===========================================================================
// Lote
// ===========================================================================

// 19. Un candidato falla y otro candidato valido si se procesa.
test("19. Un candidato que falla no bloquea a otro candidato valido", async () => {
  const a = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const b = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });

  __unsafeSetCronTestHooks({
    onStep: (step, ctx) => {
      if (step === "BEFORE_CRON_TENANT_UPDATE" && ctx.subscriptionId === a.subscription.id) {
        throw new Error("fallo inyectado solo para A");
      }
    },
  });
  let result;
  try {
    result = await runCron([a.tenant.id, b.tenant.id]);
  } finally {
    resetCronHook();
  }

  const subA = await prisma.subscription.findUniqueOrThrow({ where: { id: a.subscription.id } });
  const subB = await prisma.subscription.findUniqueOrThrow({ where: { id: b.subscription.id } });
  assert.equal(subA.status, "ACTIVE", "A se revirtio por el fallo");
  assert.equal(subB.status, "GRACE_PERIOD", "B si se proceso");
  assert.equal(result.errors, 1);
  assert.equal(result.movedToGracePeriod, 1);
});

// 20. El resumen refleja aplicados, preservados, concurrentes, inconsistentes y errores.
test("20. El resumen estructurado refleja todas las categorias", async () => {
  const applyGrace = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const applySuspend = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });
  const inconsistent = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: null });
  const preserved = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const concurrent = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const errored = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });

  const tenantIds = [applyGrace, applySuspend, inconsistent, preserved, concurrent, errored].map((x) => x.tenant.id);

  __unsafeSetCronTestHooks({
    onStep: async (step, ctx) => {
      // Renueva `preserved` ANTES de que se relea -> al releer sera PRESERVE.
      if (step === "AFTER_CRON_CANDIDATE_SELECTED") {
        await prisma.subscription.update({
          where: { id: preserved.subscription.id },
          data: { status: "ACTIVE", currentPeriodEnd: FUTURE() },
        });
      }
      // Cambia `concurrent` justo antes del CAS -> el CAS pierde.
      if (step === "BEFORE_CRON_SUBSCRIPTION_CAS" && ctx.subscriptionId === concurrent.subscription.id) {
        await prisma.subscription.update({
          where: { id: concurrent.subscription.id },
          data: { status: "ACTIVE", currentPeriodEnd: FUTURE() },
        });
      }
      // Falla `errored` antes de Tenant -> ERROR + rollback.
      if (step === "BEFORE_CRON_TENANT_UPDATE" && ctx.subscriptionId === errored.subscription.id) {
        throw new Error("fallo inyectado para errored");
      }
    },
  });
  let summary;
  try {
    summary = await runCron(tenantIds);
  } finally {
    resetCronHook();
  }

  assert.equal(summary.examined, 5, "5 candidatos accionables; la inconsistencia se diagnostica aparte");
  assert.equal(summary.actionableExamined, 5);
  assert.equal(summary.movedToGracePeriod, 1, "una transicion a gracia");
  assert.equal(summary.movedToSuspended, 1, "una transicion a suspendido");
  assert.equal(summary.preserved, 1, "una preservada");
  assert.equal(summary.skippedConcurrentChange, 1, "una saltada por cambio concurrente");
  assert.equal(summary.inconsistentGraceWithoutBoundary, 1, "una inconsistente");
  assert.equal(summary.errors, 1, "un error");
  assert.equal(summary.errorDetails.length, 1);
  assert.equal(summary.errorDetails[0]?.subscriptionId, errored.subscription.id);
  assert.equal(summary.inconsistentDetails.length, 1);
  assert.equal(summary.inconsistentDetailsTruncated, false);
  assert.equal(summary.inconsistentDetails[0]?.subscriptionId, inconsistent.subscription.id);
});

// 22. Las inconsistencias tienen diagnostico separado y detalles truncados.
test("22. Mas inconsistencias que el limite no bloquean una GRACE vencida", async () => {
  const inconsistentA = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: null });
  const inconsistentB = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: null });
  const inconsistentC = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: null });
  const actionable = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: PAST() });
  const tenantIds = [inconsistentA, inconsistentB, inconsistentC, actionable].map((item) => item.tenant.id);

  const summary = await runCron(tenantIds, null, { batchLimit: 4, inconsistencyDetailLimit: 2 });
  const actionableSub = await prisma.subscription.findUniqueOrThrow({ where: { id: actionable.subscription.id } });
  assert.equal(actionableSub.status, "SUSPENDED", "la inconsistencia no consume el cupo accionable");
  assert.equal(summary.actionableExamined, 1);
  assert.equal(summary.actionableByCategory.graceExpired, 1);
  assert.equal(summary.movedToSuspended, 1);
  assert.equal(summary.inconsistencies, 3);
  assert.equal(summary.inconsistentGraceWithoutBoundary, 3);
  assert.equal(summary.inconsistentDetails.length, 2);
  assert.equal(summary.inconsistentDetailsTruncated, true);

  for (const item of [inconsistentA, inconsistentB, inconsistentC]) {
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { id: item.subscription.id } });
    assert.equal(sub.status, "GRACE_PERIOD");
    assert.equal(sub.graceEndsAt, null);
  }
});

// 23. El cupo total se reparte para que una categoria no bloquee otra.
test("23. Un backlog ACTIVE no bloquea la suspension de GRACE", async () => {
  const boundary = PAST();
  const activeA = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: boundary });
  const activeB = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: boundary });
  const activeC = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: boundary });
  const grace = await createTenantWithSub({ status: "GRACE_PERIOD", graceEndsAt: boundary });
  const tenantIds = [activeA, activeB, activeC, grace].map((item) => item.tenant.id);

  const summary = await runCron(tenantIds, null, { batchLimit: 4 });
  const graceSub = await prisma.subscription.findUniqueOrThrow({ where: { id: grace.subscription.id } });
  const remainingActive = await prisma.subscription.count({
    where: { tenantId: { in: [activeA.tenant.id, activeB.tenant.id, activeC.tenant.id] }, status: "ACTIVE" },
  });
  assert.equal(summary.actionableByCategory.activeExpired, 1, "ACTIVE recibe un cupo");
  assert.equal(summary.actionableByCategory.graceExpired, 1, "GRACE recibe un cupo independiente");
  assert.equal(summary.movedToGracePeriod, 1);
  assert.equal(summary.movedToSuspended, 1);
  assert.equal(graceSub.status, "SUSPENDED", "GRACE no queda bloqueada por ACTIVE");
  assert.equal(remainingActive, 2, "el limite total se respeta y el resto avanza en corridas posteriores");
});

// 24. Ante la misma frontera, el id es el desempate estable.
test("24. El orden de candidatos usa frontera e id como desempate", async () => {
  const boundary = PAST();
  const orderBase = `${RUN}-order-${++counter}`;
  const a = await createTenantWithSub({
    status: "ACTIVE",
    currentPeriodEnd: boundary,
    subscriptionId: `${orderBase}-a`,
  });
  const b = await createTenantWithSub({
    status: "ACTIVE",
    currentPeriodEnd: boundary,
    subscriptionId: `${orderBase}-b`,
  });
  const c = await createTenantWithSub({
    status: "ACTIVE",
    currentPeriodEnd: boundary,
    subscriptionId: `${orderBase}-c`,
  });

  const summary = await runCron([c.tenant.id, b.tenant.id, a.tenant.id], null, { batchLimit: 4 });
  const [subA, subB, subC] = await Promise.all(
    [a, b, c].map((item) => prisma.subscription.findUniqueOrThrow({ where: { id: item.subscription.id } }))
  );
  assert.equal(summary.actionableExamined, 1);
  assert.equal(subA.status, "GRACE_PERIOD", "el id lexicograficamente menor gana el unico cupo ACTIVE");
  assert.equal(subB.status, "ACTIVE");
  assert.equal(subC.status, "ACTIVE");
});

// 25. El scope interno es deduplicado, acepta vacio y limita listas enormes.
test("25. options.tenantIds valida vacio, duplicados y limite", async () => {
  const empty = await runCron([], null, { batchLimit: 4 });
  assert.equal(empty.actionableExamined, 0);
  assert.equal(empty.inconsistencies, 0);

  const item = await createTenantWithSub({ status: "ACTIVE", currentPeriodEnd: PAST() });
  const duplicate = await runCron([item.tenant.id, item.tenant.id], null, { batchLimit: 4 });
  assert.equal(duplicate.movedToGracePeriod, 1, "duplicar un tenant no duplica la transicion");

  await assert.rejects(
    applyOverdueLicenseRules(null, {
      tenantIds: Array.from({ length: 1_001 }, (_, index) => `tenant-${index}`),
      batchLimit: 4,
    }),
    /tenantIds excede el limite/
  );
});
// 26. La autenticacion rechaza ausencias/errores y compara timing-safe.
test("26. La autenticacion del cron es fail-closed", async () => {
  const previousSecret = process.env.CRON_SECRET;
  try {
    delete process.env.CRON_SECRET;
    const missingSecret = await overdueRulesGET(
      new NextRequest("http://localhost/api/cron/overdue-rules", {
        headers: { authorization: "Bearer undefined" },
      })
    );
    assert.equal(missingSecret.status, 401, "Bearer undefined no aprueba sin secreto configurado");

    process.env.CRON_SECRET = "cron-test-secret";
    const missingCredential = await overdueRulesGET(
      new NextRequest("http://localhost/api/cron/overdue-rules")
    );
    const wrongCredential = await overdueRulesGET(
      new NextRequest("http://localhost/api/cron/overdue-rules", {
        headers: { authorization: "Bearer incorrecto" },
      })
    );
    assert.equal(missingCredential.status, 401);
    assert.equal(wrongCredential.status, 401);
    assert.equal(isCronAuthorizationValid("cron-test-secret", "Bearer cron-test-secret"), true);
    assert.equal(isCronAuthorizationValid("cron-test-secret", "Bearer incorrecto"), false);
  } finally {
    if (previousSecret !== undefined) process.env.CRON_SECRET = previousSecret;
    else delete process.env.CRON_SECRET;
  }
});
// Confirma que el default de gracia es leible (documenta la fuente del valor).
test("21. getGracePeriodDays devuelve un numero positivo", async () => {
  const days = await getGracePeriodDays();
  assert.ok(Number.isFinite(days) && days > 0, "grace days positivo");
});
