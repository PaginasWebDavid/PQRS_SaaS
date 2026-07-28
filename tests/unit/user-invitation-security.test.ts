import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ensureInvitableRole,
  escapeInvitationHtml,
  InvitationDomainError,
  mapInvitationError,
  normalizeInvitationEmail,
  prepareBulkInvitationEmails,
  publicInvitationEmailResult,
  validateInvitationAcceptance,
} from "../../src/domains/organizations/invitation-security";
import { managementTenantPolicy } from "../../src/domains/organizations/user-management-policy";

test("1. ADMIN usa exclusivamente su tenant", () => {
  assert.equal(
    managementTenantPolicy({
      role: "ADMIN",
      ownTenantId: "tenant-a",
      requestedTenantId: null,
    }),
    "tenant-a"
  );
});

test("2. ADMIN no puede seleccionar otro tenant", () => {
  assert.throws(
    () =>
      managementTenantPolicy({
        role: "ADMIN",
        ownTenantId: "tenant-a",
        requestedTenantId: "tenant-b",
      }),
    /Recurso no encontrado/
  );
});

test("3. CONSEJO y RESIDENTE no gestionan usuarios", () => {
  for (const role of ["CONSEJO", "RESIDENTE"] as const) {
    assert.throws(
      () =>
        managementTenantPolicy({
          role,
          ownTenantId: "tenant-a",
        }),
      /No autorizado/
    );
  }
});

test("4. SUPER_ADMIN exige target explicito", () => {
  assert.throws(
    () =>
      managementTenantPolicy({
        role: "SUPER_ADMIN",
        ownTenantId: null,
      }),
    /conjunto activo asignado/
  );
  assert.equal(
    managementTenantPolicy({
      role: "SUPER_ADMIN",
      ownTenantId: null,
      requestedTenantId: "tenant-a",
    }),
    "tenant-a"
  );
});

test("5. tenant del cliente no reemplaza el tenant efectivo del ADMIN", () => {
  assert.equal(
    managementTenantPolicy({
      role: "ADMIN",
      ownTenantId: "tenant-server",
      requestedTenantId: "tenant-server",
    }),
    "tenant-server"
  );
});

test("6. SUPER_ADMIN no es un rol invitable", () => {
  assert.throws(
    () => ensureInvitableRole("SUPER_ADMIN"),
    InvitationDomainError
  );
});

test("7. target cross-tenant es opaco", () => {
  try {
    managementTenantPolicy({
      role: "ADMIN",
      ownTenantId: "tenant-a",
      requestedTenantId: "tenant-b",
    });
    assert.fail("Debio rechazar el target");
  } catch (error) {
    assert.equal((error as { code?: string }).code, "RESOURCE_NOT_FOUND");
  }
});

test("8. aceptacion no admite tenant ni rol del cliente", () => {
  const accepted = validateInvitationAcceptance({
    token: "a".repeat(43),
    password: "ValidPass123",
    name: "Persona QA",
    role: "RESIDENTE",
    bloque: 1,
    apto: 101,
    acceptedLegal: true,
  });
  assert.equal("tenantId" in accepted, false);
  assert.equal("role" in accepted, false);
});

test("11. email se normaliza con espacios, mayusculas y Unicode compatible", () => {
  assert.equal(
    normalizeInvitationEmail("  ＴＥＳＴ＠ＥＸＡＭＰＬＥ．ＣＯＭ  "),
    "test@example.com"
  );
});

test("23. bulk deduplica y rechaza filas o roles arbitrarios", () => {
  assert.deepEqual(
    prepareBulkInvitationEmails([
      "Correo",
      " User@Example.com ",
      "user@example.com",
    ]),
    ["user@example.com"]
  );
  assert.throws(
    () => prepareBulkInvitationEmails(["ok@example.com", { tenantId: "otro" }]),
    /correos invalidos/
  );
  assert.throws(() => ensureInvitableRole("SUPER_ADMIN"), /Rol no permitido/);
});

test("24. error inesperado se vuelve generico", () => {
  const mapped = mapInvitationError(
    new Error("Prisma P2002 postgresql://user:password@host/db")
  );
  assert.deepEqual(mapped, {
    status: 500,
    message: "No se pudo procesar la invitacion",
  });
  assert.equal(JSON.stringify(mapped).includes("postgresql"), false);
});

test("25. respuestas administrativas no contienen token, hash ni URL privada", () => {
  assert.deepEqual(
    publicInvitationEmailResult({
      ok: false,
      providerMessageId: "provider-secret",
      errorMessage: "provider detail",
    }),
    { sent: false }
  );
  const routeFiles = [
    "src/app/api/invitations/route.ts",
    "src/app/api/invitations/[id]/resend/route.ts",
    "src/app/api/users/route.ts",
  ];
  for (const file of routeFiles) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("invitationUrl"), false);
    assert.equal(source.includes("result.token"), false);
    assert.equal(source.includes("tokenHash"), false);
  }
});

test("26. camino autorizado conserva datos validados y HTML escapado", () => {
  assert.equal(ensureInvitableRole(" residente "), "RESIDENTE");
  const accepted = validateInvitationAcceptance({
    token: "b".repeat(43),
    password: "ValidPass123",
    name: "  Residente QA  ",
    role: "RESIDENTE",
    bloque: "2",
    apto: "202",
    acceptedLegal: true,
  });
  assert.deepEqual(
    {
      name: accepted.name,
      bloque: accepted.bloque,
      apto: accepted.apto,
    },
    { name: "Residente QA", bloque: 2, apto: 202 }
  );
  assert.equal(
    escapeInvitationHtml('<script>"x"</script>'),
    "&lt;script&gt;&quot;x&quot;&lt;/script&gt;"
  );
});

test("credenciales y ubicacion tienen limites de seguridad", () => {
  assert.throws(
    () =>
      validateInvitationAcceptance({
        token: "c".repeat(43),
        password: "a".repeat(80) + "1",
        name: "Persona QA",
        role: "CONSEJO",
        acceptedLegal: true,
      }),
    /contrasena/
  );
  assert.throws(
    () =>
      validateInvitationAcceptance({
        token: "d".repeat(43),
        password: "ValidPass123",
        name: "Persona QA",
        role: "RESIDENTE",
        bloque: 0,
        apto: 101,
        acceptedLegal: true,
      }),
    /Bloque o apartamento/
  );
});
