import "dotenv/config";
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ExcelJS from "exceljs";
import type { PqrsCategory, Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  createCustomPqrsCategory,
  ensureInitialPqrsCategoriesForTenant,
  listPqrsCategoriesForAdmin,
  listPqrsCategoriesForCreation,
  resolvePqrsCategoryForCreation,
  updatePqrsCategory,
} from "../src/domains/pqrs/pqrs-category.service";
import {
  categorySlugBase,
  INITIAL_PQRS_CATEGORIES,
  normalizeCategoryDisplayName,
  pqrsCategoryVisibleLabel,
} from "../src/domains/pqrs/pqrs-category-policy";
import { correctPqrs } from "../src/domains/pqrs/pqrs-correction.service";
import {
  withdrawPqrsFileEvidence,
  withdrawPqrsPhotoEvidence,
} from "../src/domains/pqrs/pqrs-evidence.service";
import { getPqrsReportData } from "../src/domains/pqrs/reportes.service";
import { exportTenantData } from "../src/domains/platform/tenant-export.service";
import { toResidentPqrsView } from "../src/domains/pqrs/resident-view";

const RUN = `r2a-${Date.now()}`;
let seq = 0;
const next = () => ++seq;

let tenantA: { id: string };
let tenantB: { id: string };
let adminA: { id: string };
let adminB: { id: string };
let residentA: { id: string };
let consejoA: { id: string };
let categoriesA: PqrsCategory[];
let categoriesB: PqrsCategory[];
let historicalCaseId = "";
let withdrawnCaseId = "";

