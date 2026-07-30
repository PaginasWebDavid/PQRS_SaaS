-- C7B: additive commercial layer. Technical subscription state remains unchanged.
CREATE TYPE "PricingRuleType" AS ENUM ('MONTHLY', 'PILOT');
CREATE TYPE "PaymentConcept" AS ENUM ('PILOT', 'SUBSCRIPTION_MONTHLY', 'SUBSCRIPTION_ANNUAL', 'IMPLEMENTATION', 'COURTESY');
CREATE TYPE "CommercialStatus" AS ENUM ('LEGACY_REVIEW', 'PILOT_PENDING_PAYMENT', 'PILOT_PREPARATION', 'PILOT_ACTIVE', 'PILOT_EVALUATION', 'CONVERTED_MONTHLY', 'CONVERTED_ANNUAL', 'NOT_CONVERTED', 'CANCELLED');
CREATE TYPE "CommercialBillingMode" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "CommercialImplementationType" AS ENUM ('STANDARD', 'ASSISTED', 'FOUNDER_WAIVED');
CREATE TYPE "CommercialImplementationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'WAIVED');
CREATE TYPE "ReferralAgreementType" AS ENUM ('NONE', 'GENERAL', 'FOUNDER_EXCEPTION');
CREATE TYPE "ReferralCommissionStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING_CONVERSION', 'PENDING_PAYMENTS', 'ELIGIBLE', 'PAID', 'MANUAL_REVIEW', 'CANCELLED');
CREATE TYPE "TenantFeature" AS ENUM ('RESERVATIONS', 'RESIDENT_PAYMENTS');
CREATE TYPE "TenantFeatureStatus" AS ENUM ('DISABLED', 'SETUP', 'ACTIVE', 'SUSPENDED');

ALTER TYPE "PaymentProvider" ADD VALUE 'MANUAL_TRANSFER';
ALTER TYPE "AuditAction" ADD VALUE 'COMMERCIAL_PROFILE_CHANGED';
ALTER TYPE "AuditAction" ADD VALUE 'PILOT_PAYMENT_CONFIRMED';
ALTER TYPE "AuditAction" ADD VALUE 'PILOT_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'PILOT_EVALUATION_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'PILOT_CONVERTED';
ALTER TYPE "AuditAction" ADD VALUE 'TENANT_FEATURE_CHANGED';

ALTER TABLE "PricingRule" ADD COLUMN "type" "PricingRuleType" NOT NULL DEFAULT 'MONTHLY';
DROP INDEX IF EXISTS "PricingRule_isActive_idx";
DROP INDEX IF EXISTS "PricingRule_minUnits_maxUnits_idx";
CREATE INDEX "PricingRule_type_isActive_idx" ON "PricingRule"("type", "isActive");
CREATE INDEX "PricingRule_type_minUnits_maxUnits_idx" ON "PricingRule"("type", "minUnits", "maxUnits");

ALTER TABLE "Payment"
  ADD COLUMN "concept" "PaymentConcept" NOT NULL DEFAULT 'SUBSCRIPTION_MONTHLY',
  ADD COLUMN "listAmountCents" INTEGER,
  ADD COLUMN "discountBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "operationId" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "recordedByUserId" TEXT,
  ADD COLUMN "manualReference" TEXT;
UPDATE "Payment" SET "concept" = 'COURTESY' WHERE "provider" = 'COURTESY';
UPDATE "Payment" SET "listAmountCents" = "amountCents" WHERE "listAmountCents" IS NULL;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_discountBps_check" CHECK ("discountBps" BETWEEN 0 AND 10000);
CREATE UNIQUE INDEX "Payment_tenantId_operationId_key" ON "Payment"("tenantId", "operationId");
CREATE INDEX "Payment_tenantId_concept_status_idx" ON "Payment"("tenantId", "concept", "status");

