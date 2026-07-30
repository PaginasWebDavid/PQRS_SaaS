import { AuditAction, ChargeStatus, Prisma, ReceiptStatus, ResidentPaymentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { registerAuditLog } from "@/domains/platform/audit.service";
import { createNotificationIdempotent, NotificationTypes } from "@/domains/notifications/notification.service";
import { renderEmailLayout, sendEmailSafe } from "@/lib/email";
import {
  assertStoragePathForTenant,
  deleteFromStorage,
  downloadFromStorage,
  matchesDeclaredType,
  uploadToStorage,
} from "@/lib/storage";
import {
  MAX_RECEIPT_FILE_BYTES,
  PaymentDomainError,
  assertOriginalFileName,
  assertReceiptExtensionMatches,
  assertReceiptMimeType,
  escapePaymentHtml,
  normalizeAmountCents,
  normalizeConcept,
  normalizePeriod,
  normalizeReference,
  normalizeRejectionReason,
  normalizeReversalReason,
  normalizeUnit,
  parseIsoDate,
  type ReceiptMimeType,
} from "@/domains/payments/payment-security";
import { assertTenantFeatureActive } from "@/domains/commercial/entitlement.service";

const OPEN_RECEIPT_STATUSES: ReceiptStatus[] = ["PENDING"];

// --- Helpers internos --------------------------------------------------

async function lockCharge(tx: Prisma.TransactionClient, tenantId: string, chargeId: string) {
  const key = `resident-charge:${tenantId}:${chargeId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

function deriveChargeStatus(amountCents: number, paidCents: number, currentStatus: ChargeStatus): ChargeStatus {
  if (currentStatus === "CANCELLED") return "CANCELLED";
  if (paidCents <= 0) return "PENDING";
  if (paidCents >= amountCents) return "PAID";
  return "PARTIAL";
}

async function lockResidentUnit(tx: Prisma.TransactionClient, tenantId: string, bloque: number, apto: number) {
  const key = `resident-unit:${tenantId}:${bloque}:${apto}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function lockChargeIdentity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  unitId: string,
  period: string,
  concept: string
) {
  const key = `resident-charge-identity:${tenantId}:${unitId}:${period}:${concept}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

export async function getOrCreateUnit(
  tx: Prisma.TransactionClient,
  tenantId: string,
  bloque: number,
  apto: number
) {
  // Tanto importacion como alta manual pasan por este lock. Evita capturar
  // P2002 dentro de una transaccion PostgreSQL ya abortada al crear la unidad
  // perezosamente bajo concurrencia.
  await lockResidentUnit(tx, tenantId, bloque, apto);
  const existing = await tx.residentUnit.findFirst({ where: { tenantId, bloque, apto } });
  if (existing) return existing;
  return tx.residentUnit.create({ data: { tenantId, bloque, apto } });
}

async function getMembershipUnitOrThrow(tenantId: string, membershipId: string) {
  const membership = await prisma.tenantMembership.findFirst({
    where: { id: membershipId, tenantId, isActive: true, role: "RESIDENTE", user: { isActive: true } },
    select: { id: true, bloque: true, apto: true },
  });
  if (!membership || membership.bloque === null || membership.apto === null) {
    throw new PaymentDomainError("UNIT_NOT_FOUND");
  }
  return { bloque: membership.bloque, apto: membership.apto };
}

// --- Unidades / obligaciones ------------------------------------------

export async function createManualCharge({
  tenantId,
  actorUserId,
  bloque,
  apto,
  period,
  concept,
  amountCents,
  dueDate,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  bloque: unknown;
  apto: unknown;
  period: unknown;
  concept: unknown;
  amountCents: unknown;
  dueDate: unknown;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const unitInput = normalizeUnit(bloque, apto);
  const normalizedPeriod = normalizePeriod(period);
  const normalizedConcept = normalizeConcept(concept);
  const normalizedAmount = normalizeAmountCents(amountCents);
  const normalizedDueDate = parseIsoDate(dueDate, "INVALID_DUE_DATE");

  try {
    return await prisma.$transaction(async (tx) => {
      const unit = await getOrCreateUnit(tx, tenantId, unitInput.bloque, unitInput.apto);
      // Comparte lock con la importacion: una carga masiva y un alta manual de
      // la misma clave idempotente nunca compiten hasta provocar P2002/25P02.
      await lockChargeIdentity(tx, tenantId, unit.id, normalizedPeriod, normalizedConcept);
      const charge = await tx.residentCharge.create({
        data: {
          tenantId,
          unitId: unit.id,
          period: normalizedPeriod,
          concept: normalizedConcept,
          amountCents: normalizedAmount,
          dueDate: normalizedDueDate,
          status: "PENDING",
          source: "MANUAL",
          createdByUserId: actorUserId,
        },
      });
      await registerAuditLog(
        {
          actorUserId,
          tenantId,
          action: AuditAction.RESIDENT_CHARGE_CREATED,
          targetType: "ResidentCharge",
          targetId: charge.id,
          origin,
          metadata: { period: normalizedPeriod, unitId: unit.id },
        },
        tx
      );
      return charge;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PaymentDomainError("INVALID_INPUT");
    }
    throw error;
  }
}

export async function cancelCharge({
  tenantId,
  actorUserId,
  chargeId,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  chargeId: string;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  return prisma.$transaction(async (tx) => {
    await lockCharge(tx, tenantId, chargeId);
    const charge = await tx.residentCharge.findFirst({ where: { id: chargeId, tenantId } });
    if (!charge) throw new PaymentDomainError("CHARGE_NOT_FOUND");
    if (charge.status === "CANCELLED") throw new PaymentDomainError("CHARGE_CANCELLED");
    if (charge.paidCents > 0) throw new PaymentDomainError("AMOUNT_EXCEEDS_BALANCE");
    const updated = await tx.residentCharge.update({
      where: { id: chargeId },
      data: { status: "CANCELLED" },
    });
    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.RESIDENT_CHARGE_CANCELLED,
        targetType: "ResidentCharge",
        targetId: chargeId,
        origin,
        metadata: { unitId: charge.unitId },
      },
      tx
    );
    return updated;
  });
}

export async function listChargesForTenant({
  tenantId,
  membershipId,
  period,
  status,
  bloque,
  apto,
  page = 1,
  pageSize = 25,
}: {
  tenantId: string;
  membershipId?: string | null;
  period?: string | null;
  status?: ChargeStatus | null;
  bloque?: number | null;
  apto?: number | null;
  page?: number;
  pageSize?: number;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  let unitId: string | undefined;
  if (membershipId) {
    const unit = await getMembershipUnitOrThrow(tenantId, membershipId);
    const record = await prisma.residentUnit.findFirst({ where: { tenantId, bloque: unit.bloque, apto: unit.apto } });
    // Sin cargos aun para esta unidad: lista vacia, no un error.
    if (!record) return { data: [], total: 0 };
    unitId = record.id;
  } else if (bloque !== null && bloque !== undefined && apto !== null && apto !== undefined) {
    const record = await prisma.residentUnit.findFirst({ where: { tenantId, bloque, apto } });
    if (!record) return { data: [], total: 0 };
    unitId = record.id;
  }

  const where: Prisma.ResidentChargeWhereInput = {
    tenantId,
    ...(unitId ? { unitId } : {}),
    ...(period ? { period } : {}),
    ...(status ? { status } : {}),
  };
  const [data, total] = await Promise.all([
    prisma.residentCharge.findMany({
      where,
      orderBy: [{ period: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { unit: { select: { bloque: true, apto: true } } },
    }),
    prisma.residentCharge.count({ where }),
  ]);
  return { data, total };
}

export async function getChargeForActor({
  tenantId,
  membershipId,
  chargeId,
}: {
  tenantId: string;
  membershipId: string | null;
  chargeId: string;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const residentView = Boolean(membershipId);
  const charge = await prisma.residentCharge.findFirst({
    where: { id: chargeId, tenantId },
    include: {
      unit: { select: { bloque: true, apto: true } },
      // La obligacion y el saldo son de la unidad, pero un residente nuevo no
      // recibe referencia bancaria, actor ni enlace de comprobante historico
      // de una membresia anterior.
      payments: residentView
        ? { where: { status: "CONFIRMED" }, orderBy: { paidAt: "desc" }, select: { id: true, amountCents: true, paidAt: true, status: true } }
        : { where: { status: "CONFIRMED" }, orderBy: { paidAt: "desc" } },
    },
  });
  if (!charge) throw new PaymentDomainError("CHARGE_NOT_FOUND");
  if (membershipId) {
    const unit = await getMembershipUnitOrThrow(tenantId, membershipId);
    if (charge.unit.bloque !== unit.bloque || charge.unit.apto !== unit.apto) {
      throw new PaymentDomainError("CHARGE_NOT_FOUND");
    }
  }
  return charge;
}

// --- Pagos administrativos directos -------------------------------------

async function applyPaymentToCharge(
  tx: Prisma.TransactionClient,
  tenantId: string,
  chargeId: string,
  amountCents: number
) {
  const charge = await tx.residentCharge.findFirst({ where: { id: chargeId, tenantId } });
  if (!charge) throw new PaymentDomainError("CHARGE_NOT_FOUND");
  if (charge.status === "CANCELLED") throw new PaymentDomainError("CHARGE_CANCELLED");
  const remaining = charge.amountCents - charge.paidCents;
  if (amountCents > remaining) throw new PaymentDomainError("AMOUNT_EXCEEDS_BALANCE");
  const paidCents = charge.paidCents + amountCents;
  const status = deriveChargeStatus(charge.amountCents, paidCents, charge.status);
  await tx.residentCharge.update({ where: { id: chargeId }, data: { paidCents, status } });
  return charge;
}

export async function recordManualPayment({
  tenantId,
  actorUserId,
  chargeId,
  amountCents,
  paidAt,
  reference,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  chargeId: string;
  amountCents: unknown;
  paidAt: unknown;
  reference?: unknown;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const normalizedAmount = normalizeAmountCents(amountCents);
  const normalizedPaidAt = parseIsoDate(paidAt, "INVALID_PAID_AT");
  const normalizedReference = normalizeReference(reference);

  const payment = await prisma.$transaction(async (tx) => {
    await lockCharge(tx, tenantId, chargeId);
    const charge = await applyPaymentToCharge(tx, tenantId, chargeId, normalizedAmount);
    const created = await tx.residentPayment.create({
      data: {
        tenantId,
        chargeId,
        unitId: charge.unitId,
        amountCents: normalizedAmount,
        paidAt: normalizedPaidAt,
        reference: normalizedReference,
        status: "CONFIRMED",
        source: "MANUAL",
        recordedByUserId: actorUserId,
      },
    });
    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.RESIDENT_PAYMENT_RECORDED,
        targetType: "ResidentPayment",
        targetId: created.id,
        origin,
        metadata: { chargeId, source: "MANUAL" },
      },
      tx
    );
    return created;
  });
  return payment;
}

export async function reversePayment({
  tenantId,
  actorUserId,
  paymentId,
  reason,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  paymentId: string;
  reason: unknown;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const normalizedReason = normalizeReversalReason(reason);
  const existing = await prisma.residentPayment.findFirst({ where: { id: paymentId, tenantId } });
  if (!existing) throw new PaymentDomainError("CHARGE_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    await lockCharge(tx, tenantId, existing.chargeId);
    const current = await tx.residentPayment.findFirst({ where: { id: paymentId, tenantId } });
    if (!current) throw new PaymentDomainError("CHARGE_NOT_FOUND");
    if (current.status !== "CONFIRMED") throw new PaymentDomainError("NOT_REVERSIBLE");

    const updated = await tx.residentPayment.updateMany({
      where: { id: paymentId, tenantId, status: "CONFIRMED" as ResidentPaymentStatus },
      data: { status: "REVERSED", reversedAt: new Date(), reversedByUserId: actorUserId, reversalReason: normalizedReason },
    });
    if (updated.count !== 1) throw new PaymentDomainError("NOT_REVERSIBLE");

    const charge = await tx.residentCharge.findFirst({ where: { id: current.chargeId, tenantId } });
    if (charge) {
      const paidCents = Math.max(0, charge.paidCents - current.amountCents);
      const status = deriveChargeStatus(charge.amountCents, paidCents, charge.status);
      await tx.residentCharge.update({ where: { id: charge.id }, data: { paidCents, status } });
    }

    await registerAuditLog(
      {
        actorUserId,
        tenantId,
        action: AuditAction.RESIDENT_PAYMENT_REVERSED,
        targetType: "ResidentPayment",
        targetId: paymentId,
        origin,
        metadata: { chargeId: current.chargeId },
      },
      tx
    );
    return tx.residentPayment.findUniqueOrThrow({ where: { id: paymentId } });
  });
}

// --- Comprobantes --------------------------------------------------------

export async function uploadReceipt({
  tenantId,
  membershipId,
  uploadedByUserId,
  chargeId,
  fileName,
  mimeType,
  buffer,
  declaredAmountCents,
  origin,
}: {
  tenantId: string;
  membershipId: string;
  uploadedByUserId: string;
  chargeId: string;
  fileName: unknown;
  mimeType: unknown;
  buffer: Buffer;
  declaredAmountCents?: unknown;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const safeFileName = assertOriginalFileName(fileName);
  const safeMimeType = assertReceiptMimeType(mimeType);
  assertReceiptExtensionMatches(safeFileName, safeMimeType);
  if (buffer.length === 0) throw new PaymentDomainError("FILE_EMPTY");
  if (buffer.length > MAX_RECEIPT_FILE_BYTES) throw new PaymentDomainError("FILE_TOO_LARGE");
  if (!matchesDeclaredType(buffer, safeMimeType)) throw new PaymentDomainError("INVALID_FILE_SIGNATURE");
  const normalizedDeclaredAmount =
    declaredAmountCents === undefined || declaredAmountCents === null || declaredAmountCents === ""
      ? null
      : normalizeAmountCents(declaredAmountCents);

  // La obligacion debe pertenecer a la misma unidad que la membresia del
  // residente autenticado; nunca se confia en un chargeId ajeno.
  const unit = await getMembershipUnitOrThrow(tenantId, membershipId);
  const unitRecord = await prisma.residentUnit.findFirst({ where: { tenantId, bloque: unit.bloque, apto: unit.apto } });
  if (!unitRecord) throw new PaymentDomainError("CHARGE_NOT_FOUND");
  const charge = await prisma.residentCharge.findFirst({ where: { id: chargeId, tenantId, unitId: unitRecord.id } });
  if (!charge) throw new PaymentDomainError("CHARGE_NOT_FOUND");
  if (charge.status === "CANCELLED") throw new PaymentDomainError("CHARGE_CANCELLED");

  // uploadToStorage deriva su propio path (con un objectId aleatorio nuevo)
  // en vez de aceptar uno externo; se debe usar el path que EL devuelve, no
  // uno calculado por separado, o el registro en DB apuntaria a un objeto
  // distinto del que realmente se subio.
  const uploaded = await uploadToStorage({ tenantId, folder: "comprobantes", fileName: safeFileName, contentType: safeMimeType, buffer });
  const path = uploaded.path;

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const created = await tx.paymentReceipt.create({
        data: {
          tenantId,
          chargeId,
          membershipId,
          uploadedByUserId,
          storagePath: path,
          originalFileName: safeFileName,
          mimeType: safeMimeType,
          sizeBytes: buffer.length,
          declaredAmountCents: normalizedDeclaredAmount,
          status: "PENDING",
        },
      });
      await registerAuditLog(
        {
          actorUserId: uploadedByUserId,
          tenantId,
          action: AuditAction.PAYMENT_RECEIPT_UPLOADED,
          targetType: "PaymentReceipt",
          targetId: created.id,
          origin,
          metadata: { chargeId, sizeBytes: buffer.length, mimeType: safeMimeType },
        },
        tx
      );
      return created;
    });
    await notifyReceiptUploaded({ tenantId, receiptId: receipt.id, chargeConcept: charge.concept });
    return receipt;
  } catch (error) {
    // Compensacion: si el registro en DB falla despues de subir el archivo,
    // se intenta eliminar el objeto recien creado. Un fallo adicional de red
    // aqui puede dejar un archivo huerfano en Storage; se documenta como
    // riesgo residual en el informe de esta fase (reconciliacion manual).
    await deleteFromStorage(path, { tenantId, folders: ["comprobantes"] }).catch(() => null);
    throw error;
  }
}

export type ReceiptDecision = "APPROVED" | "REJECTED";

export async function reviewReceipt({
  tenantId,
  actorUserId,
  receiptId,
  decision,
  amountCents,
  paidAt,
  reference,
  rejectionReason,
  origin,
}: {
  tenantId: string;
  actorUserId: string;
  receiptId: string;
  decision: ReceiptDecision;
  amountCents?: unknown;
  paidAt?: unknown;
  reference?: unknown;
  rejectionReason?: unknown;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const normalizedRejectionReason = decision === "REJECTED" ? normalizeRejectionReason(rejectionReason) : null;
  const normalizedAmount = decision === "APPROVED" ? normalizeAmountCents(amountCents) : null;
  const normalizedPaidAt = decision === "APPROVED" ? parseIsoDate(paidAt, "INVALID_PAID_AT") : null;
  const normalizedReference = decision === "APPROVED" ? normalizeReference(reference) : null;

  const existing = await prisma.paymentReceipt.findFirst({ where: { id: receiptId, tenantId } });
  if (!existing) throw new PaymentDomainError("RECEIPT_NOT_FOUND");
  if (!OPEN_RECEIPT_STATUSES.includes(existing.status)) throw new PaymentDomainError("INVALID_TRANSITION");

  const reviewed = await prisma.$transaction(async (tx) => {
    await lockCharge(tx, tenantId, existing.chargeId);

    const locked = await tx.paymentReceipt.findFirst({ where: { id: receiptId, tenantId } });
    if (!locked || !OPEN_RECEIPT_STATUSES.includes(locked.status)) {
      throw new PaymentDomainError("INVALID_TRANSITION");
    }

    if (decision === "APPROVED") {
      const charge = await applyPaymentToCharge(tx, tenantId, locked.chargeId, normalizedAmount as number);
      const payment = await tx.residentPayment.create({
        data: {
          tenantId,
          chargeId: locked.chargeId,
          unitId: charge.unitId,
          amountCents: normalizedAmount as number,
          paidAt: normalizedPaidAt as Date,
          reference: normalizedReference,
          status: "CONFIRMED",
          source: "RECEIPT_APPROVAL",
          recordedByUserId: actorUserId,
        },
      });
      const updated = await tx.paymentReceipt.updateMany({
        where: { id: receiptId, tenantId, status: "PENDING" },
        data: { status: "APPROVED", reviewedByUserId: actorUserId, reviewedAt: new Date() },
      });
      if (updated.count !== 1) throw new PaymentDomainError("INVALID_TRANSITION");
      await tx.residentPayment.update({ where: { id: payment.id }, data: { receiptId } });
      await registerAuditLog(
        {
          actorUserId,
          tenantId,
          action: AuditAction.PAYMENT_RECEIPT_APPROVED,
          targetType: "PaymentReceipt",
          targetId: receiptId,
          origin,
          metadata: { chargeId: locked.chargeId, paymentId: payment.id },
        },
        tx
      );
    } else {
      const updated = await tx.paymentReceipt.updateMany({
        where: { id: receiptId, tenantId, status: "PENDING" },
        data: { status: "REJECTED", reviewedByUserId: actorUserId, reviewedAt: new Date(), rejectionReason: normalizedRejectionReason },
      });
      if (updated.count !== 1) throw new PaymentDomainError("INVALID_TRANSITION");
      await registerAuditLog(
        {
          actorUserId,
          tenantId,
          action: AuditAction.PAYMENT_RECEIPT_REJECTED,
          targetType: "PaymentReceipt",
          targetId: receiptId,
          origin,
          metadata: { chargeId: locked.chargeId },
        },
        tx
      );
    }

    return tx.paymentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });

  await notifyReceiptReviewed(reviewed);
  return reviewed;
}

export async function withdrawReceipt({
  tenantId,
  membershipId,
  receiptId,
  origin,
}: {
  tenantId: string;
  membershipId: string;
  receiptId: string;
  origin?: string | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const withdrawn = await prisma.$transaction(async (tx) => {
    const candidate = await tx.paymentReceipt.findFirst({
      where: { id: receiptId, tenantId, membershipId },
    });
    if (!candidate) throw new PaymentDomainError("RECEIPT_NOT_FOUND");

    // Comparte el lock con la aprobacion: solo una transicion terminal puede
    // ganar y el cambio de estado queda atomico junto al registro de auditoria.
    await lockCharge(tx, tenantId, candidate.chargeId);
    const locked = await tx.paymentReceipt.findFirst({
      where: { id: receiptId, tenantId, membershipId },
    });
    if (!locked || locked.status !== "PENDING") throw new PaymentDomainError("NOT_WITHDRAWABLE");

    const updated = await tx.paymentReceipt.updateMany({
      where: { id: receiptId, tenantId, membershipId, status: "PENDING" },
      data: { status: "WITHDRAWN", reviewedAt: new Date() },
    });
    if (updated.count !== 1) throw new PaymentDomainError("NOT_WITHDRAWABLE");

    await registerAuditLog(
      {
        actorUserId: locked.uploadedByUserId,
        tenantId,
        action: AuditAction.PAYMENT_RECEIPT_WITHDRAWN,
        targetType: "PaymentReceipt",
        targetId: receiptId,
        origin,
        metadata: { chargeId: locked.chargeId },
      },
      tx
    );
    return tx.paymentReceipt.findUniqueOrThrow({ where: { id: receiptId } });
  });

  // La retirada queda efectiva aunque Storage este temporalmente indisponible.
  // El acceso ya se bloquea por estado; el objeto pendiente de limpieza es seguro.
  await deleteFromStorage(withdrawn.storagePath, { tenantId, folders: ["comprobantes"] }).catch(() => null);
  return withdrawn;
}

export async function listReceiptsForActor({
  tenantId,
  membershipId,
  chargeId,
  status,
}: {
  tenantId: string;
  membershipId?: string | null;
  chargeId?: string | null;
  status?: ReceiptStatus | null;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const where: Prisma.PaymentReceiptWhereInput = {
    tenantId,
    ...(membershipId ? { membershipId } : {}),
    ...(chargeId ? { chargeId } : {}),
    ...(status ? { status } : {}),
  };
  return prisma.paymentReceipt.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { charge: { select: { id: true, period: true, concept: true } } },
  });
}

export async function getReceiptFileForActor({
  tenantId,
  actorRole,
  membershipId,
  receiptId,
}: {
  tenantId: string;
  actorRole: "ADMIN" | "RESIDENTE";
  membershipId: string | null;
  receiptId: string;
}) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const scope: Prisma.PaymentReceiptWhereInput =
    actorRole === "ADMIN"
      ? { id: receiptId, tenantId, status: { not: "WITHDRAWN" } }
      : { id: receiptId, tenantId, membershipId: membershipId ?? "__no-membership__", status: { not: "WITHDRAWN" } };
  const receipt = await prisma.paymentReceipt.findFirst({ where: scope });
  if (!receipt) throw new PaymentDomainError("RECEIPT_NOT_FOUND");
  assertStoragePathForTenant(receipt.storagePath, tenantId, ["comprobantes"]);
  const buffer = await downloadFromStorage(receipt.storagePath, { tenantId, folders: ["comprobantes"] });
  return { buffer, mimeType: receipt.mimeType, originalFileName: receipt.originalFileName };
}

// --- Notificaciones (best-effort, fuera de cualquier transaccion) --------

async function notifyReceiptUploaded({
  tenantId,
  receiptId,
  chargeConcept,
}: {
  tenantId: string;
  receiptId: string;
  chargeConcept: string;
}) {
  const admins = await prisma.tenantMembership.findMany({
    where: { tenantId, role: "ADMIN", isActive: true, user: { isActive: true } },
    select: { userId: true },
  });
  await Promise.allSettled(
    admins.map((admin) =>
      createNotificationIdempotent(
        {
          tenantId,
          userId: admin.userId,
          type: NotificationTypes.PAYMENT_RECEIPT_RECEIVED,
          title: "Nuevo comprobante de pago",
          message: `Se recibio un comprobante para revision (${chargeConcept}).`,
          resourceType: "PaymentReceipt",
          resourceId: receiptId,
          dedupeKey: `receipt:${receiptId}:uploaded:${admin.userId}`,
        },
        prisma
      ).catch(() => null)
    )
  );
}

async function getActiveResidentRecipient(membershipId: string) {
  const membership = await prisma.tenantMembership.findUnique({
    where: { id: membershipId },
    select: { userId: true, isActive: true, user: { select: { isActive: true, email: true, name: true } } },
  });
  if (!membership?.isActive || !membership.user.isActive) return null;
  return membership;
}

async function notifyReceiptReviewed(receipt: {
  id: string;
  tenantId: string;
  membershipId: string;
  status: ReceiptStatus;
  rejectionReason: string | null;
}) {
  const membership = await getActiveResidentRecipient(receipt.membershipId);
  if (!membership) return;
  const approved = receipt.status === "APPROVED";

  await createNotificationIdempotent(
    {
      tenantId: receipt.tenantId,
      userId: membership.userId,
      type: approved ? NotificationTypes.PAYMENT_RECEIPT_APPROVED : NotificationTypes.PAYMENT_RECEIPT_REJECTED,
      title: approved ? "Comprobante aprobado" : "Comprobante rechazado",
      message: approved ? "Tu comprobante de pago fue aprobado." : "Tu comprobante de pago fue rechazado.",
      resourceType: "PaymentReceipt",
      resourceId: receipt.id,
      dedupeKey: `receipt:${receipt.id}:reviewed:${receipt.status}`,
    },
    prisma
  ).catch(() => null);

  if (!membership.user.email) return;
  const safeName = escapePaymentHtml(membership.user.name);
  await sendEmailSafe({
    tenantId: receipt.tenantId,
    to: membership.user.email,
    template: approved ? "payment_receipt_approved" : "payment_receipt_rejected",
    subject: approved ? "Tu comprobante de pago fue aprobado" : "Tu comprobante de pago fue rechazado",
    html: renderEmailLayout({
      accent: approved ? "success" : "danger",
      eyebrow: "Pagos",
      heading: approved ? "Comprobante aprobado" : "Comprobante rechazado",
      bodyHtml: `
        <p>Hola <strong>${safeName}</strong>,</p>
        <p>Tu comprobante de pago fue ${approved ? "aprobado" : "rechazado"}.</p>
        ${!approved && receipt.rejectionReason ? `<p>Motivo: ${escapePaymentHtml(receipt.rejectionReason)}</p>` : ""}
      `,
    }),
  }).catch(() => null);
}

// --- Agregado (CONSEJO) --------------------------------------------------
// Solo conteos y sumas del tenant completo; nunca una fila identificable de
// unidad/residente. Pensado para el rol CONSEJO, que no tiene acceso a
// saldos ni comprobantes individuales en este modulo.

export async function getAggregateSummaryForTenant({ tenantId }: { tenantId: string }) {
  await assertTenantFeatureActive(tenantId, "RESIDENT_PAYMENTS");
  const [byStatus, pendingReceipts] = await Promise.all([
    prisma.residentCharge.groupBy({
      by: ["status"],
      where: { tenantId },
      _sum: { amountCents: true, paidCents: true },
      _count: { _all: true },
    }),
    prisma.paymentReceipt.count({ where: { tenantId, status: "PENDING" } }),
  ]);
  const totals = byStatus.reduce(
    (acc, entry) => {
      acc.totalCharges += entry._count._all;
      acc.totalAmountCents += entry._sum.amountCents || 0;
      acc.totalPaidCents += entry._sum.paidCents || 0;
      return acc;
    },
    { totalCharges: 0, totalAmountCents: 0, totalPaidCents: 0 }
  );
  return {
    byStatus: byStatus.map((entry) => ({
      status: entry.status,
      count: entry._count._all,
      amountCents: entry._sum.amountCents || 0,
      paidCents: entry._sum.paidCents || 0,
    })),
    totals,
    pendingReceipts,
  };
}

export type { ReceiptMimeType };
