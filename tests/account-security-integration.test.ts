import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  __unsafeSetAccountSecurityTestHook,
  changeGlobalPassword,
  createPasswordResetRequest,
  resetGlobalPassword,
} from "../src/domains/account/account.service";
import { hashPasswordResetToken } from "../src/domains/account/account-security";
import { POST as forgotPasswordPost } from "../src/app/api/auth/forgot-password/route";
import { NextRequest } from "next/server";

const RUN = `account-security-${Date.now()}`;
const userIds: string[] = [];
const tenantIds: string[] = [];
let counter = 0;
const ORIGINAL_APP_URL = process.env.APP_URL;
const ORIGINAL_RESEND_KEY = process.env.RESEND_API_KEY;

async function createUser(options: { active?: boolean; memberships?: number } = {}) {
  counter += 1;
  const email = `${RUN}-${counter}@example.test`;
  const password = `Current password ${counter}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `QA User ${counter}`,
      password: await bcrypt.hash(password, 4),
      role: "RESIDENTE",
      isActive: options.active ?? true,
    },
  });
  userIds.push(user.id);
  for (let index = 0; index < (options.memberships ?? 0); index += 1) {
    const tenant = await prisma.tenant.create({
      data: { name: `QA Account ${counter}-${index}`, slug: `${RUN}-${counter}-${index}` },
    });
    tenantIds.push(tenant.id);
    await prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: tenant.id, role: index === 0 ? "ADMIN" : "RESIDENTE" },
    });
  }
  return { user, email, password };
}

async function createSession(userId: string) {
  return prisma.session.create({
    data: { userId, sessionToken: `${RUN}-session-${++counter}`, expires: new Date(Date.now() + 3600000) },
  });
}

before(async () => {
  process.env.APP_URL = "http://localhost:3002";
  delete process.env.RESEND_API_KEY;
  await prisma.$connect();
});

after(async () => {
  __unsafeSetAccountSecurityTestHook(null);
  await prisma.verificationToken.deleteMany({ where: { identifier: { contains: RUN } } });
  await prisma.emailLog.deleteMany({ where: { recipient: { contains: RUN } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: userIds } }] } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  if (ORIGINAL_APP_URL === undefined) delete process.env.APP_URL; else process.env.APP_URL = ORIGINAL_APP_URL;
  if (ORIGINAL_RESEND_KEY === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = ORIGINAL_RESEND_KEY;
  await prisma.$disconnect();
});

test("1. cambio valido actualiza hash, version, fecha, auditoria y revoca Session", async () => {
  const value = await createUser();
  await createSession(value.user.id);
  await changeGlobalPassword({
    userId: value.user.id,
    currentPassword: value.password,
    newPassword: "A completely new password",
    confirmPassword: "A completely new password",
  });
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: value.user.id } });
  assert.equal(await bcrypt.compare("A completely new password", updated.password), true);
  assert.equal(updated.sessionVersion, 1);
  assert.ok(updated.passwordChangedAt);
  assert.equal(await prisma.session.count({ where: { userId: value.user.id } }), 0);
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { actorUserId: value.user.id, action: "PASSWORD_CHANGED" } });
  const serialized = JSON.stringify(audit.metadata);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes(updated.password), false);
});

test("2. contrasena actual incorrecta no modifica cuenta", async () => {
  const value = await createUser();
  await assert.rejects(() => changeGlobalPassword({
    userId: value.user.id,
    currentPassword: "incorrect password",
    newPassword: "Another secure password",
    confirmPassword: "Another secure password",
  }), /contrasena actual/i);
  const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: value.user.id } });
  assert.equal(unchanged.sessionVersion, 0);
  assert.equal(await bcrypt.compare(value.password, unchanged.password), true);
});

test("3. nueva contrasena igual se rechaza", async () => {
  const value = await createUser();
  await assert.rejects(() => changeGlobalPassword({
    userId: value.user.id,
    currentPassword: value.password,
    newPassword: value.password,
    confirmPassword: value.password,
  }), /diferente/i);
});

test("4. recuperacion almacena solo hash y una solicitud nueva invalida la anterior", async () => {
  const value = await createUser();
  const first = await createPasswordResetRequest(`  ${value.email.toUpperCase()} `);
  assert.ok(first.delivery);
  const storedFirst = await prisma.verificationToken.findUniqueOrThrow({ where: { token: hashPasswordResetToken(first.delivery!.token) } });
  assert.notEqual(storedFirst.token, first.delivery!.token);
  const second = await createPasswordResetRequest(value.email);
  assert.ok(second.delivery);
  assert.equal(await prisma.verificationToken.count({ where: { identifier: value.email } }), 1);
  assert.equal(await prisma.verificationToken.findUnique({ where: { token: storedFirst.token } }), null);
});

test("5. endpoint publico no enumera cuenta existente o inexistente", async () => {
  const value = await createUser();
  const existing = await forgotPasswordPost(new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: value.email }),
  }));
  const missing = await forgotPasswordPost(new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `${RUN}-missing@example.test` }),
  }));
  assert.equal(existing.status, 200);
  assert.equal(missing.status, 200);
  assert.deepEqual(await existing.json(), await missing.json());
});

test("6. token valido resetea globalmente, revoca sesiones y no altera membresias", async () => {
  const value = await createUser({ memberships: 2 });
  await createSession(value.user.id);
  const membershipsBefore = await prisma.tenantMembership.findMany({ where: { userId: value.user.id }, orderBy: { tenantId: "asc" } });
  const request = await createPasswordResetRequest(value.email);
  await resetGlobalPassword({
    token: request.delivery!.token,
    newPassword: "Password reset globally",
    confirmPassword: "Password reset globally",
  });
  const updated = await prisma.user.findUniqueOrThrow({ where: { id: value.user.id } });
  assert.equal(await bcrypt.compare("Password reset globally", updated.password), true);
  assert.equal(updated.sessionVersion, 1);
  assert.equal(await prisma.session.count({ where: { userId: value.user.id } }), 0);
  const membershipsAfter = await prisma.tenantMembership.findMany({ where: { userId: value.user.id }, orderBy: { tenantId: "asc" } });
  assert.deepEqual(membershipsAfter, membershipsBefore);
});

test("7. token expirado falla y no cambia password", async () => {
  const value = await createUser();
  const request = await createPasswordResetRequest(value.email);
  const hash = hashPasswordResetToken(request.delivery!.token);
  await prisma.verificationToken.update({ where: { token: hash }, data: { expires: new Date(Date.now() - 1000) } });
  await assert.rejects(() => resetGlobalPassword({ token: request.delivery!.token, newPassword: "Expired token password", confirmPassword: "Expired token password" }), /no es valido/i);
  assert.equal(await bcrypt.compare(value.password, (await prisma.user.findUniqueOrThrow({ where: { id: value.user.id } })).password), true);
});

test("8. token usado no puede reutilizarse", async () => {
  const value = await createUser();
  const request = await createPasswordResetRequest(value.email);
  await resetGlobalPassword({ token: request.delivery!.token, newPassword: "First reset password", confirmPassword: "First reset password" });
  await assert.rejects(() => resetGlobalPassword({ token: request.delivery!.token, newPassword: "Second reset password", confirmPassword: "Second reset password" }), /no es valido/i);
});

test("9. dos resets concurrentes permiten exactamente uno", async () => {
  const value = await createUser();
  const request = await createPasswordResetRequest(value.email);
  const results = await Promise.allSettled([
    resetGlobalPassword({ token: request.delivery!.token, newPassword: "Concurrent password one", confirmPassword: "Concurrent password one" }),
    resetGlobalPassword({ token: request.delivery!.token, newPassword: "Concurrent password two", confirmPassword: "Concurrent password two" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: value.user.id } })).sessionVersion, 1);
});

test("10. fallo despues de reclamar token revierte consumo y password", async () => {
  const value = await createUser();
  const request = await createPasswordResetRequest(value.email);
  const hash = hashPasswordResetToken(request.delivery!.token);
  __unsafeSetAccountSecurityTestHook((step) => {
    if (step === "AFTER_RESET_TOKEN_CLAIMED") throw new Error("CONTROLLED_TEST_FAILURE");
  });
  await assert.rejects(() => resetGlobalPassword({ token: request.delivery!.token, newPassword: "Rollback reset password", confirmPassword: "Rollback reset password" }), /CONTROLLED_TEST_FAILURE/);
  __unsafeSetAccountSecurityTestHook(null);
  assert.ok(await prisma.verificationToken.findUnique({ where: { token: hash } }));
  assert.equal(await bcrypt.compare(value.password, (await prisma.user.findUniqueOrThrow({ where: { id: value.user.id } })).password), true);
});

test("11. cuenta inactiva no recibe token ni puede cambiar o resetear password", async () => {
  const value = await createUser({ active: false });
  const request = await createPasswordResetRequest(value.email);
  assert.equal(request.delivery, null);
  assert.equal(await prisma.verificationToken.count({ where: { identifier: value.email } }), 0);
  await assert.rejects(() => changeGlobalPassword({ userId: value.user.id, currentPassword: value.password, newPassword: "Inactive account password", confirmPassword: "Inactive account password" }), /No autorizado/);
});

test("12. auditoria y token persistido no contienen token crudo", async () => {
  const value = await createUser();
  const request = await createPasswordResetRequest(value.email);
  const raw = request.delivery!.token;
  const audits = await prisma.auditLog.findMany({ where: { actorUserId: value.user.id } });
  assert.equal(JSON.stringify(audits).includes(raw), false);
  const tokens = await prisma.verificationToken.findMany({ where: { identifier: value.email } });
  assert.equal(JSON.stringify(tokens).includes(raw), false);
});