CREATE TABLE "TenantCommercialProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "creationOperationId" TEXT,
  "creationRequestHash" VARCHAR(64),
  "commercialStatus" "CommercialStatus" NOT NULL DEFAULT 'LEGACY_REVIEW',
  "pilotPreparationStartsAt" TIMESTAMP(3), "pilotLaunchAt" TIMESTAMP(3), "pilotRealUseStartsAt" TIMESTAMP(3),
  "pilotEvaluationAt" TIMESTAMP(3), "decisionDueAt" TIMESTAMP(3), "pilotAccessEndsAt" TIMESTAMP(3),
  "pilotPriceCents" INTEGER, "postPilotListPriceCents" INTEGER, "postPilotContractPriceCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'COP', "nextAction" VARCHAR(250), "nextActionDueAt" TIMESTAMP(3),
  "billingMode" "CommercialBillingMode", "convertedAt" TIMESTAMP(3), "contractedPeriodEndsAt" TIMESTAMP(3),
  "isFounderCustomer" BOOLEAN NOT NULL DEFAULT false, "founderNumber" INTEGER, "founderGrantedAt" TIMESTAMP(3),
  "priceProtectedUntil" TIMESTAMP(3), "implementationFeeWaived" BOOLEAN NOT NULL DEFAULT false,
  "discountBps" INTEGER NOT NULL DEFAULT 0, "discountListPriceCents" INTEGER, "discountEffectivePriceCents" INTEGER,
  "discountReason" VARCHAR(500), "discountStartsAt" TIMESTAMP(3), "discountEndsAt" TIMESTAMP(3), "discountApprovedById" TEXT,
  "implementationType" "CommercialImplementationType" NOT NULL DEFAULT 'STANDARD',
  "implementationListFeeCents" INTEGER NOT NULL DEFAULT 0, "implementationEffectiveFeeCents" INTEGER NOT NULL DEFAULT 0,
  "implementationStatus" "CommercialImplementationStatus" NOT NULL DEFAULT 'PENDING',
  "implementationStartsAt" TIMESTAMP(3), "implementationCompletedAt" TIMESTAMP(3),
  "referralName" VARCHAR(160), "referralContact" VARCHAR(200),
  "referralAgreementType" "ReferralAgreementType" NOT NULL DEFAULT 'NONE',
  "commissionStatus" "ReferralCommissionStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  "commissionEligibleCents" INTEGER, "commissionEligibleAt" TIMESTAMP(3), "commissionPaidAt" TIMESTAMP(3),
  "commissionPaymentReference" VARCHAR(160),
  "documentsAcceptedAt" TIMESTAMP(3), "pilotPaymentConfirmedAt" TIMESTAMP(3), "residentBaseReceivedAt" TIMESTAMP(3),
  "categoriesConfiguredAt" TIMESTAMP(3), "administratorInvitedAt" TIMESTAMP(3), "trainingCompletedAt" TIMESTAMP(3),
  "smokeTestApprovedAt" TIMESTAMP(3), "launchCommunicationSentAt" TIMESTAMP(3), "launchExceptionReason" VARCHAR(500),
  "manualSupportMinutes" INTEGER NOT NULL DEFAULT 0, "manualOutsideRequests" INTEGER NOT NULL DEFAULT 0,
  "manualMeetings" INTEGER NOT NULL DEFAULT 0, "manualObjections" VARCHAR(1000), "qualitativeFeedback" VARCHAR(2000),
  "manualQuoteReason" VARCHAR(500), "manualQuoteApprovedById" TEXT, "manualQuoteApprovedAt" TIMESTAMP(3),
  "commercialNotes" VARCHAR(2000), "primaryAdminName" VARCHAR(120), "primaryAdminEmail" VARCHAR(320),
  "primaryAdminPhone" VARCHAR(30), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantCommercialProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantCommercialProfile_discountBps_check" CHECK ("discountBps" BETWEEN 0 AND 500),
  CONSTRAINT "TenantCommercialProfile_founderNumber_check" CHECK ("founderNumber" IS NULL OR "founderNumber" BETWEEN 1 AND 10),
  CONSTRAINT "TenantCommercialProfile_nonnegative_metrics_check" CHECK ("manualSupportMinutes" >= 0 AND "manualOutsideRequests" >= 0 AND "manualMeetings" >= 0)
);
CREATE UNIQUE INDEX "TenantCommercialProfile_tenantId_key" ON "TenantCommercialProfile"("tenantId");
CREATE UNIQUE INDEX "TenantCommercialProfile_creationOperationId_key" ON "TenantCommercialProfile"("creationOperationId");
CREATE UNIQUE INDEX "TenantCommercialProfile_founderNumber_key" ON "TenantCommercialProfile"("founderNumber");
CREATE INDEX "TenantCommercialProfile_commercialStatus_idx" ON "TenantCommercialProfile"("commercialStatus");
CREATE INDEX "TenantCommercialProfile_decisionDueAt_idx" ON "TenantCommercialProfile"("decisionDueAt");
CREATE INDEX "TenantCommercialProfile_commissionStatus_idx" ON "TenantCommercialProfile"("commissionStatus");
ALTER TABLE "TenantCommercialProfile" ADD CONSTRAINT "TenantCommercialProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TenantFeatureEntitlement" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "feature" "TenantFeature" NOT NULL,
  "status" "TenantFeatureStatus" NOT NULL DEFAULT 'DISABLED', "priceCents" INTEGER, "currency" TEXT NOT NULL DEFAULT 'COP',
  "effectiveAt" TIMESTAMP(3), "updatedById" TEXT, "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantFeatureEntitlement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantFeatureEntitlement_tenantId_feature_key" ON "TenantFeatureEntitlement"("tenantId", "feature");
