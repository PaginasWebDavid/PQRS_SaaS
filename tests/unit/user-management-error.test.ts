import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  mapUserManagementError,
  GENERIC_USER_MANAGEMENT_ERROR,
} from "../../src/domains/organizations/user-management-error";

// Substrings que NUNCA deben aparecer en un body publico de error.
const FORBIDDEN_LEAK_SUBSTRINGS = [
  "constraint",
  "Unique constraint",
  "prisma",
  "invocation",
  "SELECT",
  "UPDATE",
  "FROM",
  "5432",
  "://",
  ".js:",
  "at ",
];

function assertNoLeak(message: string) {
  for (const needle of FORBIDDEN_LEAK_SUBSTRINGS) {
    assert.ok(
      !message.includes(needle),
      `El body no debe filtrar "${needle}" (recibido: ${message})`
    );
  }
}

test("1. usuario no encontrado -> 404", () => {
  const result = mapUserManagementError(new Error("Usuario no encontrado"));
  assert.deepEqual(result, { status: 404, message: "Usuario no encontrado" });
});

test("2. cross-tenant produce el mismo resultado que inexistente", () => {
  // El servicio lanza exactamente "Usuario no encontrado" tanto para un id
  // ausente como para uno de otro tenant: el mapper los deja indistinguibles.
  const inexistente = mapUserManagementError(new Error("Usuario no encontrado"));
  const crossTenant = mapUserManagementError(new Error("Usuario no encontrado"));
  assert.deepEqual(crossTenant, inexistente);
  assert.equal(crossTenant.status, 404);
});

test("3. SUPER_ADMIN no administrable produce el mismo resultado", () => {
  // Guard de defensa en profundidad: un SUPER_ADMIN objetivo tambien lanza
  // "Usuario no encontrado", asi que su respuesta es identica.
  const superAdmin = mapUserManagementError(new Error("Usuario no encontrado"));
  const inexistente = mapUserManagementError(new Error("Usuario no encontrado"));
  assert.deepEqual(superAdmin, inexistente);
  assert.equal(superAdmin.status, 404);
});

test("4. rol invalido -> 400", () => {
  const result = mapUserManagementError(new Error("Rol invalido"));
  assert.deepEqual(result, { status: 400, message: "Rol invalido" });
});

test("5. errores de dominio conocidos conservan su respuesta permitida", () => {
  assert.deepEqual(
    mapUserManagementError(
      new Error("El conjunto debe conservar al menos un administrador activo")
    ),
    {
      status: 400,
      message: "El conjunto debe conservar al menos un administrador activo",
    }
  );
  assert.deepEqual(mapUserManagementError(new Error("Bloque invalido")), {
    status: 400,
    message: "Bloque invalido",
  });
  assert.deepEqual(mapUserManagementError(new Error("Apartamento invalido")), {
    status: 400,
    message: "Apartamento invalido",
  });
  assert.deepEqual(
    mapUserManagementError(
      new Error("No puedes cambiar tu propio rol ni desactivar tu cuenta")
    ),
    {
      status: 400,
      message: "No puedes cambiar tu propio rol ni desactivar tu cuenta",
    }
  );
});

test("6. error de Prisma simulado -> 500 generico sin filtracion", () => {
  const prismaError = new Error(
    "\nInvalid `prisma.user.update()` invocation in\nC:\\app\\service.js:44:9\nUnique constraint failed on the fields: (`email`)"
  );
  const result = mapUserManagementError(prismaError);
  assert.equal(result.status, 500);
  assert.equal(result.message, GENERIC_USER_MANAGEMENT_ERROR);
  assertNoLeak(result.message);
});

test("7. error de conexion simulado -> 500 generico sin filtracion", () => {
  const connError = new Error(
    "Can't reach database server at `db.internal.host:5432`. Please make sure your database server is running at https://db.internal.host:5432"
  );
  const result = mapUserManagementError(connError);
  assert.equal(result.status, 500);
  assert.equal(result.message, GENERIC_USER_MANAGEMENT_ERROR);
  assertNoLeak(result.message);
});

test("8. el body de un error inesperado no contiene datos internos", () => {
  const leaky = new Error(
    "SELECT * FROM \"User\" WHERE constraint \"User_email_key\" at C:\\secret\\path.js:1:2 https://leak"
  );
  leaky.stack = "Error: leaky\n    at foo (C:\\secret\\path.js:1:2)";
  const result = mapUserManagementError(leaky);
  assert.equal(result.message, GENERIC_USER_MANAGEMENT_ERROR);
  assert.equal(result.status, 500);
  assertNoLeak(result.message);
  // Un valor no-Error tampoco filtra nada.
  const nonError = mapUserManagementError({ message: "SELECT secret" });
  assert.equal(nonError.status, 500);
  assert.equal(nonError.message, GENERIC_USER_MANAGEMENT_ERROR);
});

test("9. PATCH y DELETE usan el mismo mapper y no reflejan error.message crudo", () => {
  const routeSource = readFileSync(
    join(process.cwd(), "src", "app", "api", "users", "[id]", "route.ts"),
    "utf8"
  );
  // Ambos handlers (PATCH y DELETE) invocan el mapper compartido.
  const mapperUses = routeSource.match(/mapUserManagementError\(/g) ?? [];
  assert.ok(
    mapperUses.length >= 2,
    `Se esperaban >=2 usos del mapper (PATCH y DELETE), hubo ${mapperUses.length}`
  );
  // Y ya no queda passthrough directo de error.message en las respuestas.
  assert.ok(
    !/error:\s*error instanceof Error\s*\?\s*error\.message/.test(routeSource),
    "No debe quedar passthrough directo de error.message en las respuestas"
  );
});
