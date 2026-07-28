import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
  assertAvatarFileName,
  assertGlobalAvatarPath,
  buildGlobalAvatarStoragePath,
  getOwnedGlobalAvatarPathFromUrl,
  matchesDeclaredType,
} from "../../src/lib/storage";
import {
  AVATAR_MAX_SIZE,
  AvatarValidationError,
  validateAvatarInput,
} from "../../src/domains/account/avatar.service";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Buffer.from("RIFF0000WEBP", "ascii");
const oldEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
};

beforeEach(() => {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  process.env.SUPABASE_STORAGE_BUCKET = "avatars-test";
});
afterEach(() => {
  if (oldEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldEnv.url;
  if (oldEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldEnv.key;
  if (oldEnv.bucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET; else process.env.SUPABASE_STORAGE_BUCKET = oldEnv.bucket;
});

test("1. firmas binarias reales se reconocen", () => {
  assert.equal(matchesDeclaredType(png, "image/png"), true);
  assert.equal(matchesDeclaredType(jpeg, "image/jpeg"), true);
  assert.equal(matchesDeclaredType(webp, "image/webp"), true);
});

test("2. MIME declarado que no coincide con bytes falla", () => {
  assert.throws(() => validateAvatarInput({ fileName: "avatar.png", contentType: "image/png", buffer: jpeg }), AvatarValidationError);
});

test("3. MIME fuera de whitelist falla", () => {
  assert.throws(() => validateAvatarInput({ fileName: "avatar.svg", contentType: "image/svg+xml", buffer: png }), AvatarValidationError);
});

test("4. extension debe corresponder al MIME", () => {
  assert.doesNotThrow(() => assertAvatarFileName("foto.jpeg", "image/jpeg"));
  assert.throws(() => assertAvatarFileName("foto.exe", "image/jpeg"), /AVATAR_FILE_INVALID/);
});

test("5. traversal, path y nombres excesivos fallan", () => {
  for (const name of ["../foto.png", "folder/foto.png", "folder\\foto.png", "a".repeat(181) + ".png"]) {
    assert.throws(() => assertAvatarFileName(name, "image/png"), /AVATAR_FILE_INVALID/);
  }
});

test("6. archivo vacio o excesivo falla", () => {
  assert.throws(() => validateAvatarInput({ fileName: "foto.png", contentType: "image/png", buffer: Buffer.alloc(0) }), AvatarValidationError);
  assert.throws(() => validateAvatarInput({ fileName: "foto.png", contentType: "image/png", buffer: Buffer.alloc(AVATAR_MAX_SIZE + 1) }), AvatarValidationError);
});

test("7. path usa userId global y no email, tenant ni nombre original", () => {
  const path = buildGlobalAvatarStoragePath({ userId: "user_123", contentType: "image/png", objectId: "object_1" });
  assert.equal(path, "users/user_123/avatar-object_1.png");
  assert.equal(path.includes("tenant"), false);
  assert.equal(path.includes("@"), false);
});

test("8. un path de otro usuario es rechazado", () => {
  assert.doesNotThrow(() => assertGlobalAvatarPath("users/user_a/avatar-object.png", "user_a"));
  assert.throws(() => assertGlobalAvatarPath("users/user_a/avatar-object.png", "user_b"), /AVATAR_PATH_INVALID/);
});

test("9. URL publica propia se convierte a path y una ajena no", () => {
  const own = "https://project.supabase.co/storage/v1/object/public/avatars-test/users/user_a/avatar-object.png";
  assert.equal(getOwnedGlobalAvatarPathFromUrl(own, "user_a"), "users/user_a/avatar-object.png");
  assert.equal(getOwnedGlobalAvatarPathFromUrl(own, "user_b"), null);
  assert.equal(getOwnedGlobalAvatarPathFromUrl("https://attacker.example/x", "user_a"), null);
});

test("10. query, fragmento y path codificado arbitrario no se aceptan", () => {
  const base = "https://project.supabase.co/storage/v1/object/public/avatars-test/";
  assert.equal(getOwnedGlobalAvatarPathFromUrl(base + "users/user_a/avatar-object.png?x=1", "user_a"), null);
  assert.equal(getOwnedGlobalAvatarPathFromUrl(base + "users/user_a/%2e%2e.png", "user_a"), null);
});