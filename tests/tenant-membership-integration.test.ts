import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  acceptInvitation,
  createInvitation,
} from "../src/domains/organizations/invitation.service";
import { updateManagedUser } from "../src/domains/organizations/user-management.service";
import {
  getUserMembershipContext,
  publicMemberships,
} from "../src/lib/membership-context";

const RUN = `phase6a-${Date.now()}`;
let sequence = 0;
let previousResendApiKey: string | undefined;

function email(prefix: string) {
  sequence += 1;
  return `${prefix}-${RUN}-${sequence}@example.com`;
}

async function createTenant(prefix: string) {
  sequence += 1;
  return prisma.tenant.create({
    data: {
      name: `${prefix} ${sequence}`,
      slug: `${RUN}-${prefix.toLowerCase()}-${sequence}`,
    },
  });
}

async function createMember(
  tenantId: string,
  role: Exclude<Role, "SUPER_ADMIN"> = "ADMIN",
  options: { email?: string; name?: string; isActive?: boolean } = {}
) {
  const user = await prisma.user.create({
    data: {
      email: options.email ?? email(role.toLowerCase()),
      name: options.name ?? `QA ${role}`,
      password: "unchanged-password-hash",
      isActive: true,
      // Campos legacy solo para confirmar que la logica nueva no depende de ellos.
      role,
      tenantId,
      memberships: {
        create: {
          tenantId,
          role,
          isActive: options.isActive ?? true,
        },
      },
    },
  });
  return user;
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
  ).map(({ id }) => id);
  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.emailLog.deleteMany({
    where: {
      OR: [{ tenantId: { in: tenantIds } }, { recipient: { contains: RUN } }],
    },
  });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.invitation.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantMembership.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
  if (previousResendApiKey) process.env.RESEND_API_KEY = previousResendApiKey;
});

