import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  inspectInvitation,
  resendInvitation,
} from "../src/domains/organizations/invitation.service";
import { updateManagedUser } from "../src/domains/organizations/user-management.service";

const RUN = `phase5a-${Date.now()}`;
let sequence = 0;
let previousResendApiKey: string | undefined;

function email(prefix: string) {
  sequence += 1;
  return `${prefix}-${RUN}-${sequence}@example.com`;
}

async function tenant(prefix: string) {
  sequence += 1;
  return prisma.tenant.create({
    data: {
      name: `${prefix} ${sequence}`,
      slug: `${RUN}-${prefix.toLowerCase()}-${sequence}`,
    },
  });
}

async function user(tenantId: string, role: Role = "ADMIN", userEmail?: string) {
  return prisma.user.create({
    data: {
      tenantId,
      role,
      email: userEmail || email(role.toLowerCase()),
      name: `QA ${role}`,
      password: "not-used-in-test",
      isActive: true,
      ...(role !== "SUPER_ADMIN" ? { memberships: { create: { tenantId, role, isActive: true } } } : {}),
    },
  });
}

before(async () => {
  previousResendApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  await prisma.$connect();
});

after(async () => {
  const tenantIds = (
    await prisma.tenant.findMany({
      where: { slug: { startsWith: RUN } },
      select: { id: true },
    })
  ).map((entry) => entry.id);

  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.emailLog.deleteMany({
    where: {
      OR: [
        { tenantId: { in: tenantIds } },
        { recipient: { contains: RUN } },
      ],
    },
  });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.invitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.session.deleteMany({
    where: { user: { tenantId: { in: tenantIds } } },
  });
  await prisma.account.deleteMany({
    where: { user: { tenantId: { in: tenantIds } } },
  });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();

  if (previousResendApiKey) {
    process.env.RESEND_API_KEY = previousResendApiKey;
  }
});

test("9. el ultimo ADMIN activo queda protegido", async () => {
  const currentTenant = await tenant("LastAdmin");
  const admin = await user(currentTenant.id);
  await assert.rejects(
    updateManagedUser({
      tenantId: currentTenant.id,
      actorUserId: "super-admin-actor",
      targetUserId: admin.id,
      isActive: false,
    }),
    /al menos un administrador activo/
  );
  assert.equal(
    (
      await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })
    ).isActive,
    true
  );
});

test("10. ADMIN no puede auto-desactivarse", async () => {
  const currentTenant = await tenant("SelfAdmin");
  const admin = await user(currentTenant.id);
  await assert.rejects(
    updateManagedUser({
      tenantId: currentTenant.id,
      actorUserId: admin.id,
      targetUserId: admin.id,
      isActive: false,
    }),
    /propio rol ni desactivar/
  );
});

test("12. dos invitaciones concurrentes dejan una sola pendiente", async () => {
  const currentTenant = await tenant("Duplicate");
  const admin = await user(currentTenant.id);
  const recipient = email("duplicate");
  const outcomes = await Promise.allSettled([
    createInvitation({
      tenantId: currentTenant.id,
      email: recipient,
      role: "RESIDENTE",
      invitedById: admin.id,
    }),
    createInvitation({
      tenantId: currentTenant.id,
      email: recipient.toUpperCase(),
      role: "RESIDENTE",
      invitedById: admin.id,
    }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((entry) => entry.status === "rejected").length, 1);
  assert.equal(
    await prisma.invitation.count({
      where: {
        tenantId: currentTenant.id,
        email: recipient,
        status: "PENDING",
      },
    }),
    1
  );
});

test("13. token valido permite inspeccionar la invitacion", async () => {
  const currentTenant = await tenant("Valid");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("valid"),
    role: "CONSEJO",
    invitedById: admin.id,
  });
  const inspected = await inspectInvitation(created.token);
  assert.equal(inspected.tenant.id, currentTenant.id);
  assert.equal(inspected.role, "CONSEJO");
});

test("14. token expirado no puede aceptarse", async () => {
  const currentTenant = await tenant("Expired");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("expired"),
    role: "RESIDENTE",
    invitedById: admin.id,
    expiresInHours: -1,
  });
  await assert.rejects(
    acceptInvitation({
      token: created.token,
      password: "ValidPass123",
      name: "Expired QA",
      bloque: 1,
      apto: 101,
      acceptedLegal: true,
    }),
    /vencida/
  );
  assert.equal(
    (
      await prisma.invitation.findUniqueOrThrow({
        where: { id: created.invitation.id },
      })
    ).status,
    "EXPIRED"
  );
});

test("15. token cancelado no puede aceptarse", async () => {
  const currentTenant = await tenant("Cancelled");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("cancelled"),
    role: "RESIDENTE",
    invitedById: admin.id,
  });
  await cancelInvitation({
    tenantId: currentTenant.id,
    invitationId: created.invitation.id,
    actorUserId: admin.id,
  });
  await assert.rejects(
    acceptInvitation({
      token: created.token,
      password: "ValidPass123",
      name: "Cancelled QA",
      bloque: 1,
      apto: 101,
      acceptedLegal: true,
    }),
    /cancelada/
  );
});

