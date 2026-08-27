import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotificationIdempotent, NotificationTypes } from "@/domains/notifications/notification.service";
import { getOrCreateUnit, lockChargeIdentity } from "@/domains/payments/payment.service";
import { hasXlsxSignature, parseChargeImportWorkbook, type ParsedChargeRow } from "@/domains/payments/payment-excel";
import { MAX_IMPORT_FILE_BYTES, PaymentDomainError } from "@/domains/payments/payment-security";
import { assertTenantFeatureActive } from "@/domains/commercial/entitlement.service";
import { assertSafeXlsxArchive, XlsxArchiveError } from "@/lib/xlsx-security";

const MAX_ERROR_SUMMARY_ENTRIES = 50;

// Un solo advisory lock por tenant serializa TODO el procesamiento de
// importaciones de ese tenant. Combinado con la clave unica
// (tenantId, unitId, period, concept) de ResidentCharge, esto es lo que
// garantiza que reintentar el mismo archivo -- o dos importaciones
// concurrentes con una fila equivalente -- no duplique una obligacion.
async function lockTenantImports(tx: Prisma.TransactionClient, tenantId: string) {
  const key = `payment-import:${tenantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function processChargeImportFile({
  tenantId,
  uploadedByUserId,
  fileName,
  buffer,
  origin,
}: {
  tenantId: string;
  uploadedByUserId: string;
  fileName: string;
  buffer: Buffer;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  if (!fileName.toLowerCase().endsWith(".xlsx")) throw new PaymentDomainError("INVALID_FILE_EXTENSION");
  if (buffer.length === 0) throw new PaymentDomainError("FILE_EMPTY");
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new PaymentDomainError("FILE_TOO_LARGE");
  if (!hasXlsxSignature(buffer)) throw new PaymentDomainError("INVALID_FILE_SIGNATURE");
  try {
    assertSafeXlsxArchive(buffer);
  } catch (error) {
    if (error instanceof XlsxArchiveError) throw new PaymentDomainError("IMPORT_ARCHIVE_UNSAFE");
    throw error;
  }

  // Errores de estructura del archivo (ilegible, sin hoja, encabezados
  // equivocados, demasiadas filas) se rechazan directamente: no llegan a
  // crear un batch, porque no representan un resultado parcial sino un
  // archivo invalido de raiz.
  const parsed = await parseChargeImportWorkbook(buffer);
  if (parsed.validRows.length === 0 && parsed.invalidRows.length === 0) {
    throw new PaymentDomainError("IMPORT_NO_VALID_ROWS");
  }

  let batchId: string;
  try {
    const outcome = await prisma.$transaction(async (tx) => {
      await lockTenantImports(tx, tenantId);

      const batch = await tx.paymentImportBatch.create({
        data: {
          tenantId,
          uploadedByUserId,
          fileName,
          status: "PROCESSING",
          totalRows: parsed.totalRows,
        },
      });

      let createdRows = 0;
      let duplicateRows = 0;
      const rowErrors: { row: number; message: string }[] = parsed.invalidRows
        .slice(0, MAX_ERROR_SUMMARY_ENTRIES)
        .map((entry) => ({ row: entry.rowNumber, message: entry.message }));

      for (const row of parsed.validRows) {
        const created = await upsertChargeFromImportRow(tx, tenantId, batch.id, row);
        if (created) createdRows += 1;
        else duplicateRows += 1;
      }

      const completed = await tx.paymentImportBatch.update({
        where: { id: batch.id },
        data: {
          status: "COMPLETED",
          validRows: parsed.validRows.length,
          invalidRows: parsed.invalidRows.length,
          createdRows,
          duplicateRows,
          errorSummary: rowErrors.length > 0 ? rowErrors : Prisma.JsonNull,
          completedAt: new Date(),
        },
      });

      await registerAuditLog(
        {
          actorUserId: uploadedByUserId,
          tenantId,
          action: AuditAction.PAYMENT_IMPORT_BATCH_COMPLETED,
          targetType: "PaymentImportBatch",
          targetId: batch.id,
          origin,
          metadata: {
            totalRows: parsed.totalRows,
            createdRows,
            duplicateRows,
            invalidRows: parsed.invalidRows.length,
          },
        },
        tx
      );

      return completed;
    });
    batchId = outcome.id;
  } catch (error) {
    throw error;
  }

  const finalBatch = await prisma.paymentImportBatch.findUniqueOrThrow({ where: { id: batchId } });
  await notifyImportCompleted(tenantId, finalBatch);
  return finalBatch;
}

async function upsertChargeFromImportRow(
  tx: Prisma.TransactionClient,
  tenantId: string,
  batchId: string,
  row: ParsedChargeRow
): Promise<boolean> {
  const unit = await getOrCreateUnit(tx, tenantId, row.bloque, row.apto);
  // Este lock tambien lo toma la creacion manual. La pre-verificacion y el
  // create quedan coordinados con cualquier escritor de la misma clave unica.
  await lockChargeIdentity(tx, tenantId, unit.id, row.period, row.concept);
  // Se pre-verifica existencia en vez de intentar el create y atrapar P2002:
  // dentro de una transaccion interactiva de Postgres, un statement que
  // viola una constraint deja la transaccion en estado "aborted" para TODO
  // statement posterior, incluso si el error se atrapa en JS (no hay
  // savepoint implicito por operacion). El advisory lock por tenant tomado
  // antes de este bucle serializa todo el procesamiento de importaciones de
  // este tenant, por lo que este chequeo-y-creacion es seguro frente a otra
  // importacion concurrente; sigue existiendo la clave unica de
  // ResidentCharge como barrera autoritativa de ultima instancia frente a
  // una fila creada manualmente fuera del flujo de importacion.
  const existing = await tx.residentCharge.findFirst({
    where: { tenantId, unitId: unit.id, period: row.period, concept: row.concept },
    select: { id: true },
  });
  if (existing) return false;

  await tx.residentCharge.create({
    data: {
      tenantId,
      unitId: unit.id,
      period: row.period,
      concept: row.concept,
      amountCents: row.amountCents,
      dueDate: row.dueDate,
      status: "PENDING",
      source: "IMPORT",
      importBatchId: batchId,
    },
  });
  return true;
}

export async function getImportBatchForTenant({ tenantId, batchId }: { tenantId: string; batchId: string }) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const batch = await prisma.paymentImportBatch.findFirst({ where: { id: batchId, tenantId } });
  if (!batch) throw new PaymentDomainError("IMPORT_BATCH_NOT_FOUND");
  return batch;
}

export async function listImportBatchesForTenant({ tenantId }: { tenantId: string }) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  return prisma.paymentImportBatch.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 50 });
}

async function notifyImportCompleted(
  tenantId: string,
  batch: { id: string; uploadedByUserId: string; createdRows: number; invalidRows: number; duplicateRows: number }
) {
  const uploader = await prisma.tenantMembership.findFirst({
    where: { tenantId, userId: batch.uploadedByUserId, isActive: true, user: { isActive: true } },
    select: { userId: true },
  });
  if (!uploader) return;
  await createNotificationIdempotent(
    {
      tenantId,
      userId: uploader.userId,
      type: NotificationTypes.PAYMENT_IMPORT_COMPLETED,
      title: "Importacion de obligaciones completada",
      message: `Se crearon ${batch.createdRows} obligaciones (${batch.duplicateRows} duplicadas, ${batch.invalidRows} invalidas).`,
      resourceType: "PaymentImportBatch",
      resourceId: batch.id,
      dedupeKey: `import-batch:${batch.id}:completed`,
    },
    prisma
  ).catch(() => null);
}
