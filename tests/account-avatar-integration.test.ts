import assert from "node:assert/strict";
import test, { after, afterEach, before } from "node:test";
import { prisma } from "../src/lib/prisma";
import {
  __unsafeSetAvatarTestHook,
  removeGlobalUserAvatar,
  replaceGlobalUserAvatar,
} from "../src/domains/account/avatar.service";

const RUN = `avatar-security-${Date.now()}`;
const userIds: string[] = [];
const calls: Array<{ method: string; url: string }> = [];
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const originalFetch = global.fetch;
const oldEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
};

async function createUser(active = true) {
  const user = await prisma.user.create({
    data: {
      email: `${RUN}-${userIds.length + 1}@example.test`,
      name: "QA Avatar",
      password: "not-used",
      role: "RESIDENTE",
      isActive: active,
    },
  });
  userIds.push(user.id);
  return user;
}

before(async () => {
  process.env.SUPABASE_URL = "https://avatar-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_STORAGE_BUCKET = "avatar-test";
  global.fetch = async (input, init) => {
    calls.push({ method: init?.method || "GET", url: String(input) });
    return new Response("", { status: 200 });
  };
  await prisma.$connect();
});

afterEach(() => {
  calls.length = 0;
  __unsafeSetAvatarTestHook(null);
});

after(async () => {
  __unsafeSetAvatarTestHook(null);
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorUserId: { in: userIds } }, { targetId: { in: userIds } }] } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  global.fetch = originalFetch;
  if (oldEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldEnv.url;
  if (oldEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldEnv.key;
  if (oldEnv.bucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET; else process.env.SUPABASE_STORAGE_BUCKET = oldEnv.bucket;
  await prisma.$disconnect();
});

test("1. avatar propio usa path del userId global y persiste URL publica", async () => {
  const user = await createUser();
  const result = await replaceGlobalUserAvatar({ userId: user.id, fileName: "foto.png", contentType: "image/png", buffer: png });
  assert.ok(result.image?.includes(`/users/${user.id}/avatar-`));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "PUT");
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image, result.image);
});

test("2. dos usuarios reciben paths globales distintos sin tenant", async () => {
  const first = await createUser();
  const second = await createUser();
  const one = await replaceGlobalUserAvatar({ userId: first.id, fileName: "one.png", contentType: "image/png", buffer: png });
  const two = await replaceGlobalUserAvatar({ userId: second.id, fileName: "two.png", contentType: "image/png", buffer: png });
  assert.notEqual(one.image, two.image);
  assert.ok(one.image?.includes(first.id));
  assert.ok(two.image?.includes(second.id));
});

test("3. reemplazo confirma nuevo upload antes de eliminar el anterior", async () => {
  const user = await createUser();
  const first = await replaceGlobalUserAvatar({ userId: user.id, fileName: "first.png", contentType: "image/png", buffer: png });
  calls.length = 0;
  const second = await replaceGlobalUserAvatar({ userId: user.id, fileName: "second.png", contentType: "image/png", buffer: png });
  assert.notEqual(first.image, second.image);
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "DELETE"]);
  assert.ok(calls[1]?.url.includes(first.image!.split("/").pop()!));
});

test("4. fallo DB despues de upload compensa eliminando archivo nuevo", async () => {
  const user = await createUser();
  __unsafeSetAvatarTestHook((step) => {
    if (step === "AFTER_AVATAR_UPLOAD") throw new Error("CONTROLLED_AVATAR_DB_FAILURE");
  });
  await assert.rejects(() => replaceGlobalUserAvatar({ userId: user.id, fileName: "failure.png", contentType: "image/png", buffer: png }), /CONTROLLED_AVATAR_DB_FAILURE/);
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "DELETE"]);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image, null);
});

test("5. eliminacion usa exclusivamente la URL almacenada", async () => {
  const user = await createUser();
  const created = await replaceGlobalUserAvatar({ userId: user.id, fileName: "delete.png", contentType: "image/png", buffer: png });
  calls.length = 0;
  const result = await removeGlobalUserAvatar({ userId: user.id });
  assert.equal(result.image, null);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "DELETE");
  assert.ok(calls[0]?.url.includes(created.image!.split("/").pop()!));
});

test("6. cuenta global inactiva no sube ni elimina avatar", async () => {
  const user = await createUser(false);
  await assert.rejects(() => replaceGlobalUserAvatar({ userId: user.id, fileName: "inactive.png", contentType: "image/png", buffer: png }), /No autorizado/);
  await assert.rejects(() => removeGlobalUserAvatar({ userId: user.id }), /No autorizado/);
  assert.equal(calls.length, 0);
});

test("7. URL historica o ajena se desvincula sin borrar path arbitrario", async () => {
  const user = await createUser();
  await prisma.user.update({ where: { id: user.id }, data: { image: "https://attacker.example/arbitrary.png" } });
  await removeGlobalUserAvatar({ userId: user.id });
  assert.equal(calls.length, 0);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).image, null);
});