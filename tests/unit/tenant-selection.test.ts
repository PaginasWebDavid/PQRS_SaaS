import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import {
  resolveSelectedMembership,
  signTenantSelection,
  verifyTenantSelection,
  type MembershipOption,
} from "../../src/lib/tenant-selection";

const memberships: MembershipOption[] = [
  {
    id: "membership-a",
    tenantId: "tenant-a",
    tenantName: "Conjunto A",
    role: "ADMIN",
  },
  {
    id: "membership-b",
    tenantId: "tenant-b",
    tenantName: "Conjunto B",
    role: "RESIDENTE",
  },
];
let previousSecret: string | undefined;

before(() => {
  previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "phase6a-test-secret";
});

after(() => {
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
});

test("1. una membresia se autoselecciona", () => {
  assert.equal(
    resolveSelectedMembership([memberships[0]], null)?.id,
    "membership-a"
  );
});

test("2. varias membresias sin preferencia no eligen la primera", () => {
  assert.equal(resolveSelectedMembership(memberships, null), null);
});

test("3. preferencia valida selecciona su membresia", () => {
  assert.equal(
    resolveSelectedMembership(memberships, "tenant-b")?.role,
    "RESIDENTE"
  );
});

test("4. preferencia ajena no produce seleccion", () => {
  assert.equal(
    resolveSelectedMembership(memberships, "tenant-foreign"),
    null
  );
});

test("5. cookie firmada queda vinculada al usuario", () => {
  const cookie = signTenantSelection("user-a", "tenant-a");
  assert.equal(verifyTenantSelection(cookie, "user-a"), "tenant-a");
  assert.equal(verifyTenantSelection(cookie, "user-b"), null);
});

test("6. alterar payload invalida la cookie", () => {
  const cookie = signTenantSelection("user-a", "tenant-a");
  const [payload, signature] = cookie.split(".");
  assert.equal(
    verifyTenantSelection(`${payload}x.${signature}`, "user-a"),
    null
  );
});

test("7. alterar firma invalida la cookie", () => {
  const cookie = signTenantSelection("user-a", "tenant-a");
  assert.equal(verifyTenantSelection(`${cookie}x`, "user-a"), null);
});

test("8. valores vacios o mal formados fallan cerrados", () => {
  assert.equal(verifyTenantSelection(null, "user-a"), null);
  assert.equal(verifyTenantSelection("invalid", "user-a"), null);
});