CREATE INDEX "TenantFeatureEntitlement_tenantId_status_idx" ON "TenantFeatureEntitlement"("tenantId", "status");
CREATE INDEX "TenantFeatureEntitlement_feature_status_idx" ON "TenantFeatureEntitlement"("feature", "status");
ALTER TABLE "TenantFeatureEntitlement" ADD CONSTRAINT "TenantFeatureEntitlement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommercialOperation" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "operationId" TEXT NOT NULL,
  "action" VARCHAR(80) NOT NULL, "requestHash" VARCHAR(64) NOT NULL, "result" JSONB,
  "actorUserId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommercialOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommercialOperation_tenantId_operationId_key" ON "CommercialOperation"("tenantId", "operationId");
CREATE INDEX "CommercialOperation_tenantId_action_createdAt_idx" ON "CommercialOperation"("tenantId", "action", "createdAt");
ALTER TABLE "CommercialOperation" ADD CONSTRAINT "CommercialOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing tenants remain technically untouched and explicitly require commercial review.
INSERT INTO "TenantCommercialProfile" ("id", "tenantId", "commercialStatus", "currency", "createdAt", "updatedAt")
SELECT 'commercial_' || replace(gen_random_uuid()::text, '-', ''), t."id", 'LEGACY_REVIEW', COALESCE(s."currency", 'COP'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t LEFT JOIN "Subscription" s ON s."tenantId" = t."id"
ON CONFLICT ("tenantId") DO NOTHING;

-- Preserve existing module use: real rows imply ACTIVE; otherwise DISABLED.
INSERT INTO "TenantFeatureEntitlement" ("id", "tenantId", "feature", "status", "effectiveAt", "reason", "createdAt", "updatedAt")
SELECT 'ent_res_' || replace(gen_random_uuid()::text, '-', ''), t."id", 'RESERVATIONS',
  CASE WHEN EXISTS (SELECT 1 FROM "CommonArea" ca WHERE ca."tenantId" = t."id") OR EXISTS (SELECT 1 FROM "Reservation" r WHERE r."tenantId" = t."id") THEN 'ACTIVE'::"TenantFeatureStatus" ELSE 'DISABLED'::"TenantFeatureStatus" END,
  CURRENT_TIMESTAMP, 'Backfill C7B basado en existencia de zonas o reservas', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t ON CONFLICT ("tenantId", "feature") DO NOTHING;
INSERT INTO "TenantFeatureEntitlement" ("id", "tenantId", "feature", "status", "effectiveAt", "reason", "createdAt", "updatedAt")
SELECT 'ent_pay_' || replace(gen_random_uuid()::text, '-', ''), t."id", 'RESIDENT_PAYMENTS',
  CASE WHEN EXISTS (SELECT 1 FROM "ResidentCharge" c WHERE c."tenantId" = t."id") OR EXISTS (SELECT 1 FROM "ResidentPayment" p WHERE p."tenantId" = t."id") OR EXISTS (SELECT 1 FROM "PaymentReceipt" pr WHERE pr."tenantId" = t."id") THEN 'ACTIVE'::"TenantFeatureStatus" ELSE 'DISABLED'::"TenantFeatureStatus" END,
  CURRENT_TIMESTAMP, 'Backfill C7B basado en existencia de cargos, pagos o comprobantes', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t ON CONFLICT ("tenantId", "feature") DO NOTHING;

-- Historical pricing remains queryable but cannot affect new commercial quotes.
UPDATE "PricingRule" SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "isActive" = true;
INSERT INTO "PricingRule" ("id", "type", "minUnits", "maxUnits", "priceCents", "currency", "isActive", "createdAt", "updatedAt") VALUES
('pricing_monthly_1_100_c7b', 'MONTHLY', 1, 100, 11900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pricing_monthly_101_200_c7b', 'MONTHLY', 101, 200, 15900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pricing_monthly_201_400_c7b', 'MONTHLY', 201, 400, 19900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pricing_monthly_401_600_c7b', 'MONTHLY', 401, 600, 24900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pricing_pilot_1_200_c7b', 'PILOT', 1, 200, 9900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pricing_pilot_201_400_c7b', 'PILOT', 201, 400, 12900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('pricing_pilot_401_600_c7b', 'PILOT', 401, 600, 15900000, 'COP', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO UPDATE SET "priceCents" = EXCLUDED."priceCents", "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;
