-- Wompi Web Checkout stores the provider transaction id separately from the
-- merchant reference. The reference is created before the customer opens the
-- checkout; the transaction id only exists after Wompi creates it.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'WOMPI';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WOMPI_CHECKOUT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'WOMPI_WEBHOOK_PROCESSED';

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "wompiTransactionId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_wompiTransactionId_key"
  ON "Payment"("wompiTransactionId");
