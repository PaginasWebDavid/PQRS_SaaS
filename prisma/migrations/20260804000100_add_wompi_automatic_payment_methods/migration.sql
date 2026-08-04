-- Wompi conserva la fuente de pago; PQRS solo persiste el identificador del
-- proveedor y los datos publicos enmascarados necesarios para el cobro mensual.
CREATE TYPE "WompiPaymentEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE "WompiPaymentMethodType" AS ENUM ('CARD');
CREATE TYPE "WompiPaymentMethodStatus" AS ENUM ('ACTIVE', 'REVOCATION_PENDING', 'REVOKED');

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WOMPI_PAYMENT_METHOD_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WOMPI_PAYMENT_METHOD_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WOMPI_AUTOMATIC_CHARGE_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WOMPI_AUTOMATIC_CHARGE_FAILED';

CREATE TABLE "WompiPaymentMethod" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "environment" "WompiPaymentEnvironment" NOT NULL,
  "providerSourceId" INTEGER NOT NULL,
  "type" "WompiPaymentMethodType" NOT NULL,
  "status" "WompiPaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
  "customerEmail" TEXT NOT NULL,
  "brand" TEXT,
  "lastFour" TEXT,
  "expMonth" TEXT,
  "expYear" TEXT,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WompiPaymentMethod_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Payment" ADD COLUMN "wompiPaymentMethodId" TEXT;

CREATE UNIQUE INDEX "WompiPaymentMethod_environment_providerSourceId_key"
  ON "WompiPaymentMethod"("environment", "providerSourceId");
CREATE INDEX "WompiPaymentMethod_tenantId_status_idx"
  ON "WompiPaymentMethod"("tenantId", "status");
CREATE INDEX "WompiPaymentMethod_createdByUserId_idx"
  ON "WompiPaymentMethod"("createdByUserId");
CREATE INDEX "Payment_wompiPaymentMethodId_idx" ON "Payment"("wompiPaymentMethodId");

ALTER TABLE "WompiPaymentMethod"
  ADD CONSTRAINT "WompiPaymentMethod_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WompiPaymentMethod"
  ADD CONSTRAINT "WompiPaymentMethod_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_wompiPaymentMethodId_fkey"
  FOREIGN KEY ("wompiPaymentMethodId") REFERENCES "WompiPaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
