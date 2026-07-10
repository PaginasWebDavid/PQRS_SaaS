-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_RESENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_ACCEPTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'INVITATION_EXPIRED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'NOTIFICATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_SENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'EMAIL_FAILED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PQRS_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PQRS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PQRS_CLOSED';
-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailLogStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "resourceType" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "resourceId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "origin" TEXT;

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "recipient" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'RESEND',
    "providerMessageId" TEXT,
    "status" "EmailLogStatus" NOT NULL,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_tenantId_idx" ON "Invitation"("tenantId");
CREATE INDEX "Invitation_tenantId_email_idx" ON "Invitation"("tenantId", "email");
CREATE INDEX "Invitation_tenantId_status_idx" ON "Invitation"("tenantId", "status");
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_idx" ON "Notification"("tenantId");
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_tenantId_userId_readAt_idx" ON "Notification"("tenantId", "userId", "readAt");
CREATE INDEX "Notification_resourceType_resourceId_idx" ON "Notification"("resourceType", "resourceId");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_tenantId_idx" ON "EmailLog"("tenantId");
CREATE INDEX "EmailLog_recipient_idx" ON "EmailLog"("recipient");
CREATE INDEX "EmailLog_template_idx" ON "EmailLog"("template");
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSetting_key_key" ON "PlatformSetting"("key");
CREATE INDEX "PlatformSetting_isSecret_idx" ON "PlatformSetting"("isSecret");
CREATE INDEX "PlatformSetting_updatedById_idx" ON "PlatformSetting"("updatedById");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformSetting" ADD CONSTRAINT "PlatformSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
