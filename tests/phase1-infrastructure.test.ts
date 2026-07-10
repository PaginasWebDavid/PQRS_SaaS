import "dotenv/config";
import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AuditAction, Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  hashInvitationToken,
} from "../src/domains/organizations/invitation.service";
import { createNotification, markNotificationRead, NotificationTypes } from "../src/domains/notifications/notification.service";
import { sendEmailSafe } from "../src/lib/email";
import { registerAuditLog } from "../src/domains/platform/audit.service";

const RUN_ID = `phase1-test-${Date.now()}`;
let counter = 0;

function nextEmail(prefix: string) {
  counter += 1;
  return `${prefix}-${RUN_ID}-${counter}@example.com`;
}

async function cleanup() {
  const tenantIds = (await prisma.tenant.findMany({
    where: { slug: { startsWith: RUN_ID } },
    select: { id: true },
  })).map((tenant) => tenant.id);

  const emails = await prisma.user.findMany({
    where: { email: { contains: RUN_ID } },
    select: { email: true },
  });

  await prisma.notification.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { user: { email: { contains: RUN_ID } } }] } });
  await prisma.emailLog.deleteMany({ where: { recipient: { contains: RUN_ID } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { metadata: { path: ["runId"], equals: RUN_ID } }] } });
  await prisma.invitation.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { email: { contains: RUN_ID } }] } });
  await prisma.user.deleteMany({ where: { email: { in: emails.map((user) => user.email) } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
}

async function createTenant(name = "Conjunto QA") {
  const n = ++counter;
  return prisma.tenant.create({
    data: {
      name: `${name} ${n}`,
      slug: `${RUN_ID}-${n}`,
      city: "Bogota",
      address: "Calle QA 123",
      units: 24,
    },
  });
}

async function createUser(tenantId: string, role: Role = "ADMIN") {
  return prisma.user.create({
    data: {
      tenantId,
      role,
      email: nextEmail(role.toLowerCase()),
      name: `QA ${role}`,
      password: "not-used-in-test",
    },
  });
}

beforeEach(async () => {
  delete process.env.RESEND_API_KEY;
});

after(async () => {
  await cleanup();
  await prisma.$disconnect();
});

test("acepta una invitacion valida y crea usuario asociado al conjunto", async () => {
  const tenant = await createTenant();
  const inviter = await createUser(tenant.id, "ADMIN");
  const email = nextEmail("resident");

  const { invitation, token } = await createInvitation({ tenantId: tenant.id, email, role: "RESIDENTE", invitedById: inviter.id });
  const result = await acceptInvitation({ token, password: "Secret1234", name: "Residente QA", bloque: 1, apto: 101 });

  assert.equal(result.user.email, email);
  assert.equal(result.user.tenantId, tenant.id);
  assert.equal(result.user.role, "RESIDENTE");

  const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  assert.equal(stored.status, "ACCEPTED");
  assert.ok(stored.acceptedAt);
});

test("rechaza una invitacion vencida y la marca como EXPIRED", async () => {
  const tenant = await createTenant();
  const inviter = await createUser(tenant.id, "ADMIN");
  const { invitation, token } = await createInvitation({ tenantId: tenant.id, email: nextEmail("expired"), role: "RESIDENTE", invitedById: inviter.id, expiresInHours: -1 });

  await assert.rejects(() => acceptInvitation({ token, password: "Secret1234", name: "Expired QA" }), /vencida/);
  const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  assert.equal(stored.status, "EXPIRED");
});

test("rechaza una invitacion cancelada", async () => {
  const tenant = await createTenant();
  const inviter = await createUser(tenant.id, "ADMIN");
  const { invitation, token } = await createInvitation({ tenantId: tenant.id, email: nextEmail("cancelled"), role: "CONSEJO", invitedById: inviter.id });

  await cancelInvitation({ tenantId: tenant.id, invitationId: invitation.id, actorUserId: inviter.id });
  await assert.rejects(() => acceptInvitation({ token, password: "Secret1234", name: "Cancel QA" }), /cancelada/);
});

test("impide reutilizar un token aceptado", async () => {
  const tenant = await createTenant();
  const inviter = await createUser(tenant.id, "ADMIN");
  const { token } = await createInvitation({ tenantId: tenant.id, email: nextEmail("reuse"), role: "CONSEJO", invitedById: inviter.id });

  await acceptInvitation({ token, password: "Secret1234", name: "Reuse QA" });
  await assert.rejects(() => acceptInvitation({ token, password: "Secret1234", name: "Reuse Again" }), /utilizada/);
});

test("bloquea operaciones cruzadas entre conjuntos", async () => {
  const tenantA = await createTenant("A");
  const tenantB = await createTenant("B");
  const inviter = await createUser(tenantA.id, "ADMIN");
  const { invitation } = await createInvitation({ tenantId: tenantA.id, email: nextEmail("cross"), role: "RESIDENTE", invitedById: inviter.id });

  await assert.rejects(() => cancelInvitation({ tenantId: tenantB.id, invitationId: invitation.id, actorUserId: inviter.id }), /no encontrada/i);
});

test("bloquea notificaciones para usuarios de otro conjunto y lectura por otro usuario", async () => {
  const tenantA = await createTenant("NotifA");
  const tenantB = await createTenant("NotifB");
  const userA = await createUser(tenantA.id, "RESIDENTE");
  const userB = await createUser(tenantB.id, "RESIDENTE");

  await assert.rejects(
    () => createNotification({ tenantId: tenantA.id, userId: userB.id, type: NotificationTypes.PQRS_CREATED, title: "Cruce", message: "No permitido" }),
    /otro conjunto/i,
  );

  const notification = await createNotification({ tenantId: tenantA.id, userId: userA.id, type: NotificationTypes.PQRS_CREATED, title: "Nueva PQRS", message: "Solicitud creada" });
  await assert.rejects(() => markNotificationRead({ tenantId: tenantA.id, userId: userB.id, notificationId: notification.id }), /no encontrada/i);
});

test("registra fallo de Resend en EmailLog sin bloquear cuando se usa sendEmailSafe", async () => {
  const tenant = await createTenant("Email");
  const recipient = nextEmail("email-log");

  const result = await sendEmailSafe({ tenantId: tenant.id, to: recipient, template: "qa_failure", subject: "QA", html: "<p>QA</p>" });
  assert.equal(result.ok, false);

  const emailLog = await prisma.emailLog.findFirstOrThrow({ where: { recipient, template: "qa_failure" } });
  assert.equal(emailLog.status, "FAILED");
  assert.equal(emailLog.tenantId, tenant.id);
});

test("persiste AuditLog centralizado con metadata segura", async () => {
  const tenant = await createTenant("Audit");

  const audit = await registerAuditLog({
    tenantId: tenant.id,
    action: AuditAction.PQRS_CREATED,
    targetType: "QA",
    targetId: RUN_ID,
    metadata: { runId: RUN_ID, token: "secret-token", visible: "ok" },
  });

  const stored = await prisma.auditLog.findUniqueOrThrow({ where: { id: audit.id } });
  assert.equal(stored.tenantId, tenant.id);
  assert.deepEqual(stored.metadata, { runId: RUN_ID, token: "[REDACTED]", visible: "ok" });
});

test("guarda solo el hash del token de invitacion", async () => {
  const tenant = await createTenant("Hash");
  const inviter = await createUser(tenant.id, "ADMIN");
  const { invitation, token } = await createInvitation({ tenantId: tenant.id, email: nextEmail("hash"), role: "RESIDENTE", invitedById: inviter.id });

  const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
  assert.notEqual(stored.tokenHash, token);
  assert.equal(stored.tokenHash, hashInvitationToken(token));
});
