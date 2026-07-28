import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  AccountSecurityError,
  assertAllowedAccountPatchKeys,
  escapeAccountEmailHtml,
  generatePasswordResetToken,
  getAccountSecurityErrorResponse,
  getConfiguredApplicationOrigin,
  hashPasswordResetToken,
  isSessionVersionCurrent,
  normalizeAccountEmail,
  normalizeGlobalName,
  normalizeGlobalPhone,
  parseGlobalProfilePatch,
  validateCurrentPassword,
  validateNewPassword,
} from "../../src/domains/account/account-security";

const mutableEnv = process.env as Record<string, string | undefined>;
const originalAppUrl = mutableEnv.APP_URL;
const originalNextAuthUrl = mutableEnv.NEXTAUTH_URL;
const originalNodeEnv = mutableEnv.NODE_ENV;
afterEach(() => {
  if (originalAppUrl === undefined) delete mutableEnv.APP_URL; else mutableEnv.APP_URL = originalAppUrl;
  if (originalNextAuthUrl === undefined) delete mutableEnv.NEXTAUTH_URL; else mutableEnv.NEXTAUTH_URL = originalNextAuthUrl;
  if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV; else mutableEnv.NODE_ENV = originalNodeEnv;
});

test("1. perfil global devuelve solo nombre y telefono normalizados", () => {
  assert.deepEqual(parseGlobalProfilePatch({ name: "  Maria   Lopez  ", phone: " +57  300 123 4567 " }), {
    name: "Maria Lopez",
    phone: "+57 300 123 4567",
  });
});

test("2. whitelist bloquea userId, rol, tenant, membresia, estado, email, password e image", () => {
  for (const key of ["userId", "role", "tenantId", "membershipId", "isActive", "email", "password", "image", "createdAt"]) {
    assert.throws(() => assertAllowedAccountPatchKeys({ name: "Maria", [key]: "x" }), AccountSecurityError);
  }
});

test("3. whitelist admite solo extras tenant explicitos del endpoint compuesto", () => {
  assert.doesNotThrow(() => assertAllowedAccountPatchKeys({ name: "Maria", bloque: 1 }, ["bloque"]));
  assert.throws(() => assertAllowedAccountPatchKeys({ tenantId: "foreign" }, ["bloque"]), AccountSecurityError);
});

test("4. nombre invalido y controles son rechazados", () => {
  assert.throws(() => normalizeGlobalName("a"), AccountSecurityError);
  assert.throws(() => normalizeGlobalName(`Maria\u0000`), AccountSecurityError);
  assert.throws(() => normalizeGlobalName("x".repeat(121)), AccountSecurityError);
});

test("5. telefono es opcional pero estrictamente validado", () => {
  assert.equal(normalizeGlobalPhone(""), null);
  assert.equal(normalizeGlobalPhone(null), null);
  assert.throws(() => normalizeGlobalPhone("javascript:alert(1)"), AccountSecurityError);
});

test("6. email usa NFKC, trim, minusculas y limite", () => {
  assert.equal(normalizeAccountEmail("  MARIA@EXAMPLE.COM "), "maria@example.com");
  assert.equal(normalizeAccountEmail("not-an-email"), null);
  assert.equal(normalizeAccountEmail("a".repeat(321)), null);
});

test("7. password exige confirmacion, minimo y no hace trim", () => {
  assert.equal(validateNewPassword("  long password  ", "  long password  "), "  long password  ");
  assert.throws(() => validateNewPassword("short", "short"), AccountSecurityError);
  assert.throws(() => validateNewPassword("password one", "password two"), AccountSecurityError);
});

test("8. password excesiva por caracteres o limite bcrypt se rechaza", () => {
  assert.throws(() => validateNewPassword("a".repeat(129), "a".repeat(129)), AccountSecurityError);
  const unicode = "contrasena-" + "😀".repeat(40);
  assert.throws(() => validateNewPassword(unicode, unicode), AccountSecurityError);
});

test("9. password actual ausente o excesiva usa error publico generico", () => {
  assert.throws(() => validateCurrentPassword(""), AccountSecurityError);
  assert.throws(() => validateCurrentPassword("a".repeat(129)), AccountSecurityError);
});

test("10. token se genera aleatorio y solo su hash es persistible", () => {
  const first = generatePasswordResetToken();
  const second = generatePasswordResetToken();
  assert.match(first.token, /^[a-f0-9]{64}$/);
  assert.match(first.tokenHash, /^[a-f0-9]{64}$/);
  assert.notEqual(first.token, first.tokenHash);
  assert.notEqual(first.token, second.token);
  assert.equal(hashPasswordResetToken(first.token), first.tokenHash);
});

test("11. token malformado falla con mensaje permitido", () => {
  assert.throws(() => hashPasswordResetToken("../secret"), AccountSecurityError);
  const result = getAccountSecurityErrorResponse(new AccountSecurityError("RESET_TOKEN_INVALID"));
  assert.deepEqual(result, {
    status: 400,
    body: { error: "El enlace no es valido, expiro o ya fue utilizado", code: "RESET_TOKEN_INVALID" },
  });
});

test("12. sessionVersion exige numero exacto y revoca versiones anteriores", () => {
  assert.equal(isSessionVersionCurrent(4, 4), true);
  assert.equal(isSessionVersionCurrent(3, 4), false);
  assert.equal(isSessionVersionCurrent(undefined, 0), false);
  assert.equal(isSessionVersionCurrent("4", 4), false);
});

test("13. origen solo viene de configuracion segura", () => {
  mutableEnv.NODE_ENV = "production";
  mutableEnv.APP_URL = "https://pqrs.example.com/path";
  assert.equal(getConfiguredApplicationOrigin(), "https://pqrs.example.com");
  mutableEnv.APP_URL = "http://attacker.example.com";
  assert.throws(() => getConfiguredApplicationOrigin(), /ACCOUNT_APP_ORIGIN_INSECURE/);
});

test("14. localhost HTTP solo se admite fuera de produccion", () => {
  mutableEnv.NODE_ENV = "test";
  mutableEnv.APP_URL = "http://localhost:3002";
  assert.equal(getConfiguredApplicationOrigin(), "http://localhost:3002");
});

test("15. HTML dinamico de email se escapa", () => {
  assert.equal(escapeAccountEmailHtml(`<img src=x onerror="x"> O'Reilly & Co`), "&lt;img src=x onerror=&quot;x&quot;&gt; O&#39;Reilly &amp; Co");
});