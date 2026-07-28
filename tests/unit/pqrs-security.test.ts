import test from "node:test";
import assert from "node:assert/strict";
import {
  canAdministerPqrs,
  canCreatePqrs,
  canReadPqrs,
  normalizeUploadFileName,
  optionalBoundedText,
  pqrsPublicError,
  pqrsResourceScopeForUser,
  residentDescriptionPatch,
  safeDownloadFileName,
  validatePqrsFile,
} from "../../src/domains/pqrs/pqrs-security";
import {
  assertStoragePathForTenant,
  buildStoragePath,
} from "../../src/lib/storage";

const TENANT_A = "tenant_a";
const TENANT_B = "tenant_b";
const USER_A = "resident_a";
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(8),
]);
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString("base64")}`;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

test("1. ADMIN accede a PQRS de su tenant", () => {
  assert.deepEqual(
    pqrsResourceScopeForUser({
      id: "pqrs_a",
      tenantId: TENANT_A,
      userId: "admin_a",
      role: "ADMIN",
    }),
    { id: "pqrs_a", tenantId: TENANT_A }
  );
});

test("2. ADMIN no obtiene un scope de otro tenant", () => {
  const scope = pqrsResourceScopeForUser({
    id: "pqrs_b",
    tenantId: TENANT_A,
    userId: "admin_a",
    role: "ADMIN",
  });
  assert.notEqual(scope.tenantId, TENANT_B);
});

test("3. CONSEJO conserva lectura y no recibe escritura administrativa", () => {
  assert.equal(canReadPqrs("CONSEJO"), true);
  assert.equal(canAdministerPqrs("CONSEJO"), false);
});

test("4. RESIDENTE puede crear y su scope impone propietario", () => {
  assert.equal(canCreatePqrs("RESIDENTE"), true);
  assert.deepEqual(
    pqrsResourceScopeForUser({
      id: "pqrs_a",
      tenantId: TENANT_A,
      userId: USER_A,
      role: "RESIDENTE",
    }),
    { id: "pqrs_a", tenantId: TENANT_A, creadoPorId: USER_A }
  );
});

test("5. RESIDENTE no falsifica tenant mediante PATCH", () => {
  const patch = residentDescriptionPatch({
    descripcion: "Descripcion valida",
    tenantId: TENANT_B,
  });
  assert.deepEqual(patch, { descripcion: "Descripcion valida" });
  assert.equal("tenantId" in patch, false);
});

test("6. RESIDENTE no falsifica propietario mediante PATCH", () => {
  const patch = residentDescriptionPatch({
    descripcion: "Descripcion valida",
    creadoPorId: "otro",
  });
  assert.equal("creadoPorId" in patch, false);
});

test("7. RESIDENTE consulta su PQRS con tenant y propietario", () => {
  const scope = pqrsResourceScopeForUser({
    id: "propia",
    tenantId: TENANT_A,
    userId: USER_A,
    role: "RESIDENTE",
  });
  assert.deepEqual(scope, {
    id: "propia",
    tenantId: TENANT_A,
    creadoPorId: USER_A,
  });
});

test("8. RESIDENTE no genera scope para PQRS de otro propietario", () => {
  const scope = pqrsResourceScopeForUser({
    id: "ajena",
    tenantId: TENANT_A,
    userId: USER_A,
    role: "RESIDENTE",
  });
  assert.notEqual(scope.creadoPorId, "resident_b");
});

test("9. ID conocido cross-tenant mantiene el mismo filtro opaco", () => {
  const absent = pqrsResourceScopeForUser({
    id: "inexistente",
    tenantId: TENANT_A,
    userId: "admin_a",
    role: "ADMIN",
  });
  const crossTenant = pqrsResourceScopeForUser({
    id: "id_real_otro_tenant",
    tenantId: TENANT_A,
    userId: "admin_a",
    role: "ADMIN",
  });
  assert.deepEqual(Object.keys(absent).sort(), Object.keys(crossTenant).sort());
  assert.equal(absent.tenantId, crossTenant.tenantId);
});

test("10. PATCH de RESIDENTE no cambia tenant", () => {
  assert.equal(
    "tenantId" in residentDescriptionPatch({ descripcion: "Nueva", tenantId: "ataque" }),
    false
  );
});

test("11. PATCH de RESIDENTE no cambia creador", () => {
  assert.equal(
    "creadoPorId" in
      residentDescriptionPatch({ descripcion: "Nueva", creadoPorId: "ataque" }),
    false
  );
});

test("12. Solo ADMIN cambia estado administrativo", () => {
  assert.equal(canAdministerPqrs("ADMIN"), true);
  assert.equal(canAdministerPqrs("RESIDENTE"), false);
  assert.equal(canAdministerPqrs("CONSEJO"), false);
});

test("13. Nota autorizada se normaliza y limita", () => {
  assert.equal(canAdministerPqrs("ADMIN"), true);
  assert.equal(optionalBoundedText("  Respuesta valida  ", "Nota", 100), "Respuesta valida");
});

test("14. CONSEJO no puede escribir comentarios o respuestas", () => {
  assert.equal(canAdministerPqrs("CONSEJO"), false);
});

test("15. Evidencia de RESIDENTE hereda el scope del PQRS padre", () => {
  assert.deepEqual(
    pqrsResourceScopeForUser({
      id: "pqrs_foto",
      tenantId: TENANT_A,
      userId: USER_A,
      role: "RESIDENTE",
    }),
    { id: "pqrs_foto", tenantId: TENANT_A, creadoPorId: USER_A }
  );
});

test("16. Evidencia de otro tenant no pasa la validacion del path", () => {
  const path = buildStoragePath({
    tenantId: TENANT_B,
    folder: "evidencias",
    fileName: "cierre.pdf",
    objectId: "objeto",
  });
  assert.throws(
    () => assertStoragePathForTenant(path, TENANT_A, ["evidencias"]),
    /no autorizada/i
  );
});

test("17. Download exige path del tenant y carpeta autorizada", () => {
  const path = buildStoragePath({
    tenantId: TENANT_A,
    folder: "fotos",
    fileName: "foto.png",
    objectId: "objeto",
  });
  assert.doesNotThrow(() =>
    assertStoragePathForTenant(path, TENANT_A, ["fotos"])
  );
  assert.throws(
    () => assertStoragePathForTenant(path, TENANT_A, ["evidencias"]),
    /no autorizada/i
  );
});

test("18. Delete de evidencia exige rol ADMIN", () => {
  assert.equal(canAdministerPqrs("ADMIN"), true);
  assert.equal(canAdministerPqrs("RESIDENTE"), false);
});

test("19. Path traversal y nombres absolutos son rechazados", () => {
  assert.throws(
    () => normalizeUploadFileName("../secreto.png", "image/png"),
    /invalido/i
  );
  assert.throws(
    () => normalizeUploadFileName("C:\\secreto.png", "image/png"),
    /invalido/i
  );
  assert.throws(
    () =>
      assertStoragePathForTenant(
        `${TENANT_A}/fotos/../secreto.png`,
        TENANT_A,
        ["fotos"]
      ),
    /no autorizada/i
  );
});

test("20. MIME, extension y tamano invalidos son rechazados", () => {
  assert.throws(
    () =>
      validatePqrsFile({
        dataUrl: PNG_DATA_URL,
        fileName: "foto.pdf",
        allowedTypes: IMAGE_TYPES,
        maxBytes: 1024,
      }),
    /extension/i
  );
  assert.throws(
    () =>
      validatePqrsFile({
        dataUrl: "data:image/jpeg;base64," + PNG.toString("base64"),
        fileName: "foto.jpg",
        allowedTypes: IMAGE_TYPES,
        maxBytes: 1024,
      }),
    /no coincide/i
  );
  assert.throws(
    () =>
      validatePqrsFile({
        dataUrl: PNG_DATA_URL,
        fileName: "foto.png",
        allowedTypes: IMAGE_TYPES,
        maxBytes: 8,
      }),
    /superar/i
  );
});

test("21. Error inesperado no filtra detalles internos", () => {
  const result = pqrsPublicError(
    new Error("Prisma P2002 postgresql://usuario:clave@host/base"),
    "No se pudo actualizar la PQRS"
  );
  assert.deepEqual(result, { error: "No se pudo actualizar la PQRS" });
  assert.equal(JSON.stringify(result).includes("postgresql"), false);
});

test("22. Camino autorizado conserva archivo, path y nombre seguros", () => {
  const validated = validatePqrsFile({
    dataUrl: PNG_DATA_URL,
    fileName: "Evidencia final.png",
    allowedTypes: IMAGE_TYPES,
    maxBytes: 1024,
  });
  assert.equal(validated.contentType, "image/png");
  const path = buildStoragePath({
    tenantId: TENANT_A,
    folder: "fotos",
    fileName: validated.fileName,
    objectId: "objeto",
  });
  assert.doesNotThrow(() =>
    assertStoragePathForTenant(path, TENANT_A, ["fotos"])
  );
  assert.equal(safeDownloadFileName('foto"\r\n.png', "foto"), "foto-.png");
});
