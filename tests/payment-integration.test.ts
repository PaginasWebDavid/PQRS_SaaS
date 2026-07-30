import "dotenv/config";
import test, { after, afterEach, before } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import type { Role } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import {
  cancelCharge,
  createManualCharge,
  getChargeForActor,
  getReceiptFileForActor,
  listChargesForTenant,
  recordManualPayment,
  reversePayment,
  reviewReceipt,
  uploadReceipt,
  withdrawReceipt,
} from "../src/domains/payments/payment.service";
import { processChargeImportFile } from "../src/domains/payments/payment-import.service";
import { PaymentDomainError } from "../src/domains/payments/payment-security";

const RUN = `phase9a-${Date.now()}`;
let sequence = 0;
function nextSeq() {
  sequence += 1;
  return sequence;
}

const PDF_BUFFER = Buffer.from("%PDF-1.4 fake receipt content for tests");
const OTHER_PDF_BUFFER = Buffer.from("%PDF-1.4 a different fake receipt content");
const NOT_PDF_BUFFER = Buffer.from("this is not a pdf at all, just plain text");

async function createTenant(prefix: string) {
  const n = nextSeq();
  return prisma.tenant.create({
    data: {
      name: `${prefix} ${n}`,
      slug: `${RUN}-${prefix.toLowerCase()}-${n}`,
      featureEntitlements: {
        create: { feature: "RESIDENT_PAYMENTS", status: "ACTIVE", reason: "Fixture de pagos" },
      },
    },
  });
}

