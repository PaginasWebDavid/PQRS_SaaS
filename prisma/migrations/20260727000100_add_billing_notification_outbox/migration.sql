-- CreateEnum
CREATE TYPE "BillingOutboxChannel" AS ENUM ('IN_APP', 'EMAIL');
CREATE TYPE "BillingOutboxEventType" AS ENUM ('BILLING_GRACE_STARTED', 'BILLING_SUSPENDED');
CREATE TYPE "BillingOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'DELIVERY_UNKNOWN');
CREATE TYPE "BillingOutboxAttemptStatus" AS ENUM ('STARTED', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'DELIVERY_UNKNOWN');

-- Extend EmailLog lifecycle without invalidating historical rows
ALTER TYPE "EmailLogStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "EmailLogStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "EmailLogStatus" ADD VALUE IF NOT EXISTS 'FAILED_RETRYABLE';
ALTER TYPE "EmailLogStatus" ADD VALUE IF NOT EXISTS 'FAILED_FINAL';
ALTER TYPE "EmailLogStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_UNKNOWN';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "dedupeKey" VARCHAR(255);

ALTER TABLE "EmailLog"
    ADD COLUMN "dedupeKey" VARCHAR(255),
    ADD COLUMN "outboxId" TEXT,
    ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
    ADD COLUMN "lastErrorCode" VARCHAR(255),
    ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "EmailLog" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "EmailLog" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "BillingNotificationOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "channel" "BillingOutboxChannel" NOT NULL,
    "eventType" "BillingOutboxEventType" NOT NULL,
    "dedupeKey" VARCHAR(255) NOT NULL,
    "status" "BillingOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "providerAttemptStartedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "lastErrorCode" VARCHAR(255),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingNotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingOutboxAttempt" (
    "id" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "BillingOutboxAttemptStatus" NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" VARCHAR(255),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BillingOutboxAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE UNIQUE INDEX "EmailLog_dedupeKey_key" ON "EmailLog"("dedupeKey");
CREATE UNIQUE INDEX "EmailLog_outboxId_key" ON "EmailLog"("outboxId");
CREATE UNIQUE INDEX "BillingNotificationOutbox_dedupeKey_key" ON "BillingNotificationOutbox"("dedupeKey");
CREATE INDEX "BillingOutbox_dispatch_idx" ON "BillingNotificationOutbox"("status", "nextAttemptAt", "createdAt", "id");
CREATE INDEX "BillingOutbox_tenant_idx" ON "BillingNotificationOutbox"("tenantId");
CREATE INDEX "BillingOutbox_subscription_idx" ON "BillingNotificationOutbox"("subscriptionId");
CREATE INDEX "BillingOutbox_recipient_idx" ON "BillingNotificationOutbox"("recipientUserId");
CREATE UNIQUE INDEX "BillingOutboxAttempt_outbox_attempt_key" ON "BillingOutboxAttempt"("outboxId", "attemptNumber");
CREATE INDEX "BillingOutboxAttempt_outbox_idx" ON "BillingOutboxAttempt"("outboxId");

-- AddForeignKey
ALTER TABLE "BillingNotificationOutbox" ADD CONSTRAINT "BillingOutbox_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingNotificationOutbox" ADD CONSTRAINT "BillingOutbox_subscription_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingNotificationOutbox" ADD CONSTRAINT "BillingOutbox_recipient_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BillingOutboxAttempt" ADD CONSTRAINT "BillingOutboxAttempt_outbox_fkey" FOREIGN KEY ("outboxId") REFERENCES "BillingNotificationOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "BillingNotificationOutbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;