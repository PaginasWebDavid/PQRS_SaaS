import ExcelJS from "exceljs";
import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";

// Para los tres pilotos, una exportacion sincrona con limite razonable es
// suficiente. Un tenant que supere esto devuelve un error controlado en vez
// de cargar un volumen arbitrario en memoria; a esa escala corresponderia una
// exportacion asistida (por consulta directa), no ampliar este limite.
export const MAX_EXPORT_PQRS_ROWS = 5000;
export const MAX_EXPORT_USERS_ROWS = 2000;

export class TenantExportError extends Error {
  readonly code: "TENANT_NOT_FOUND" | "EXPORT_TOO_LARGE";
  constructor(code: "TENANT_NOT_FOUND" | "EXPORT_TOO_LARGE", message: string) {
    super(message);
    this.name = "TenantExportError";
    this.code = code;
  }
}

export function sanitizeSpreadsheetCell(value: string | null | undefined): string {
  const raw = value ?? "";
  const normalized = raw.replace(/[\r\n]+/g, " ").trim();
  // Excel interpreta estos prefijos como formulas, incluso cuando el contenido
  // proviene de un campo de texto. El apostrofo fuerza una celda literal.
  return /^[=+\-@]/.test(normalized) || /^[\t\r]/.test(raw) ? `'${normalized}` : normalized;
}

export function sanitizeExportFileNamePart(value: string): string {
  const safe = value.replace(/[\r\n]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe.slice(0, 100) || "conjunto";
}

export async function exportTenantData({
  tenantId,
  actorUserId,
}: {
  tenantId: string;
  actorUserId: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } });
  if (!tenant) throw new TenantExportError("TENANT_NOT_FOUND", "Conjunto no encontrado");

  const [pqrsCount, membershipCount] = await Promise.all([
    prisma.pqrs.count({ where: { tenantId } }),
    prisma.tenantMembership.count({ where: { tenantId } }),
  ]);
  if (pqrsCount > MAX_EXPORT_PQRS_ROWS || membershipCount > MAX_EXPORT_USERS_ROWS) {
    throw new TenantExportError(
      "EXPORT_TOO_LARGE",
      "Este conjunto supera el limite de exportacion automatica. Solicita una exportacion asistida."
    );
  }

  const [pqrsRows, memberships] = await Promise.all([
    prisma.pqrs.findMany({
      where: { tenantId },
      orderBy: { numero: "asc" },
      select: {
        id: true,
        numero: true,
        titulo: true,
        asunto: true,
        estado: true,
        bloque: true,
        apto: true,
        fechaRecibido: true,
        fechaPrimerContacto: true,
        fechaCierre: true,
        creadoPorId: true,
        creadoPor: { select: { name: true } },
        evidenciaArchivoNombre: true,
        evidenciaArchivoTipo: true,
        historial: {
          orderBy: { creadoAt: "asc" },
          select: { estadoAntes: true, estadoDespues: true, nota: true, creadoAt: true },
        },
        fotos: { orderBy: { orden: "asc" }, select: { nombre: true, tipo: true } },
      },
    }),
    prisma.tenantMembership.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        isActive: true,
        bloque: true,
        apto: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "PQRS Services";
  workbook.created = new Date();

  const pqrsSheet = workbook.addWorksheet("PQRS");
  pqrsSheet.columns = [
    { header: "Numero", key: "numero", width: 10 },
    { header: "Titulo", key: "titulo", width: 30 },
    { header: "Categoria", key: "categoria", width: 18 },
    { header: "Estado", key: "estado", width: 14 },
    { header: "Bloque", key: "bloque", width: 10 },
    { header: "Apto", key: "apto", width: 10 },
    { header: "Fecha recibido", key: "fechaRecibido", width: 20 },
    { header: "Fecha primer contacto", key: "fechaPrimerContacto", width: 20 },
    { header: "Fecha cierre", key: "fechaCierre", width: 20 },
    { header: "Creado por (id)", key: "creadoPorId", width: 26 },
    { header: "Creado por (nombre)", key: "creadoPorNombre", width: 24 },
    { header: "Evidencias (nombre)", key: "evidenciasNombres", width: 40 },
  ];
  for (const pqrs of pqrsRows) {
    pqrsSheet.addRow({
      numero: pqrs.numero,
      titulo: sanitizeSpreadsheetCell(pqrs.titulo),
      categoria: sanitizeSpreadsheetCell(pqrs.asunto),
      estado: pqrs.estado,
      bloque: pqrs.bloque,
      apto: pqrs.apto,
      fechaRecibido: pqrs.fechaRecibido,
      fechaPrimerContacto: pqrs.fechaPrimerContacto,
      fechaCierre: pqrs.fechaCierre,
      creadoPorId: pqrs.creadoPorId || "",
      creadoPorNombre: sanitizeSpreadsheetCell(pqrs.creadoPor?.name),
      // Solo identificadores/nombres sanitizados, nunca la ruta de storage.
      evidenciasNombres: pqrs.fotos.map((f) => sanitizeSpreadsheetCell(f.nombre)).join("; ")
        || sanitizeSpreadsheetCell(pqrs.evidenciaArchivoNombre),
    });
  }

  const historialSheet = workbook.addWorksheet("PQRS_Historial");
  historialSheet.columns = [
    { header: "Numero PQRS", key: "numero", width: 12 },
    { header: "Estado antes", key: "estadoAntes", width: 16 },
    { header: "Estado despues", key: "estadoDespues", width: 16 },
    { header: "Nota", key: "nota", width: 50 },
    { header: "Fecha", key: "fecha", width: 20 },
  ];
  for (const pqrs of pqrsRows) {
    for (const entry of pqrs.historial) {
      historialSheet.addRow({
        numero: pqrs.numero,
        estadoAntes: entry.estadoAntes || "",
        estadoDespues: entry.estadoDespues,
        nota: sanitizeSpreadsheetCell(entry.nota),
        fecha: entry.creadoAt,
      });
    }
  }

  const usersSheet = workbook.addWorksheet("Usuarios");
  usersSheet.columns = [
    { header: "Nombre", key: "nombre", width: 26 },
    { header: "Email", key: "email", width: 30 },
    { header: "Rol", key: "rol", width: 14 },
    { header: "Membresia activa", key: "activa", width: 16 },
    { header: "Bloque", key: "bloque", width: 10 },
    { header: "Apto", key: "apto", width: 10 },
    { header: "Fecha de alta", key: "fechaAlta", width: 20 },
  ];
  for (const membership of memberships) {
    usersSheet.addRow({
      nombre: sanitizeSpreadsheetCell(membership.user.name),
      email: sanitizeSpreadsheetCell(membership.user.email),
      rol: membership.role,
      activa: membership.isActive ? "Si" : "No",
      bloque: membership.bloque,
      apto: membership.apto,
      fechaAlta: membership.createdAt,
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await registerAuditLog({
    actorUserId,
    tenantId,
    action: AuditAction.REPORT_EXPORTED,
    targetType: "Tenant",
    targetId: tenant.id,
    metadata: { kind: "tenant_offboarding_export", pqrsCount: pqrsRows.length, usersCount: memberships.length },
  });

  return { buffer, fileName: `${sanitizeExportFileNamePart(tenant.slug)}-export-${new Date().toISOString().slice(0, 10)}.xlsx` };
}