async function createMember(
  tenantId: string,
  role: Role = "RESIDENTE",
  overrides: { bloque?: number | null; apto?: number | null; isActive?: boolean; userActive?: boolean } = {}
) {
  const n = nextSeq();
  const user = await prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${RUN}-${n}@example.com`,
      name: `QA ${role} ${n}`,
      password: "not-used-in-test",
      isActive: overrides.userActive ?? true,
    },
  });
  const membership = await prisma.tenantMembership.create({
    data: {
      userId: user.id,
      tenantId,
      role,
      isActive: overrides.isActive ?? true,
      bloque: overrides.bloque ?? (role === "RESIDENTE" ? nextSeq() : null),
      apto: overrides.apto ?? (role === "RESIDENTE" ? nextSeq() : null),
    },
  });
  return { user, membership };
}

function isoFuture(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString();
}

async function buildXlsxBuffer(rows: unknown[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Obligaciones");
  sheet.addRow(["bloque", "apto", "periodo", "concepto", "monto", "vencimiento", "referencia"]);
  for (const row of rows) sheet.addRow(row);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

async function assertRejectsCode(operation: () => Promise<unknown>, code: string) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof PaymentDomainError, `expected PaymentDomainError, got ${error}`);
    assert.equal((error as PaymentDomainError).code, code);
    return true;
  });
}

// --- Mock de Supabase Storage (misma tecnica que account-avatar-integration.test.ts):
// la base de datos es real, pero Storage se simula en memoria via fetch, para no
// depender de credenciales/red reales durante las pruebas.
const storageObjects = new Map<string, { buffer: Buffer; contentType: string }>();
const originalFetch = global.fetch;
const oldEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
};

before(async () => {
  process.env.SUPABASE_URL = "https://payments-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_STORAGE_BUCKET = "payments-test";
  global.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || "GET";
    if (method === "PUT") {
      const body = init?.body;
      const buffer = Buffer.from(body as Uint8Array);
      const contentType = (init?.headers as Record<string, string>)?.["Content-Type"] || "application/octet-stream";
      storageObjects.set(url, { buffer, contentType });
      return new Response("", { status: 200 });
    }
    if (method === "DELETE") {
      storageObjects.delete(url);
      return new Response("", { status: 200 });
    }
    const stored = storageObjects.get(url);
    if (!stored) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(stored.buffer), { status: 200 });
  };
  await prisma.$connect();
});

afterEach(() => {
  storageObjects.clear();
});

after(async () => {
  const tenantIds = (await prisma.tenant.findMany({ where: { slug: { startsWith: RUN } }, select: { id: true } })).map(
    (entry) => entry.id
  );
  await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.paymentReceipt.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.residentPayment.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.residentCharge.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.paymentImportBatch.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.residentUnit.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.user.deleteMany({ where: { email: { contains: RUN } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  global.fetch = originalFetch;
  if (oldEnv.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldEnv.url;
  if (oldEnv.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldEnv.key;
  if (oldEnv.bucket === undefined) delete process.env.SUPABASE_STORAGE_BUCKET; else process.env.SUPABASE_STORAGE_BUCKET = oldEnv.bucket;
  await prisma.$disconnect();
});

test("1. la importacion crea obligaciones solo en el tenant indicado", async () => {
  const tenantA = await createTenant("ImportA");
  const tenantB = await createTenant("ImportB");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[5, 501, "2026-08", "Cuota administracion", 150000, "2026-08-10", "REF-A"]]);
  await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });

  const chargesA = await listChargesForTenant({ tenantId: tenantA.id, bloque: 5, apto: 501 });
  const chargesB = await listChargesForTenant({ tenantId: tenantB.id, bloque: 5, apto: 501 });
  assert.equal(chargesA.total, 1);
  assert.equal(chargesB.total, 0);
});

test("2. un archivo con extension invalida se rechaza (RESIDENTE nunca llega a este punto: la ruta lo bloquea antes por rol)", async () => {
  const tenantA = await createTenant("BadExt");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[5, 501, "2026-08", "Cuota", 150000, "2026-08-10", ""]]);
  await assertRejectsCode(
    () => processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsm", buffer }),
    "INVALID_FILE_EXTENSION"
  );
});

test("3. una fila con formula queda como invalida y el resto del batch se procesa igual", async () => {
  const tenantA = await createTenant("Formula");
  const admin = await createMember(tenantA.id, "ADMIN");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Obligaciones");
  sheet.addRow(["bloque", "apto", "periodo", "concepto", "monto", "vencimiento", "referencia"]);
  sheet.addRow([5, 501, "2026-08", "Cuota valida", 150000, "2026-08-10", ""]);
  const badRow = sheet.addRow([5, 502, "2026-08", "Cuota con formula", null, "2026-08-10", ""]);
  badRow.getCell(5).value = { formula: "=1000*150", result: 150000 } as unknown as ExcelJS.CellValue;
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const batch = await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  assert.equal(batch.createdRows, 1);
  assert.equal(batch.invalidRows, 1);
  assert.equal(batch.status, "COMPLETED");
});

test("4. los montos importados no sufren error de coma flotante", async () => {
  const tenantA = await createTenant("Decimal");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[5, 501, "2026-08", "Cuota", 150000.33, "2026-08-10", ""]]);
  await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  const charges = await listChargesForTenant({ tenantId: tenantA.id, bloque: 5, apto: 501 });
  assert.equal(charges.data[0]?.amountCents, 15000033);
});

test("5. la unidad (bloque/apto) se crea automaticamente si no existia", async () => {
  const tenantA = await createTenant("AutoUnit");
  const admin = await createMember(tenantA.id, "ADMIN");
  const before1 = await prisma.residentUnit.count({ where: { tenantId: tenantA.id, bloque: 9, apto: 909 } });
  assert.equal(before1, 0);
  const buffer = await buildXlsxBuffer([[9, 909, "2026-08", "Cuota", 150000, "2026-08-10", ""]]);
  await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  const after1 = await prisma.residentUnit.count({ where: { tenantId: tenantA.id, bloque: 9, apto: 909 } });
  assert.equal(after1, 1);
});

test("6. una fila duplicada dentro del mismo archivo cuenta como duplicada, no crea dos obligaciones", async () => {
  const tenantA = await createTenant("DupSameFile");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([
    [5, 501, "2026-08", "Cuota", 150000, "2026-08-10", ""],
    [5, 501, "2026-08", "Cuota", 150000, "2026-08-10", ""],
  ]);
  const batch = await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  assert.equal(batch.createdRows, 1);
  assert.equal(batch.duplicateRows, 1);
});

test("7. reintentar el mismo archivo no duplica obligaciones", async () => {
  const tenantA = await createTenant("Retry");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[5, 501, "2026-08", "Cuota", 150000, "2026-08-10", ""]]);
  const first = await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  const second = await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  assert.equal(first.createdRows, 1);
  assert.equal(second.createdRows, 0);
  assert.equal(second.duplicateRows, 1);
  const total = await prisma.residentCharge.count({ where: { tenantId: tenantA.id } });
  assert.equal(total, 1);
});

test("8. dos importaciones concurrentes con la misma fila no crean duplicados", async () => {
  const tenantA = await createTenant("Concurrent");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[5, 501, "2026-08", "Cuota", 150000, "2026-08-10", ""]]);
  const [a, b] = await Promise.all([
    processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "a.xlsx", buffer }),
    processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "b.xlsx", buffer }),
  ]);
  const createdTotal = a.createdRows + b.createdRows;
  assert.equal(createdTotal, 1);
  const totalReal = await prisma.residentCharge.count({ where: { tenantId: tenantA.id } });
  assert.equal(totalReal, 1);
});

test("9. el mismo identificador de unidad/periodo/concepto es valido en tenants distintos", async () => {
  const tenantA = await createTenant("SameKeyA");
  const tenantB = await createTenant("SameKeyB");
  const adminA = await createMember(tenantA.id, "ADMIN");
  const adminB = await createMember(tenantB.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[5, 501, "2026-08", "Cuota", 150000, "2026-08-10", ""]]);
  const batchA = await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: adminA.user.id, fileName: "a.xlsx", buffer });
  const batchB = await processChargeImportFile({ tenantId: tenantB.id, uploadedByUserId: adminB.user.id, fileName: "b.xlsx", buffer });
  assert.equal(batchA.createdRows, 1);
  assert.equal(batchB.createdRows, 1);
});

test("10. RESIDENTE ve solo las obligaciones de su propia unidad", async () => {
  const tenantA = await createTenant("OwnUnit");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota propia", amountCents: 100000, dueDate: isoFuture(10),
  });
  await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 8, apto: 801,
    period: "2026-08", concept: "Cuota ajena", amountCents: 100000, dueDate: isoFuture(10),
  });
  const own = await listChargesForTenant({ tenantId: tenantA.id, membershipId: resident.membership.id });
  assert.equal(own.total, 1);
  assert.equal(own.data[0]?.concept, "Cuota propia");
});

test("11. un ID de obligacion existente no da acceso cross-resident", async () => {
  const tenantA = await createTenant("CrossResident");
  const admin = await createMember(tenantA.id, "ADMIN");
  const residentA = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const residentB = await createMember(tenantA.id, "RESIDENTE", { bloque: 8, apto: 801 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota A", amountCents: 100000, dueDate: isoFuture(10),
  });
  await assertRejectsCode(
    () => getChargeForActor({ tenantId: tenantA.id, membershipId: residentB.membership.id, chargeId: charge.id }),
    "CHARGE_NOT_FOUND"
  );
  const ok = await getChargeForActor({ tenantId: tenantA.id, membershipId: residentA.membership.id, chargeId: charge.id });
  assert.equal(ok.id, charge.id);
});

test("12. cambio de tenant no mezcla obligaciones aunque el bloque/apto numerico coincida", async () => {
  const tenantA = await createTenant("NoMixA");
  const tenantB = await createTenant("NoMixB");
  const adminA = await createMember(tenantA.id, "ADMIN");
  const adminB = await createMember(tenantB.id, "ADMIN");
  await createManualCharge({ tenantId: tenantA.id, actorUserId: adminA.user.id, bloque: 1, apto: 101, period: "2026-08", concept: "Cuota A", amountCents: 100000, dueDate: isoFuture(5) });
  await createManualCharge({ tenantId: tenantB.id, actorUserId: adminB.user.id, bloque: 1, apto: 101, period: "2026-08", concept: "Cuota B", amountCents: 200000, dueDate: isoFuture(5) });
  const listA = await listChargesForTenant({ tenantId: tenantA.id, bloque: 1, apto: 101 });
  const listB = await listChargesForTenant({ tenantId: tenantB.id, bloque: 1, apto: 101 });
  assert.equal(listA.data[0]?.concept, "Cuota A");
  assert.equal(listB.data[0]?.concept, "Cuota B");
});

test("13. RESIDENTE carga un comprobante valido para su propia obligacion", async () => {
  const tenantA = await createTenant("UploadOwn");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  assert.equal(receipt.status, "PENDING");
  assert.equal(receipt.chargeId, charge.id);
});

test("14. cargar un comprobante para una obligacion ajena falla", async () => {
  const tenantA = await createTenant("UploadForeign");
  const admin = await createMember(tenantA.id, "ADMIN");
  const owner = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const stranger = await createMember(tenantA.id, "RESIDENTE", { bloque: 8, apto: 801 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  void owner;
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: stranger.membership.id, uploadedByUserId: stranger.user.id,
      chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
    }),
    "CHARGE_NOT_FOUND"
  );
});

test("15. un MIME no permitido se rechaza", async () => {
  const tenantA = await createTenant("BadMime");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
      chargeId: charge.id, fileName: "comprobante.exe", mimeType: "application/x-msdownload", buffer: PDF_BUFFER,
    }),
    "INVALID_FILE_TYPE"
  );
});

test("16. una firma binaria que no coincide con el MIME declarado se rechaza", async () => {
  const tenantA = await createTenant("BadSignature");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
      chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: NOT_PDF_BUFFER,
    }),
    "INVALID_FILE_SIGNATURE"
  );
});

test("17. una extension incoherente con el MIME se rechaza", async () => {
  const tenantA = await createTenant("BadExtension");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
      chargeId: charge.id, fileName: "comprobante.png", mimeType: "application/pdf", buffer: PDF_BUFFER,
    }),
    "INVALID_FILE_EXTENSION"
  );
});

test("18. un archivo que supera el tamano maximo se rechaza", async () => {
  const tenantA = await createTenant("TooLarge");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const huge = Buffer.concat([Buffer.from("%PDF-1.4"), Buffer.alloc(9 * 1024 * 1024, 65)]);
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
      chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: huge,
    }),
    "FILE_TOO_LARGE"
  );
});

test("19. un nombre de archivo con traversal se rechaza", async () => {
  const tenantA = await createTenant("Traversal");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
      chargeId: charge.id, fileName: "../../etc/passwd.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
    }),
    "INVALID_FILE_NAME"
  );
});

test("20. la descarga propia del comprobante funciona y devuelve el contenido subido", async () => {
  const tenantA = await createTenant("DownloadOwn");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const file = await getReceiptFileForActor({ tenantId: tenantA.id, actorRole: "RESIDENTE", membershipId: resident.membership.id, receiptId: receipt.id });
  assert.equal(file.buffer.toString(), PDF_BUFFER.toString());
});

test("21. la descarga de un comprobante ajeno falla para RESIDENTE", async () => {
  const tenantA = await createTenant("DownloadForeign");
  const admin = await createMember(tenantA.id, "ADMIN");
  const owner = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const stranger = await createMember(tenantA.id, "RESIDENTE", { bloque: 8, apto: 801 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: owner.membership.id, uploadedByUserId: owner.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  await assertRejectsCode(
    () => getReceiptFileForActor({ tenantId: tenantA.id, actorRole: "RESIDENTE", membershipId: stranger.membership.id, receiptId: receipt.id }),
    "RECEIPT_NOT_FOUND"
  );
});

test("22. ADMIN solo descarga comprobantes de su propio tenant", async () => {
  const tenantA = await createTenant("AdminDownloadA");
  const tenantB = await createTenant("AdminDownloadB");
  const adminA = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: adminA.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const ok = await getReceiptFileForActor({ tenantId: tenantA.id, actorRole: "ADMIN", membershipId: null, receiptId: receipt.id });
  assert.ok(ok.buffer.length > 0);
  await assertRejectsCode(
    () => getReceiptFileForActor({ tenantId: tenantB.id, actorRole: "ADMIN", membershipId: null, receiptId: receipt.id }),
    "RECEIPT_NOT_FOUND"
  );
});

test("23. una aprobacion valida crea el pago y actualiza el saldo de la obligacion", async () => {
  const tenantA = await createTenant("ApproveOk");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const reviewed = await reviewReceipt({
    tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED",
    amountCents: 150000, paidAt: new Date().toISOString(), reference: "REF-1",
  });
  assert.equal(reviewed.status, "APPROVED");
  const updatedCharge = await prisma.residentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.equal(updatedCharge.paidCents, 150000);
  assert.equal(updatedCharge.status, "PAID");
  const payments = await prisma.residentPayment.count({ where: { chargeId: charge.id, status: "CONFIRMED" } });
  assert.equal(payments, 1);
});

test("24. un rechazo valido guarda el motivo y no crea pago", async () => {
  const tenantA = await createTenant("RejectOk");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const reviewed = await reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "REJECTED", rejectionReason: "Comprobante ilegible" });
  assert.equal(reviewed.status, "REJECTED");
  assert.equal(reviewed.rejectionReason, "Comprobante ilegible");
  const payments = await prisma.residentPayment.count({ where: { chargeId: charge.id } });
  assert.equal(payments, 0);
});

test("25. revisar un comprobante ya revisado es una transicion invalida", async () => {
  const tenantA = await createTenant("InvalidTransition");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  await reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "REJECTED", rejectionReason: "Ilegible" });
  await assertRejectsCode(
    () => reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED", amountCents: 150000, paidAt: new Date().toISOString() }),
    "INVALID_TRANSITION"
  );
});

test("26. dos aprobaciones concurrentes sobre el mismo comprobante producen un solo pago", async () => {
  const tenantA = await createTenant("ConcurrentApprove");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const results = await Promise.allSettled([
    reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED", amountCents: 150000, paidAt: new Date().toISOString() }),
    reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED", amountCents: 150000, paidAt: new Date().toISOString() }),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled");
  assert.equal(fulfilled.length, 1);
  const payments = await prisma.residentPayment.count({ where: { chargeId: charge.id, status: "CONFIRMED" } });
  assert.equal(payments, 1);
});

test("27. aprobar un monto que supera el saldo pendiente se rechaza", async () => {
  const tenantA = await createTenant("Overpay");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  await assertRejectsCode(
    () => reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED", amountCents: 999999, paidAt: new Date().toISOString() }),
    "AMOUNT_EXCEEDS_BALANCE"
  );
});

test("28. un pago parcial deja la obligacion en PARTIAL y un segundo pago la completa (PAID)", async () => {
  const tenantA = await createTenant("PartialPay");
  const admin = await createMember(tenantA.id, "ADMIN");
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 200000, dueDate: isoFuture(10),
  });
  await recordManualPayment({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: charge.id, amountCents: 120000, paidAt: new Date().toISOString() });
  const afterFirst = await prisma.residentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.equal(afterFirst.status, "PARTIAL");
  await recordManualPayment({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: charge.id, amountCents: 80000, paidAt: new Date().toISOString() });
  const afterSecond = await prisma.residentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.equal(afterSecond.status, "PAID");
  assert.equal(afterSecond.paidCents, 200000);
});

test("29. revertir un pago confirmado resta el saldo y conserva el historial (no borra la fila)", async () => {
  const tenantA = await createTenant("Reverse");
  const admin = await createMember(tenantA.id, "ADMIN");
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const payment = await recordManualPayment({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: charge.id, amountCents: 150000, paidAt: new Date().toISOString() });
  const reversed = await reversePayment({ tenantId: tenantA.id, actorUserId: admin.user.id, paymentId: payment.id, reason: "Error de digitacion" });
  assert.equal(reversed.status, "REVERSED");
  const stillExists = await prisma.residentPayment.findUnique({ where: { id: payment.id } });
  assert.ok(stillExists);
  const chargeAfter = await prisma.residentCharge.findUniqueOrThrow({ where: { id: charge.id } });
  assert.equal(chargeAfter.paidCents, 0);
  assert.equal(chargeAfter.status, "PENDING");
});

test("30. revertir un pago ya revertido falla", async () => {
  const tenantA = await createTenant("ReverseTwice");
  const admin = await createMember(tenantA.id, "ADMIN");
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const payment = await recordManualPayment({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: charge.id, amountCents: 150000, paidAt: new Date().toISOString() });
  await reversePayment({ tenantId: tenantA.id, actorUserId: admin.user.id, paymentId: payment.id, reason: "Correccion" });
  await assertRejectsCode(
    () => reversePayment({ tenantId: tenantA.id, actorUserId: admin.user.id, paymentId: payment.id, reason: "Otra vez" }),
    "NOT_REVERSIBLE"
  );
});

test("31. RESIDENTE retira su propio comprobante pendiente; retirarlo dos veces falla", async () => {
  const tenantA = await createTenant("Withdraw");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const withdrawn = await withdrawReceipt({ tenantId: tenantA.id, membershipId: resident.membership.id, receiptId: receipt.id });
  assert.equal(withdrawn.status, "WITHDRAWN");
  await assertRejectsCode(
    () => withdrawReceipt({ tenantId: tenantA.id, membershipId: resident.membership.id, receiptId: receipt.id }),
    "NOT_WITHDRAWABLE"
  );
});

test("32. RESIDENTE no puede retirar el comprobante de otro residente", async () => {
  const tenantA = await createTenant("WithdrawForeign");
  const admin = await createMember(tenantA.id, "ADMIN");
  const owner = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const stranger = await createMember(tenantA.id, "RESIDENTE", { bloque: 8, apto: 801 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: owner.membership.id, uploadedByUserId: owner.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  await assertRejectsCode(
    () => withdrawReceipt({ tenantId: tenantA.id, membershipId: stranger.membership.id, receiptId: receipt.id }),
    "RECEIPT_NOT_FOUND"
  );
});

test("33. una membresia inactiva no puede cargar comprobantes", async () => {
  const tenantA = await createTenant("InactiveMember");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701, isActive: false });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  await assertRejectsCode(
    () => uploadReceipt({
      tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
      chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
    }),
    "UNIT_NOT_FOUND"
  );
});

test("34. aprobar un comprobante notifica al residente correcto en el tenant correcto", async () => {
  const tenantA = await createTenant("NotifyTenant");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  await reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED", amountCents: 150000, paidAt: new Date().toISOString() });
  const notification = await prisma.notification.findFirst({
    where: { tenantId: tenantA.id, userId: resident.user.id, type: "PAYMENT_RECEIPT_APPROVED" },
  });
  assert.ok(notification);
  assert.equal(notification?.tenantId, tenantA.id);
});

test("35. cancelar una obligacion sin pagos funciona; con pagos abonados se rechaza", async () => {
  const tenantA = await createTenant("CancelCharge");
  const admin = await createMember(tenantA.id, "ADMIN");
  const chargeFree = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Sin pagos", amountCents: 150000, dueDate: isoFuture(10),
  });
  const cancelled = await cancelCharge({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: chargeFree.id });
  assert.equal(cancelled.status, "CANCELLED");

  const chargePaid = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-09", concept: "Con pago", amountCents: 150000, dueDate: isoFuture(10),
  });
  await recordManualPayment({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: chargePaid.id, amountCents: 50000, paidAt: new Date().toISOString() });
  await assertRejectsCode(
    () => cancelCharge({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: chargePaid.id }),
    "AMOUNT_EXCEEDS_BALANCE"
  );
});

test("36. un error inesperado no expone detalles internos (Prisma/SQL/Storage)", async () => {
  const tenantA = await createTenant("GenericError");
  const admin = await createMember(tenantA.id, "ADMIN");
  await assertRejectsCode(
    () => recordManualPayment({ tenantId: tenantA.id, actorUserId: admin.user.id, chargeId: "id-inexistente", amountCents: 1000, paidAt: new Date().toISOString() }),
    "CHARGE_NOT_FOUND"
  );
});

test("37. flujo completo: ADMIN importa, RESIDENTE consulta y carga comprobante, ADMIN aprueba, el saldo se actualiza", async () => {
  const tenantA = await createTenant("FullFlow");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 6, apto: 601 });

  const buffer = await buildXlsxBuffer([[6, 601, "2026-08", "Cuota de administracion", 180000, "2026-08-15", "REF-FULL"]]);
  const batch = await processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer });
  assert.equal(batch.createdRows, 1);

  const own = await listChargesForTenant({ tenantId: tenantA.id, membershipId: resident.membership.id });
  assert.equal(own.total, 1);
  const charge = own.data[0]!;

  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: OTHER_PDF_BUFFER,
  });
  assert.equal(receipt.status, "PENDING");

  await reviewReceipt({
    tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED",
    amountCents: 18000000, paidAt: new Date().toISOString(), reference: "REF-FULL",
  });

  const finalCharge = await getChargeForActor({ tenantId: tenantA.id, membershipId: resident.membership.id, chargeId: charge.id });
  assert.equal(finalCharge.status, "PAID");
  assert.equal(finalCharge.paidCents, 18000000);
  assert.equal(finalCharge.payments.length, 1);
});

test("38. importacion y alta manual concurrentes de la misma obligacion no duplican ni abortan el batch", async () => {
  const tenantA = await createTenant("ImportManualRace");
  const admin = await createMember(tenantA.id, "ADMIN");
  const buffer = await buildXlsxBuffer([[7, 701, "2026-08", "Cuota concurrente", 1250, "2026-08-15", "REF-RACE"]]);

  const results = await Promise.allSettled([
    processChargeImportFile({ tenantId: tenantA.id, uploadedByUserId: admin.user.id, fileName: "cuotas.xlsx", buffer }),
    createManualCharge({
      tenantId: tenantA.id,
      actorUserId: admin.user.id,
      bloque: 7,
      apto: 701,
      period: "2026-08",
      concept: "Cuota concurrente",
      amountCents: 125000,
      dueDate: "2026-08-15T00:00:00.000Z",
    }),
  ]);

  assert.equal(results[0]?.status, "fulfilled", "la importacion debe terminar de forma controlada");
  const charges = await prisma.residentCharge.findMany({
    where: { tenantId: tenantA.id, period: "2026-08", concept: "Cuota concurrente" },
  });
  assert.equal(charges.length, 1);
  assert.ok(results.some((result) => result.status === "fulfilled"));
  for (const result of results) {
    if (result.status === "rejected") {
      assert.ok(result.reason instanceof PaymentDomainError);
      assert.equal(result.reason.code, "INVALID_INPUT");
    }
  }
});

test("39. un nuevo residente de la misma unidad no recibe referencias ni comprobantes historicos", async () => {
  const tenantA = await createTenant("HistoricResidentPrivacy");
  const admin = await createMember(tenantA.id, "ADMIN");
  const formerResident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: formerResident.membership.id, uploadedByUserId: formerResident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  await recordManualPayment({
    tenantId: tenantA.id,
    actorUserId: admin.user.id,
    chargeId: charge.id,
    amountCents: 50000,
    paidAt: new Date().toISOString(),
    reference: "REFERENCIA-DEL-RESIDENTE-ANTERIOR",
  });
  const newResident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });

  const visible = await getChargeForActor({ tenantId: tenantA.id, membershipId: newResident.membership.id, chargeId: charge.id });
  assert.equal(visible.payments.length, 1);
  assert.equal("reference" in visible.payments[0]!, false);
  assert.equal("recordedByUserId" in visible.payments[0]!, false);
  await assertRejectsCode(
    () => getReceiptFileForActor({ tenantId: tenantA.id, actorRole: "RESIDENTE", membershipId: newResident.membership.id, receiptId: receipt.id }),
    "RECEIPT_NOT_FOUND"
  );
});

test("40. aprobar y retirar el mismo comprobante concurrentemente deja una sola transicion terminal", async () => {
  const tenantA = await createTenant("ReviewWithdrawRace");
  const admin = await createMember(tenantA.id, "ADMIN");
  const resident = await createMember(tenantA.id, "RESIDENTE", { bloque: 7, apto: 701 });
  const charge = await createManualCharge({
    tenantId: tenantA.id, actorUserId: admin.user.id, bloque: 7, apto: 701,
    period: "2026-08", concept: "Cuota", amountCents: 150000, dueDate: isoFuture(10),
  });
  const receipt = await uploadReceipt({
    tenantId: tenantA.id, membershipId: resident.membership.id, uploadedByUserId: resident.user.id,
    chargeId: charge.id, fileName: "comprobante.pdf", mimeType: "application/pdf", buffer: PDF_BUFFER,
  });
  const results = await Promise.allSettled([
    reviewReceipt({ tenantId: tenantA.id, actorUserId: admin.user.id, receiptId: receipt.id, decision: "APPROVED", amountCents: 150000, paidAt: new Date().toISOString() }),
    withdrawReceipt({ tenantId: tenantA.id, membershipId: resident.membership.id, receiptId: receipt.id }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const finalReceipt = await prisma.paymentReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
  const confirmedPayments = await prisma.residentPayment.count({ where: { chargeId: charge.id, status: "CONFIRMED" } });
  assert.ok(["APPROVED", "WITHDRAWN"].includes(finalReceipt.status));
  assert.equal(confirmedPayments, finalReceipt.status === "APPROVED" ? 1 : 0);
  if (finalReceipt.status === "WITHDRAWN") {
    await assertRejectsCode(
      () => getReceiptFileForActor({ tenantId: tenantA.id, actorRole: "RESIDENTE", membershipId: resident.membership.id, receiptId: receipt.id }),
      "RECEIPT_NOT_FOUND"
    );
  }
});
