-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MERCADO_PAGO_SUBSCRIPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'MERCADO_PAGO_WEBHOOK_PROCESSED';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "mercadoPagoPreapprovalId" TEXT,
ADD COLUMN "mercadoPagoInitPoint" TEXT,
ADD COLUMN "mercadoPagoStatus" TEXT,
ADD COLUMN "lastWebhookAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "mercadoPagoPaymentId" TEXT,
ADD COLUMN "rawStatus" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_mercadoPagoPreapprovalId_key" ON "Subscription"("mercadoPagoPreapprovalId");
CREATE UNIQUE INDEX "Payment_mercadoPagoPaymentId_key" ON "Payment"("mercadoPagoPaymentId");