test("16. token aceptado no puede reutilizarse", async () => {
  const currentTenant = await tenant("Used");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("used"),
    role: "CONSEJO",
    invitedById: admin.id,
  });
  await acceptInvitation({
    token: created.token,
    password: "ValidPass123",
    name: "Consejo QA",
    acceptedLegal: true,
  });
  await assert.rejects(
    acceptInvitation({
      token: created.token,
      password: "ValidPass123",
      name: "Consejo QA",
      acceptedLegal: true,
    }),
    /utilizada/
  );
});

test("17. dos aceptaciones concurrentes crean un solo usuario", async () => {
  const currentTenant = await tenant("Concurrent");
  const admin = await user(currentTenant.id);
  const recipient = email("concurrent");
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: recipient,
    role: "RESIDENTE",
    invitedById: admin.id,
  });
  const outcomes = await Promise.allSettled([
    acceptInvitation({
      token: created.token,
      password: "ValidPass123",
      name: "Resident QA",
      bloque: 2,
      apto: 202,
      acceptedLegal: true,
    }),
    acceptInvitation({
      token: created.token,
      password: "ValidPass123",
      name: "Resident QA",
      bloque: 2,
      apto: 202,
      acceptedLegal: true,
    }),
  ]);
  assert.equal(outcomes.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((entry) => entry.status === "rejected").length, 1);
  assert.equal(await prisma.user.count({ where: { email: recipient } }), 1);
});

test("18. aceptar crea usuario e invalida token en la misma transaccion", async () => {
  const currentTenant = await tenant("Atomic");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("atomic"),
    role: "RESIDENTE",
    invitedById: admin.id,
  });
  const accepted = await acceptInvitation({
    token: created.token,
    password: "ValidPass123",
    name: "Atomic QA",
    bloque: 3,
    apto: 303,
    acceptedLegal: true,
  });
  const stored = await prisma.invitation.findUniqueOrThrow({
    where: { id: created.invitation.id },
  });
  assert.equal(stored.status, "ACCEPTED");
  assert.ok(stored.acceptedAt);
  assert.equal(accepted.user.tenantId, currentTenant.id);
});

test("19. fallo creando usuario revierte el claim del token", async () => {
  const currentTenant = await tenant("Rollback");
  const admin = await user(currentTenant.id);
  const recipient = email("rollback");
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: recipient,
    role: "CONSEJO",
    invitedById: admin.id,
  });
  await user(currentTenant.id, "CONSEJO", recipient);
  await assert.rejects(
    acceptInvitation({
      token: created.token,
      password: "ValidPass123",
      name: "Rollback QA",
      acceptedLegal: true,
    }),
    /correo/
  );
  const stored = await prisma.invitation.findUniqueOrThrow({
    where: { id: created.invitation.id },
  });
  assert.equal(stored.status, "PENDING");
  assert.equal(stored.acceptedAt, null);
});

test("20. rol y tenant salen de la invitacion", async () => {
  const currentTenant = await tenant("StoredPolicy");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("stored"),
    role: "CONSEJO",
    invitedById: admin.id,
  });
  const accepted = await acceptInvitation({
    token: created.token,
    password: "ValidPass123",
    name: "Policy QA",
    acceptedLegal: true,
  });
  assert.equal(accepted.user.role, "CONSEJO");
  assert.equal(accepted.user.tenantId, currentTenant.id);
});

test("21. reenvio rota token y no revive una cancelada", async () => {
  const currentTenant = await tenant("Resend");
  const admin = await user(currentTenant.id);
  const created = await createInvitation({
    tenantId: currentTenant.id,
    email: email("resend"),
    role: "RESIDENTE",
    invitedById: admin.id,
  });
  const resent = await resendInvitation({
    tenantId: currentTenant.id,
    invitationId: created.invitation.id,
    actorUserId: admin.id,
  });
  await assert.rejects(inspectInvitation(created.token), /valida|disponible/);
  assert.equal((await inspectInvitation(resent.token)).role, "RESIDENTE");

  await cancelInvitation({
    tenantId: currentTenant.id,
    invitationId: created.invitation.id,
    actorUserId: admin.id,
  });
  await assert.rejects(
    resendInvitation({
      tenantId: currentTenant.id,
      invitationId: created.invitation.id,
      actorUserId: admin.id,
    }),
    /disponible/
  );
});

test("22. cancelacion queda limitada al tenant", async () => {
  const tenantA = await tenant("CancelA");
  const tenantB = await tenant("CancelB");
  const admin = await user(tenantA.id);
  const created = await createInvitation({
    tenantId: tenantA.id,
    email: email("cross-cancel"),
    role: "RESIDENTE",
    invitedById: admin.id,
  });
  await assert.rejects(
    cancelInvitation({
      tenantId: tenantB.id,
      invitationId: created.invitation.id,
      actorUserId: admin.id,
    }),
    /no encontrada/
  );
});

test("camino autorizado permite gestionar un usuario del mismo tenant", async () => {
  const currentTenant = await tenant("Managed");
  const adminOne = await user(currentTenant.id);
  await user(currentTenant.id);
  const resident = await user(currentTenant.id, "RESIDENTE");
  const updated = await updateManagedUser({
    tenantId: currentTenant.id,
    actorUserId: adminOne.id,
    targetUserId: resident.id,
    bloque: 4,
    apto: 404,
    isActive: false,
  });
  assert.equal(updated.isActive, false);
  assert.equal(updated.bloque, 4);
  assert.equal(updated.apto, 404);
});
