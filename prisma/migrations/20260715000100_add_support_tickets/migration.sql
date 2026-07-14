ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUPPORT_TICKET_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUPPORT_TICKET_RESPONDED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SUPPORT_TICKET_CLOSED';

CREATE TYPE "SupportTicketStatus" AS ENUM ('ABIERTA', 'RESPONDIDA', 'CERRADA');
CREATE TYPE "SupportTicketCategory" AS ENUM ('TECNICO', 'FACTURACION', 'CUENTA', 'OTRO');

CREATE TABLE "SupportTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "category" "SupportTicketCategory" NOT NULL DEFAULT 'OTRO',
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'ABIERTA',
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTicket_tenantId_idx" ON "SupportTicket"("tenantId");
CREATE INDEX "SupportTicket_status_idx" ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_createdByUserId_idx" ON "SupportTicket"("createdByUserId");

ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