async function createMember(tenantId: string, role: Role) {
  const n = next();
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${RUN}-${n}@example.com`,
      name: `${role} ${RUN} ${n}`,
      password: "test-only",
      role,
      isActive: true,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      tenantId,
      userId: user.id,
      role,
      isActive: true,
      ...(role === "RESIDENTE" ? { bloque: 1, apto: 101 } : {}),
    },
  });
  return user;
}

async function createCase(input: {
  tenantId?: string;
  creatorId?: string;
  category?: PqrsCategory;
  workflowType?: "SIMPLE" | "MAINTENANCE";
  estado?: "EN_ESPERA" | "EN_PROGRESO" | "TERMINADO";
  faseActual?: number | null;
  faseTipo?: string | null;
  bloque?: number;
  apto?: number;
  categorySnapshot?: string;
}) {
  const tenantId = input.tenantId ?? tenantA.id;
  const creatorId = input.creatorId ?? residentA.id;
  const category = input.category ?? categoriesA[0];
  const now = new Date();
  return prisma.pqrs.create({
    data: {
      tenantId,
      medio: "PLATAFORMA_WEB",
      fechaRecibido: now,
      mes: "Julio",
      bloque: input.bloque ?? 1,
      apto: input.apto ?? 101,
      nombreResidente: `Residente ${RUN}`,
      descripcion: "Caso de prueba R2A",
      asunto: category.slug,
      categoryId: category.id,
      categorySnapshot: input.categorySnapshot ?? category.displayName,
      workflowType: input.workflowType ?? category.workflowType,
      estado: input.estado ?? "EN_ESPERA",
      faseActual: input.faseActual,
      faseTipo: input.faseTipo,
      creadoPorId: creatorId,
      ...(input.estado === "TERMINADO" ? {
        fechaCierre: now,
        tiempoRespuestaCierre: 2,
        queSeHizoParaCerrar: "Cierre de prueba",
      } : {}),
    },
  });
}

async function assertRejectsCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

function correctionBody(patch: Record<string, unknown>) {
  return {
    operationId: crypto.randomUUID(),
    reason: "Correccion valida para prueba automatizada.",
    ...patch,
  };
}

async function loadWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  const input = buffer as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(input);
  return workbook;
}

function reportFilters(tenantId: string) {
  const now = Date.now();
  return {
    tenantId,
    from: new Date(now - 24 * 60 * 60 * 1000),
    to: new Date(now + 24 * 60 * 60 * 1000),
    compareFrom: new Date(now - 3 * 24 * 60 * 60 * 1000),
    compareTo: new Date(now - 2 * 24 * 60 * 60 * 1000),
    granularity: "day" as const,
  };
}

before(async () => {
  await prisma.$connect();
  tenantA = await prisma.tenant.create({ data: { name: `Conjunto ${RUN} A`, slug: `${RUN}-a`, units: 20 } });
  tenantB = await prisma.tenant.create({ data: { name: `Conjunto ${RUN} B`, slug: `${RUN}-b`, units: 30 } });
  adminA = await createMember(tenantA.id, "ADMIN");
  adminB = await createMember(tenantB.id, "ADMIN");
  residentA = await createMember(tenantA.id, "RESIDENTE");
  consejoA = await createMember(tenantA.id, "CONSEJO");
  categoriesA = await ensureInitialPqrsCategoriesForTenant(tenantA.id, adminA.id);
  categoriesB = await ensureInitialPqrsCategoriesForTenant(tenantB.id, adminB.id);
});

after(async () => {
  const tenantIds = [tenantA.id, tenantB.id];
  await prisma.pqrsCorrection.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.historialPqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrsFoto.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrs.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.pqrsCategory.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

test("1. se crean las ocho categorias iniciales por tenant", async () => {
  assert.equal(categoriesA.length, 8);
  assert.deepEqual(categoriesA.map((c) => c.canonicalKey), INITIAL_PQRS_CATEGORIES.map((c) => c.canonicalKey));
});

test("2. la inicializacion es idempotente", async () => {
  await ensureInitialPqrsCategoriesForTenant(tenantA.id, adminA.id);
  assert.equal(await prisma.pqrsCategory.count({ where: { tenantId: tenantA.id, isCustom: false } }), 8);
});

test("3. el mismo catalogo existe en tenants distintos", () => {
  assert.deepEqual(categoriesA.map((c) => c.slug), categoriesB.map((c) => c.slug));
  assert.ok(categoriesA.every((a) => categoriesB.some((b) => b.slug === a.slug && b.id !== a.id)));
});

test("4. ADMIN configura solo su tenant", async () => {
  await assertRejectsCode(() => updatePqrsCategory({ tenantId: tenantB.id, actorUserId: adminA.id, actorRole: "ADMIN", categoryId: categoriesB[0].id, displayName: "Ataque cruzado" }), "NOT_FOUND");
});

test("5. RESIDENTE no configura categorias", async () => {
  await assertRejectsCode(() => createCustomPqrsCategory({ tenantId: tenantA.id, actorUserId: residentA.id, actorRole: "RESIDENTE", displayName: "No permitida", sortOrder: 100, workflowType: "SIMPLE" }), "FORBIDDEN");
});

test("6. CONSEJO no configura categorias", async () => {
  await assertRejectsCode(() => createCustomPqrsCategory({ tenantId: tenantA.id, actorUserId: consejoA.id, actorRole: "CONSEJO", displayName: "No permitida", sortOrder: 100, workflowType: "SIMPLE" }), "FORBIDDEN");
});

test("7. renombrar no cambia PQRS historicas", async () => {
  const category = categoriesA[0];
  const pqrs = await createCase({ category, categorySnapshot: "Convivencia historica" });
  historicalCaseId = pqrs.id;
  await updatePqrsCategory({ tenantId: tenantA.id, actorUserId: adminA.id, actorRole: "ADMIN", categoryId: category.id, displayName: "Convivencia renombrada" });
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } });
  assert.equal(stored.categorySnapshot, "Convivencia historica");
});

test("8. desactivar impide usar una categoria en nuevas PQRS", async () => {
  const category = categoriesA[1];
  await updatePqrsCategory({ tenantId: tenantA.id, actorUserId: adminA.id, actorRole: "ADMIN", categoryId: category.id, isActive: false });
  await assertRejectsCode(() => resolvePqrsCategoryForCreation({ tenantId: tenantA.id, categoryId: category.id }), "NOT_FOUND");
});

test("9. desactivar no oculta historicos", async () => {
  const category = categoriesA[1];
  const pqrs = await createCase({ category, categorySnapshot: "Seguridad historica" });
  const visible = toResidentPqrsView(pqrs);
  assert.equal(visible.asunto, "Seguridad historica");
});

test("10. el workflow se deriva de la categoria", async () => {
  const maintenance = categoriesA.find((c) => c.canonicalKey === "MANTENIMIENTO")!;
  const resolved = await resolvePqrsCategoryForCreation({ tenantId: tenantA.id, categoryId: maintenance.id });
  assert.ok(resolved);
  const pqrs = await createCase({ category: resolved, workflowType: resolved.workflowType });
  assert.equal(pqrs.workflowType, "MAINTENANCE");
});

test("11. el cliente no puede falsificar el workflow derivado", async () => {
  const simple = categoriesA.find((c) => c.canonicalKey === "CARTERA_PAGOS")!;
  const resolved = await resolvePqrsCategoryForCreation({ tenantId: tenantA.id, categoryId: simple.id });
  assert.ok(resolved);
  assert.equal(resolved.workflowType, "SIMPLE");
  assert.notEqual(resolved.workflowType, "MAINTENANCE");
});

// El residente no clasifica: radica sin categoria y el admin la asigna al
// abrir el caso.
test("10b. sin categoryId la creacion queda sin clasificar", async () => {
  const resolved = await resolvePqrsCategoryForCreation({ tenantId: tenantA.id });
  assert.equal(resolved, null);
});

test("10c. un categoryId invalido sigue fallando aunque la categoria sea opcional", async () => {
  await assertRejectsCode(() => resolvePqrsCategoryForCreation({ tenantId: tenantA.id, categoryId: "no-existe" }), "NOT_FOUND");
});

test("12. categoria cross-tenant falla de forma opaca", async () => {
  await assertRejectsCode(() => resolvePqrsCategoryForCreation({ tenantId: tenantA.id, categoryId: categoriesB[0].id }), "NOT_FOUND");
});

test("13. se permite una categoria personalizada", async () => {
  const created = await createCustomPqrsCategory({ tenantId: tenantA.id, actorUserId: adminA.id, actorRole: "ADMIN", displayName: "Mascotas especiales", sortOrder: 90, workflowType: "SIMPLE" });
  assert.equal(created.isCustom, true);
  assert.equal(created.tenantId, tenantA.id);
});

test("14. la cuarta categoria personalizada falla", async () => {
  for (let i = 1; i <= 3; i++) {
    await createCustomPqrsCategory({ tenantId: tenantB.id, actorUserId: adminB.id, actorRole: "ADMIN", displayName: `Personalizada B ${i}`, sortOrder: 90 + i, workflowType: "SIMPLE" });
  }
  await assertRejectsCode(() => createCustomPqrsCategory({ tenantId: tenantB.id, actorUserId: adminB.id, actorRole: "ADMIN", displayName: "Personalizada B 4", sortOrder: 99, workflowType: "SIMPLE" }), "LIMIT_REACHED");
});

test("15. creaciones concurrentes no superan tres personalizadas", async () => {
  const outcomes = await Promise.allSettled([1, 2, 3].map((i) => createCustomPqrsCategory({ tenantId: tenantA.id, actorUserId: adminA.id, actorRole: "ADMIN", displayName: `Concurrente A ${i}`, sortOrder: 100 + i, workflowType: "SIMPLE" })));
  const customCount = await prisma.pqrsCategory.count({ where: { tenantId: tenantA.id, isCustom: true } });
  const fulfilled = outcomes.filter((o) => o.status === "fulfilled").length;
  assert.ok(customCount <= 3);
  assert.equal(customCount, 1 + fulfilled);
  assert.ok(fulfilled >= 1);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      assert.ok(["CONFLICT", "LIMIT_REACHED"].includes((outcome.reason as { code?: string }).code || ""));
    }
  }
});

test("16. el orden configurado se conserva", async () => {
  const category = categoriesA[2];
  await updatePqrsCategory({ tenantId: tenantA.id, actorUserId: adminA.id, actorRole: "ADMIN", categoryId: category.id, sortOrder: 5 });
  const listed = await listPqrsCategoriesForAdmin({ tenantId: tenantA.id, actorRole: "ADMIN" });
  assert.equal(listed[0].id, category.id);
});

test("17. label y slug se validan y normalizan", () => {
  assert.equal(normalizeCategoryDisplayName("  Danos   menores  "), "Danos menores");
  assert.equal(categorySlugBase("Danos menores"), "danos-menores");
  assert.throws(() => normalizeCategoryDisplayName("x"));
  assert.throws(() => normalizeCategoryDisplayName("__proto__"));
  assert.throws(() => normalizeCategoryDisplayName("Constructor"));
});

test("18. valores legacy continuan visibles", () => {
  assert.equal(pqrsCategoryVisibleLabel({ asunto: "HUMEDAD/FACHADA" }), "Humedad - Fachada");
});

test("19. reporte muestra la categoria historica", async () => {
  const report = await getPqrsReportData(reportFilters(tenantA.id));
  const row = report.detalle.find((item) => item.id === historicalCaseId);
  assert.equal(row?.categoria, "Convivencia historica");
});

test("20. exportacion muestra la categoria historica", async () => {
  const exported = await exportTenantData({ tenantId: tenantA.id, actorUserId: adminA.id });
  const workbook = await loadWorkbook(exported.buffer);
  const sheet = workbook.getWorksheet("PQRS")!;
  const values = sheet.getColumn(3).values.map(String);
  assert.ok(values.includes("Convivencia historica"));
});

test("21. ADMIN corrige categoria con motivo", async () => {
  const pqrs = await createCase({ category: categoriesA[2] });
  const target = categoriesA.find((c) => c.canonicalKey === "MANTENIMIENTO")!;
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ categoryId: target.id }) });
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } });
  assert.equal(stored.categorySnapshot, target.displayName);
});

test("22. ADMIN corrige bloque y apartamento", async () => {
  const pqrs = await createCase({});
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ bloque: 9, apto: 902 }) });
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } });
  assert.deepEqual([stored.bloque, stored.apto], [9, 902]);
});

test("23. ADMIN corrige responsable del mismo tenant", async () => {
  const pqrs = await createCase({});
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ gestionadoPorId: adminA.id }) });
  assert.equal((await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } })).gestionadoPorId, adminA.id);
});

test("24. responsable de otro tenant falla", async () => {
  const pqrs = await createCase({});
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ gestionadoPorId: adminB.id }) }), "NOT_FOUND");
});

test("25. ADMIN corrige ruta INSUMOS o PROVEEDOR", async () => {
  const maintenance = categoriesA.find((c) => c.workflowType === "MAINTENANCE")!;
  const pqrs = await createCase({ category: maintenance, workflowType: "MAINTENANCE", faseActual: 1 });
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ faseActual: 2, faseTipo: "INSUMOS" }) });
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } });
  assert.deepEqual([stored.faseActual, stored.faseTipo], [2, "INSUMOS"]);
});

test("26. ruta de mantenimiento no aplica a SIMPLE", async () => {
  const pqrs = await createCase({ workflowType: "SIMPLE", faseActual: 1 });
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ faseTipo: "INSUMOS" }) }), "INVALID");
});

test("27. ADMIN corrige workflow compatible", async () => {
  const pqrs = await createCase({ workflowType: "MAINTENANCE", faseActual: null });
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ workflowType: "SIMPLE" }) });
  assert.equal((await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } })).workflowType, "SIMPLE");
});

test("28. workflow incompatible con fase falla", async () => {
  const pqrs = await createCase({ workflowType: "MAINTENANCE", faseActual: 2, faseTipo: "INSUMOS" });
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ workflowType: "SIMPLE" }) }), "INVALID");
});

test("29. correccion de fase crea historial", async () => {
  const pqrs = await createCase({ workflowType: "MAINTENANCE", faseActual: 1 });
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ faseActual: 2, faseTipo: "INSUMOS" }) });
  assert.equal(await prisma.historialPqrs.count({ where: { pqrsId: pqrs.id } }), 1);
});

test("30. reapertura conserva tecnicamente el cierre anterior", async () => {
  const pqrs = await createCase({ estado: "TERMINADO" });
  const result = await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ reopen: true }) });
  const correction = await prisma.pqrsCorrection.findUniqueOrThrow({ where: { id: result.correctionId } });
  assert.equal(result.pqrs.estado, "EN_PROGRESO");
  assert.match(JSON.stringify(correction.changes), /fechaCierre/);
  assert.equal(await prisma.historialPqrs.count({ where: { pqrsId: pqrs.id, estadoAntes: "TERMINADO", estadoDespues: "EN_PROGRESO" } }), 1);
});

test("31. motivo ausente falla", async () => {
  const pqrs = await createCase({});
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: { operationId: crypto.randomUUID(), bloque: 2 } }), "INVALID");
});

test("32. campo no permitido falla", async () => {
  const pqrs = await createCase({});
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ tenantId: tenantB.id }) }), "INVALID");
});

test("33. PQRS cross-tenant falla de forma opaca", async () => {
  const pqrs = await createCase({ tenantId: tenantB.id, creatorId: adminB.id, category: categoriesB[0] });
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ bloque: 3 }) }), "NOT_FOUND");
});

test("34. reintento con operationId no duplica correccion", async () => {
  const pqrs = await createCase({});
  const body = correctionBody({ bloque: 4 });
  const first = await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body });
  const second = await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body });
  assert.equal(second.idempotent, true);
  assert.equal(first.correctionId, second.correctionId);
  assert.equal(await prisma.pqrsCorrection.count({ where: { pqrsId: pqrs.id } }), 1);
});

test("35. AuditLog e HistorialPqrs quedan coherentes", async () => {
  const pqrs = await createCase({});
  const result = await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ apto: 777 }) });
  assert.equal(await prisma.historialPqrs.count({ where: { pqrsId: pqrs.id } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { tenantId: tenantA.id, targetType: "PqrsCorrection", targetId: result.correctionId, resourceId: pqrs.id } }), 1);
});

test("36. RESIDENTE no corrige", async () => {
  const pqrs = await createCase({});
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: residentA.id, actorRole: "RESIDENTE", body: correctionBody({ bloque: 2 }) }), "FORBIDDEN");
});

test("37. CONSEJO no corrige", async () => {
  const pqrs = await createCase({});
  await assertRejectsCode(() => correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: consejoA.id, actorRole: "CONSEJO", body: correctionBody({ bloque: 2 }) }), "FORBIDDEN");
});

test("38. correccion de ubicacion no modifica membresia global", async () => {
  const pqrs = await createCase({ bloque: 1, apto: 101 });
  const before = await prisma.tenantMembership.findUniqueOrThrow({ where: { userId_tenantId: { userId: residentA.id, tenantId: tenantA.id } } });
  await correctPqrs({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ bloque: 8, apto: 808 }) });
  const afterStored = await prisma.tenantMembership.findUniqueOrThrow({ where: { id: before.id } });
  assert.deepEqual([afterStored.bloque, afterStored.apto], [before.bloque, before.apto]);
});

test("39. ADMIN retira evidencia de su tenant", async () => {
  const pqrs = await createCase({});
  withdrawnCaseId = pqrs.id;
  await prisma.pqrs.update({ where: { id: pqrs.id }, data: { evidenciaArchivoData: "data:application/pdf;base64,QQ==", evidenciaArchivoNombre: "sensible.pdf", evidenciaArchivoTipo: "application/pdf", evidenciaArchivoSize: 1 } });
  const result = await withdrawPqrsFileEvidence({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", reason: "Contiene informacion personal incorrecta." });
  assert.equal(result.removed, true);
});

test("40. evidencia cross-tenant falla", async () => {
  const pqrs = await createCase({ tenantId: tenantB.id, creatorId: adminB.id, category: categoriesB[0] });
  const photo = await prisma.pqrsFoto.create({ data: { tenantId: tenantB.id, pqrsId: pqrs.id, data: "data:image/png;base64,QQ==", nombre: "otra.png", tipo: "image/png", orden: 0 } });
  await assertRejectsCode(() => withdrawPqrsPhotoEvidence({ tenantId: tenantA.id, pqrsId: pqrs.id, photoId: photo.id, actorUserId: adminA.id, actorRole: "ADMIN", reason: "Evidencia de otro conjunto." }), "NOT_FOUND");
});

test("41. retiro de evidencia exige motivo", async () => {
  const pqrs = await createCase({});
  await prisma.pqrs.update({ where: { id: pqrs.id }, data: { evidenciaArchivoData: "data:text/plain;base64,QQ==", evidenciaArchivoNombre: "a.txt", evidenciaArchivoTipo: "text/plain" } });
  await assertRejectsCode(() => withdrawPqrsFileEvidence({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", reason: "" }), "INVALID");
});

test("42. evidencia retirada deja de mostrarse o descargarse", async () => {
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: withdrawnCaseId } });
  const view = toResidentPqrsView(stored);
  assert.equal(stored.evidenciaArchivoData, null);
  assert.equal(stored.evidenciaArchivoPath, null);
  assert.equal(view.evidenciaArchivo, null);
});

test("43. metadata de retiro permanece", async () => {
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: withdrawnCaseId } });
  assert.equal(stored.evidenciaArchivoNombre, "sensible.pdf");
  assert.equal(stored.evidenciaArchivoTipo, "application/pdf");
  assert.ok(stored.evidenciaArchivoRetiradaAt instanceof Date);
  assert.match(stored.evidenciaArchivoRetiroMotivo || "", /informacion personal/);
});

test("44. path enviado por cliente no controla la limpieza", async () => {
  const pqrs = await createCase({});
  const storedPath = `${tenantA.id}/evidencias/segura.pdf`;
  await prisma.pqrs.update({ where: { id: pqrs.id }, data: { evidenciaArchivoPath: storedPath, evidenciaArchivoNombre: "segura.pdf", evidenciaArchivoTipo: "application/pdf" } });
  let cleanedPath = "";
  await withdrawPqrsFileEvidence({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", reason: "Retiro seguro con path persistido.", cleanup: async (path) => { cleanedPath = path; }, path: "otro-tenant/secreto" } as Parameters<typeof withdrawPqrsFileEvidence>[0] & { path: string });
  assert.equal(cleanedPath, storedPath);
});

test("45. fallo de Storage no expone detalles ni revierte el retiro", async () => {
  const pqrs = await createCase({});
  await prisma.pqrs.update({ where: { id: pqrs.id }, data: { evidenciaArchivoPath: `${tenantA.id}/evidencias/falla.pdf`, evidenciaArchivoNombre: "falla.pdf", evidenciaArchivoTipo: "application/pdf" } });
  const originalError = console.error;
  let logged = "";
  console.error = (...args: unknown[]) => { logged += args.join(" "); };
  try {
    const result = await withdrawPqrsFileEvidence({ tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN", reason: "Retiro aunque Storage no responda.", cleanup: async () => { throw new Error("SECRET_PROVIDER_TOKEN"); } });
    assert.equal(result.removed, true);
  } finally {
    console.error = originalError;
  }
  assert.equal(logged.includes("SECRET_PROVIDER_TOKEN"), false);
});

test("46. auditoria de retiro no contiene evidencia sensible", async () => {
  const pqrs = await createCase({});
  const photo = await prisma.pqrsFoto.create({ data: { tenantId: tenantA.id, pqrsId: pqrs.id, data: "data:image/png;base64,U0VDUkVU", nombre: "auditable.png", tipo: "image/png", orden: 0 } });
  await withdrawPqrsPhotoEvidence({ tenantId: tenantA.id, pqrsId: pqrs.id, photoId: photo.id, actorUserId: adminA.id, actorRole: "ADMIN", reason: "La imagen contiene informacion sensible." });
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { tenantId: tenantA.id, targetType: "PqrsPhotoEvidence", targetId: photo.id } });
  const serialized = JSON.stringify(audit.metadata);
  assert.equal(serialized.includes("U0VDUkVU"), false);
  assert.equal(serialized.includes("storagePath"), false);
});

test("47. smoke PostgreSQL de dos tenants no mezcla categorias, PQRS, evidencias, historial, reporte ni exportacion", async () => {
  const categoryA = (await listPqrsCategoriesForCreation(tenantA.id)).find((category) => category.slug === "convivencia")!;
  const categoryB = (await listPqrsCategoriesForCreation(tenantB.id)).find((category) => category.slug === "convivencia")!;
  assert.equal(categoryA.slug, categoryB.slug);
  assert.notEqual(categoryA.id, categoryB.id);
  const caseA = await createCase({ tenantId: tenantA.id, creatorId: residentA.id, category: categoryA as PqrsCategory });
  const caseB = await createCase({ tenantId: tenantB.id, creatorId: adminB.id, category: categoryB as PqrsCategory });
  const photoA = await prisma.pqrsFoto.create({ data: { tenantId: tenantA.id, pqrsId: caseA.id, data: "data:image/png;base64,QQ==", nombre: "a.png", tipo: "image/png", orden: 0 } });
  await prisma.pqrsFoto.create({ data: { tenantId: tenantB.id, pqrsId: caseB.id, data: "data:image/png;base64,Qg==", nombre: "b.png", tipo: "image/png", orden: 0 } });
  await correctPqrs({ tenantId: tenantA.id, pqrsId: caseA.id, actorUserId: adminA.id, actorRole: "ADMIN", body: correctionBody({ apto: 505 }) });
  const reportA = await getPqrsReportData(reportFilters(tenantA.id));
  const exportA = await exportTenantData({ tenantId: tenantA.id, actorUserId: adminA.id });
  assert.ok(reportA.detalle.some((row) => row.id === caseA.id));
  assert.equal(reportA.detalle.some((row) => row.id === caseB.id), false);
  assert.equal(await prisma.historialPqrs.count({ where: { tenantId: tenantA.id, pqrsId: caseA.id } }), 1);
  assert.equal(await prisma.pqrsFoto.count({ where: { id: photoA.id, tenantId: tenantA.id, pqrsId: caseA.id } }), 1);
  const workbook = await loadWorkbook(exportA.buffer);
  const exportedNumbers = workbook.getWorksheet("PQRS")!.getColumn(1).values.map(Number);
  assert.ok(exportedNumbers.includes(caseA.numero));
  assert.equal(exportedNumbers.includes(caseB.numero), false);
});

test("48. reutilizar operationId con un payload distinto devuelve conflicto, no aplica silenciosamente", async () => {
  const pqrs = await createCase({});
  const operationId = crypto.randomUUID();
  const first = await correctPqrs({
    tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN",
    body: { operationId, reason: "Correccion original de bloque.", bloque: 4 },
  });
  await assertRejectsCode(() => correctPqrs({
    tenantId: tenantA.id, pqrsId: pqrs.id, actorUserId: adminA.id, actorRole: "ADMIN",
    body: { operationId, reason: "Correccion original de bloque.", bloque: 9 },
  }), "CONFLICT");
  const stored = await prisma.pqrs.findUniqueOrThrow({ where: { id: pqrs.id } });
  assert.equal(stored.bloque, 4);
  assert.equal(await prisma.pqrsCorrection.count({ where: { pqrsId: pqrs.id } }), 1);
  assert.equal(first.idempotent, false);
});

test("49. si el cleanup de Storage falla, el path retirado se conserva en privado para reintento; si tiene exito, se libera", async () => {
  const failing = await createCase({});
  await prisma.pqrs.update({ where: { id: failing.id }, data: { evidenciaArchivoPath: `${tenantA.id}/evidencias/reintento.pdf`, evidenciaArchivoNombre: "reintento.pdf", evidenciaArchivoTipo: "application/pdf" } });
  await withdrawPqrsFileEvidence({
    tenantId: tenantA.id, pqrsId: failing.id, actorUserId: adminA.id, actorRole: "ADMIN",
    reason: "Retiro con fallo simulado de Storage para probar recuperabilidad.",
    cleanup: async () => { throw new Error("storage-down"); },
  });
  const afterFailure = await prisma.pqrs.findUniqueOrThrow({ where: { id: failing.id } });
  assert.equal(afterFailure.evidenciaArchivoRetiroStoragePath, `${tenantA.id}/evidencias/reintento.pdf`);
  assert.equal(afterFailure.evidenciaArchivoPath, null);

  const succeeding = await createCase({});
  await prisma.pqrs.update({ where: { id: succeeding.id }, data: { evidenciaArchivoPath: `${tenantA.id}/evidencias/ok.pdf`, evidenciaArchivoNombre: "ok.pdf", evidenciaArchivoTipo: "application/pdf" } });
  await withdrawPqrsFileEvidence({
    tenantId: tenantA.id, pqrsId: succeeding.id, actorUserId: adminA.id, actorRole: "ADMIN",
    reason: "Retiro con limpieza exitosa de Storage.",
    cleanup: async () => {},
  });
  const afterSuccess = await prisma.pqrs.findUniqueOrThrow({ where: { id: succeeding.id } });
  assert.equal(afterSuccess.evidenciaArchivoRetiroStoragePath, null);
});
