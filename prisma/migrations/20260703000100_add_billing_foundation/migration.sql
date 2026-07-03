-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('SIMULATED', 'MERCADO_PAGO');

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBSCRIPTION_RENEWED';
ALTER TYPE "AuditAction" ADD VALUE 'PAYMENT_SIMULATED';

-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL,
    "minUnits" INTEGER NOT NULL,
    "maxUnits" INTEGER,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PricingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "unitsSnapshot" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "trialEndsAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL DEFAULT 'SIMULATED',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "externalReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PricingRule_isActive_idx" ON "PricingRule"("isActive");
CREATE INDEX "PricingRule_minUnits_maxUnits_idx" ON "PricingRule"("minUnits", "maxUnits");
CREATE UNIQUE INDEX "Subscription_tenantId_key" ON "Subscription"("tenantId");
CREATE INDEX "Subscription_tenantId_status_idx" ON "Subscription"("tenantId", "status");
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE INDEX "Payment_status_dueDate_idx" ON "Payment"("status", "dueDate");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default pricing rules.
INSERT INTO "PricingRule" ("id", "minUnits", "maxUnits", "priceCents", "currency", "isActive") VALUES
('pricing_1_50_default', 1, 50, 8000000, 'COP', true),
('pricing_51_100_default', 51, 100, 12000000, 'COP', true),
('pricing_101_200_default', 101, 200, 16000000, 'COP', true),
('pricing_201_plus_default', 201, NULL, 22000000, 'COP', true);

-- Backfill one active subscription and one simulated approved payment for existing tenants.
WITH tenant_prices AS (
  SELECT
    t."id" AS "tenantId",
    GREATEST(t."units", 1) AS "unitsSnapshot",
    COALESCE((
      SELECT pr."priceCents"
      FROM "PricingRule" pr
      WHERE pr."isActive" = true
        AND GREATEST(t."units", 1) >= pr."minUnits"
        AND (pr."maxUnits" IS NULL OR GREATEST(t."units", 1) <= pr."maxUnits")
      ORDER BY pr."minUnits" ASC
      LIMIT 1
    ), 8000000) AS "priceCents"
  FROM "Tenant" t
), inserted_subscriptions AS (
  INSERT INTO "Subscription" (
    "id", "tenantId", "status", "unitsSnapshot", "priceCents", "currency",
    "currentPeriodStart", "currentPeriodEnd", "trialEndsAt", "createdAt", "updatedAt"
  )
  SELECT
    'sub_' || replace(gen_random_uuid()::text, '-', ''),
    tp."tenantId",
    'ACTIVE'::"SubscriptionStatus",
    tp."unitsSnapshot",
    tp."priceCents",
    'COP',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP + INTERVAL '30 days',
    CURRENT_TIMESTAMP + INTERVAL '15 days',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM tenant_prices tp
  WHERE NOT EXISTS (
    SELECT 1 FROM "Subscription" s WHERE s."tenantId" = tp."tenantId"
  )
  RETURNING "id", "tenantId", "priceCents", "currency", "currentPeriodStart", "currentPeriodEnd"
)
INSERT INTO "Payment" (
  "id", "tenantId", "subscriptionId", "amountCents", "currency", "status", "provider",
  "dueDate", "paidAt", "periodStart", "periodEnd", "externalReference", "createdAt", "updatedAt"
)
SELECT
  'pay_' || replace(gen_random_uuid()::text, '-', ''),
  s."tenantId",
  s."id",
  s."priceCents",
  s."currency",
  'APPROVED'::"PaymentStatus",
  'SIMULATED'::"PaymentProvider",
  s."currentPeriodStart",
  CURRENT_TIMESTAMP,
  s."currentPeriodStart",
  s."currentPeriodEnd",
  'initial-simulated-payment',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM inserted_subscriptions s;
