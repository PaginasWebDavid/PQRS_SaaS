-- Fase R1: cierre tecnico minimo para los primeros pilotos. Migracion aditiva;
-- no toca datos ni columnas existentes.

-- Bloqueante 1: notificaciones de pago del SaaS (outbox durable existente).
ALTER TYPE "BillingOutboxEventType" ADD VALUE IF NOT EXISTS 'SAAS_PAYMENT_APPROVED';
ALTER TYPE "BillingOutboxEventType" ADD VALUE IF NOT EXISTS 'SAAS_PAYMENT_REJECTED';

-- Bloqueante 2: plantilla de flujo PQRS por conjunto (SIMPLE/MAINTENANCE).
-- MAINTENANCE es el default de compatibilidad: todo conjunto y toda PQRS
-- existente conserva el comportamiento actual sin cambios.
CREATE TYPE "PqrsWorkflowType" AS ENUM ('SIMPLE', 'MAINTENANCE');

ALTER TABLE "Tenant" ADD COLUMN "pqrsWorkflowType" "PqrsWorkflowType" NOT NULL DEFAULT 'MAINTENANCE';

-- Snapshot inmutable por PQRS: se fija al crear y nunca se recalcula, para que
-- un cambio posterior de Tenant.pqrsWorkflowType nunca altere casos en curso.
ALTER TABLE "Pqrs" ADD COLUMN "workflowType" "PqrsWorkflowType" NOT NULL DEFAULT 'MAINTENANCE';

-- Bloqueante 3: categorias de soporte vigentes. Las categorias anteriores
-- (TECNICO/FACTURACION/CUENTA/OTRO) se conservan en el enum solo por
-- compatibilidad con tickets historicos; el codigo nuevo ya no las asigna.
ALTER TYPE "SupportTicketCategory" ADD VALUE IF NOT EXISTS 'TECHNICAL';
ALTER TYPE "SupportTicketCategory" ADD VALUE IF NOT EXISTS 'ACCESS';
ALTER TYPE "SupportTicketCategory" ADD VALUE IF NOT EXISTS 'PRIVACY_SECURITY';
ALTER TYPE "SupportTicketCategory" ADD VALUE IF NOT EXISTS 'BILLING';

-- Bloqueante 4 (exportacion/reactivacion) no requiere cambios de schema: reutiliza
-- Payment/Subscription/Tenant/Pqrs/TenantMembership existentes y AuditAction.REPORT_EXPORTED,
-- ya presente en el enum.
