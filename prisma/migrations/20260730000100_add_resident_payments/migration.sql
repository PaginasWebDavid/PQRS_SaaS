-- Fase 9A: pagos de residentes (cuotas, importacion Excel, comprobantes).
-- Migracion aditiva; no toca datos ni columnas existentes. No tiene relacion
-- con el billing del SaaS (Payment/Subscription/WebhookEvent), que sigue
-- intacto.

-- Nuevos valores de auditoria para el modulo de pagos de residentes.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_IMPORT_BATCH_COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESIDENT_CHARGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESIDENT_CHARGE_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIPT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIPT_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIPT_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECEIPT_WITHDRAWN';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESIDENT_PAYMENT_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESIDENT_PAYMENT_REVERSED';

CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID', 'CANCELLED');
CREATE TYPE "ChargeSource" AS ENUM ('MANUAL', 'IMPORT');
CREATE TYPE "ReceiptStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE "ResidentPaymentStatus" AS ENUM ('CONFIRMED', 'REVERSED');
CREATE TYPE "PaymentSource" AS ENUM ('MANUAL', 'RECEIPT_APPROVAL');
CREATE TYPE "ImportBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "PaymentImportBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" "ImportBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "PaymentImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResidentUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bloque" INTEGER NOT NULL,
    "apto" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResidentUnit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResidentCharge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "concept" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "source" "ChargeSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResidentCharge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResidentPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "status" "ResidentPaymentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "PaymentSource" NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    "receiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResidentPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "declaredAmountCents" INTEGER,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResidentUnit_tenantId_bloque_apto_key" ON "ResidentUnit"("tenantId", "bloque", "apto");
CREATE INDEX "ResidentUnit_tenantId_idx" ON "ResidentUnit"("tenantId");

CREATE UNIQUE INDEX "ResidentCharge_tenantId_unitId_period_concept_key" ON "ResidentCharge"("tenantId", "unitId", "period", "concept");
CREATE INDEX "ResidentCharge_tenantId_period_idx" ON "ResidentCharge"("tenantId", "period");
CREATE INDEX "ResidentCharge_tenantId_unitId_idx" ON "ResidentCharge"("tenantId", "unitId");
CREATE INDEX "ResidentCharge_tenantId_status_idx" ON "ResidentCharge"("tenantId", "status");
CREATE INDEX "ResidentCharge_importBatchId_idx" ON "ResidentCharge"("importBatchId");

CREATE UNIQUE INDEX "ResidentPayment_receiptId_key" ON "ResidentPayment"("receiptId");
CREATE INDEX "ResidentPayment_tenantId_unitId_idx" ON "ResidentPayment"("tenantId", "unitId");
CREATE INDEX "ResidentPayment_tenantId_chargeId_idx" ON "ResidentPayment"("tenantId", "chargeId");
CREATE INDEX "ResidentPayment_tenantId_status_idx" ON "ResidentPayment"("tenantId", "status");

CREATE INDEX "PaymentReceipt_tenantId_status_idx" ON "PaymentReceipt"("tenantId", "status");
CREATE INDEX "PaymentReceipt_tenantId_membershipId_idx" ON "PaymentReceipt"("tenantId", "membershipId");
CREATE INDEX "PaymentReceipt_chargeId_idx" ON "PaymentReceipt"("chargeId");

CREATE INDEX "PaymentImportBatch_tenantId_createdAt_idx" ON "PaymentImportBatch"("tenantId", "createdAt");
CREATE INDEX "PaymentImportBatch_tenantId_status_idx" ON "PaymentImportBatch"("tenantId", "status");

ALTER TABLE "PaymentImportBatch" ADD CONSTRAINT "PaymentImportBatch_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentImportBatch" ADD CONSTRAINT "PaymentImportBatch_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ResidentUnit" ADD CONSTRAINT "ResidentUnit_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ResidentCharge" ADD CONSTRAINT "ResidentCharge_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResidentCharge" ADD CONSTRAINT "ResidentCharge_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "ResidentUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResidentCharge" ADD CONSTRAINT "ResidentCharge_importBatchId_fkey"
FOREIGN KEY ("importBatchId") REFERENCES "PaymentImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResidentCharge" ADD CONSTRAINT "ResidentCharge_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ResidentPayment" ADD CONSTRAINT "ResidentPayment_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResidentPayment" ADD CONSTRAINT "ResidentPayment_chargeId_fkey"
FOREIGN KEY ("chargeId") REFERENCES "ResidentCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResidentPayment" ADD CONSTRAINT "ResidentPayment_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "ResidentUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResidentPayment" ADD CONSTRAINT "ResidentPayment_recordedByUserId_fkey"
FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ResidentPayment" ADD CONSTRAINT "ResidentPayment_reversedByUserId_fkey"
FOREIGN KEY ("reversedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ResidentPayment" ADD CONSTRAINT "ResidentPayment_receiptId_fkey"
FOREIGN KEY ("receiptId") REFERENCES "PaymentReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_chargeId_fkey"
FOREIGN KEY ("chargeId") REFERENCES "ResidentCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_uploadedByUserId_fkey"
FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nota de idempotencia de importacion: la unicidad real que impide duplicar
-- una obligacion (reintento del mismo archivo, o dos importaciones
-- concurrentes con una fila equivalente) es
-- ResidentCharge_tenantId_unitId_period_concept_key de arriba, combinada con
-- un advisory lock por tenant tomado al inicio del procesamiento del batch
-- (pg_advisory_xact_lock(hashtextextended('payment-import:<tenantId>', 0)),
-- ver resident-payment-import.service.ts). El upsert por esa clave unica
-- hace que una fila ya existente se cuente como duplicada en vez de
-- sobreescribir un monto/fecha potencialmente corregido a mano.