test("1. backfill cubre usuarios tenant legacy y excluye SUPER_ADMIN", async () => {
  const missing = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "User" u
    LEFT JOIN "TenantMembership" m
      ON m."userId" = u.id AND m."tenantId" = u."tenantId"
    WHERE u."tenantId" IS NOT NULL
      AND u.role <> 'SUPER_ADMIN'
      AND m.id IS NULL
  `;
  assert.equal(Number(missing[0]?.count ?? 0), 0);
  const superAdmin = await prisma.user.create({
    data: {
      email: email("super"),
      name: "QA Super",
      password: "not-used",
      role: "SUPER_ADMIN",
    },
  });
  assert.equal(
    await prisma.tenantMembership.count({ where: { userId: superAdmin.id } }),
    0
  );
});

test("2. unicidad impide dos membresias del mismo usuario y tenant", async () => {
  const tenant = await createTenant("Unique");
  const user = await createMember(tenant.id);
  await assert.rejects(
    prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: tenant.id, role: "RESIDENTE" },
    })
  );
});

test("3. correo existente crea solo membresia y conserva identidad global", async () => {
  const tenantA = await createTenant("ExistingA");
  const tenantB = await createTenant("ExistingB");
  const existingEmail = email("existing");
  const user = await createMember(tenantA.id, "RESIDENTE", {
    email: existingEmail,
    name: "Nombre Original",
  });
  const admin = await createMember(tenantB.id);
  const invitation = await createInvitation({
    tenantId: tenantB.id,
    email: existingEmail,
    role: "CONSEJO",
    invitedById: admin.id,
  });
  const accepted = await acceptInvitation({
    token: invitation.token,
    password: "PasswordThatMustNotReplace1",
    name: "Nombre Que No Debe Reemplazar",
    acceptedLegal: true,
  });
  const stored = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { memberships: true },
  });
  assert.equal(stored.name, "Nombre Original");
  assert.equal(stored.password, "unchanged-password-hash");
  assert.equal(stored.memberships.length, 2);
  assert.equal(accepted.membership.role, "CONSEJO");
});

test("4. dos aceptaciones concurrentes crean una sola membresia", async () => {
  const tenantA = await createTenant("ConcurrentA");
  const tenantB = await createTenant("ConcurrentB");
  const existingEmail = email("concurrent");
  const user = await createMember(tenantA.id, "RESIDENTE", {
    email: existingEmail,
  });
  const admin = await createMember(tenantB.id);
  const invitation = await createInvitation({
    tenantId: tenantB.id,
    email: existingEmail,
    role: "RESIDENTE",
    invitedById: admin.id,
  });
  const input = {
    token: invitation.token,
    password: "ValidPass123",
    name: "Concurrent QA",
    bloque: 2,
    apto: 202,
    acceptedLegal: true,
  };
  const outcomes = await Promise.allSettled([
    acceptInvitation(input),
    acceptInvitation(input),
  ]);
  assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(
    await prisma.tenantMembership.count({
      where: { userId: user.id, tenantId: tenantB.id },
    }),
    1
  );
});

test("5. rol cambia por tenant y se revalida sin claim legacy", async () => {
  const tenantA = await createTenant("RolesA");
  const tenantB = await createTenant("RolesB");
  const user = await createMember(tenantA.id, "ADMIN");
  await prisma.tenantMembership.create({
    data: { userId: user.id, tenantId: tenantB.id, role: "RESIDENTE" },
  });
  assert.equal(
    (await getUserMembershipContext(user.id, tenantA.id))?.selectedMembership
      ?.role,
    "ADMIN"
  );
  assert.equal(
    (await getUserMembershipContext(user.id, tenantB.id))?.selectedMembership
      ?.role,
    "RESIDENTE"
  );
});

test("6. desactivar membresia revoca tenant sin desactivar User", async () => {
  const tenant = await createTenant("Revoke");
  const adminOne = await createMember(tenant.id);
  const adminTwo = await createMember(tenant.id);
  await updateManagedUser({
    tenantId: tenant.id,
    actorUserId: adminTwo.id,
    targetUserId: adminOne.id,
    isActive: false,
  });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: adminOne.id } }))
      .isActive,
    true
  );
  assert.equal(
    (await getUserMembershipContext(adminOne.id, tenant.id))
      ?.selectedMembership,
    null
  );
});

test("7. ultimo ADMIN se calcula sobre membresias activas", async () => {
  const tenant = await createTenant("LastAdmin");
  const admin = await createMember(tenant.id);
  await assert.rejects(
    updateManagedUser({
      tenantId: tenant.id,
      actorUserId: "platform-actor",
      targetUserId: admin.id,
      isActive: false,
    }),
    /al menos un administrador activo/
  );
});

test("8. onboarding y ubicacion quedan aislados por membresia", async () => {
  const tenantA = await createTenant("OnboardingA");
  const tenantB = await createTenant("OnboardingB");
  const user = await createMember(tenantA.id, "RESIDENTE");
  const second = await prisma.tenantMembership.create({
    data: { userId: user.id, tenantId: tenantB.id, role: "RESIDENTE" },
  });
  const completedAt = new Date();
  await prisma.tenantMembership.update({
    where: { id: second.id },
    data: { bloque: 4, apto: 401, onboardingCompletedAt: completedAt },
  });
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId: user.id },
    orderBy: { tenantId: "asc" },
  });
  const first = memberships.find(({ tenantId }) => tenantId === tenantA.id);
  const updated = memberships.find(({ tenantId }) => tenantId === tenantB.id);
  assert.equal(first?.onboardingCompletedAt, null);
  assert.equal(first?.bloque, null);
  assert.equal(updated?.bloque, 4);
  assert.ok(updated?.onboardingCompletedAt);
});

test("9. selector publico devuelve solo membresias activas", async () => {
  const tenantA = await createTenant("SelectorA");
  const tenantB = await createTenant("SelectorB");
  const user = await createMember(tenantA.id, "ADMIN");
  await prisma.tenantMembership.create({
    data: {
      userId: user.id,
      tenantId: tenantB.id,
      role: "CONSEJO",
      isActive: false,
    },
  });
  const context = await getUserMembershipContext(user.id, tenantA.id);
  assert.ok(context);
  assert.deepEqual(publicMemberships(context!).map(({ tenantId }) => tenantId), [
    tenantA.id,
  ]);
});

test("10. PQRS de dos tenants no se mezclan para el mismo userId", async () => {
  const tenantA = await createTenant("PqrsA");
  const tenantB = await createTenant("PqrsB");
  const user = await createMember(tenantA.id, "RESIDENTE");
  await prisma.tenantMembership.create({
    data: { userId: user.id, tenantId: tenantB.id, role: "RESIDENTE" },
  });
  for (const [tenantId, marker] of [
    [tenantA.id, "A"],
    [tenantB.id, "B"],
  ] as const) {
    await prisma.pqrs.create({
      data: {
        tenantId,
        fechaRecibido: new Date(),
        mes: "Julio",
        bloque: 1,
        apto: 101,
        nombreResidente: marker,
        descripcion: marker,
        creadoPorId: user.id,
      },
    });
  }
  const visibleA = await prisma.pqrs.findMany({
    where: { tenantId: tenantA.id, creadoPorId: user.id },
  });
  assert.equal(visibleA.length, 1);
  assert.equal(visibleA[0].nombreResidente, "A");
});
