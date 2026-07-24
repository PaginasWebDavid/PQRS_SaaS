-- Fase 1C/1E: idempotencia del efecto economico + cuarentena historica + ledger.
-- Migracion ADITIVA y reversible: agrega columnas nullable/default y una tabla nueva.
-- No elimina columnas, no cambia periodos/importes historicos, no asume que el
-- efecto de un pago historico haya sido aplicado.

-- 1. Marcador atomico de idempotencia del efecto economico en Payment.
--    NULL en todas las filas existentes.
ALTER TABLE "Payment" ADD COLUMN "approvedEffectAppliedAt" TIMESTAMP(3);

-- 2. Indicador de cuarentena de reconciliacion historica (default false).
--    Los pagos NUEVOS nacen en false y funcionan normalmente.
ALTER TABLE "Payment" ADD COLUMN "approvedEffectReconciliationRequired" BOOLEAN NOT NULL DEFAULT false;

-- 3. CUARENTENA HISTORICA (parte critica):
--    Todo pago MERCADO_PAGO + APPROVED que YA EXISTIA antes de esta migracion se
--    marca para reconciliacion manual. Asi el handler NUNCA reclama su efecto ni
--    extiende la licencia por un replay historico. NO se fija approvedEffectAppliedAt
--    (no se asume que el efecto se aplico) y NO se tocan periodStart/periodEnd/paidAt
--    ni importes. La reconciliacion posterior es manual y auditada.
UPDATE "Payment"
  SET "approvedEffectReconciliationRequired" = true
  WHERE "provider" = 'MERCADO_PAGO' AND "status" = 'APPROVED';

-- 4. Nueva accion de auditoria para la reconciliacion manual de pagos historicos.
--    ADD VALUE es aditivo; en PostgreSQL 12+ (Supabase es 15+) puede ejecutarse en la
--    migracion siempre que el nuevo valor no se use dentro de la misma transaccion.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECONCILED';

-- 5. Ledger de entregas de webhook.
CREATE TYPE "WebhookEventResult" AS ENUM (
  'RECEIVED',
  'PROCESSED',
  'DUPLICATE',
  'IGNORED',
  'FAILED',
  'ENTITY_NOT_FOUND',
  'UNSUPPORTED_TOPIC',
  'RECONCILIATION_REQUIRED'
);

CREATE TABLE "WebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "dataId" TEXT NOT NULL,
  "requestId" TEXT,
  "rawStatus" TEXT,
  "tenantId" TEXT,
  "subscriptionId" TEXT,
  "result" "WebhookEventResult" NOT NULL DEFAULT 'RECEIVED',
  "errorCode" TEXT,
  "metadata" JSONB,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookEvent_provider_topic_idx" ON "WebhookEvent"("provider", "topic");
CREATE INDEX "WebhookEvent_dataId_idx" ON "WebhookEvent"("dataId");
CREATE INDEX "WebhookEvent_tenantId_idx" ON "WebhookEvent"("tenantId");
CREATE INDEX "WebhookEvent_receivedAt_idx" ON "WebhookEvent"("receivedAt");

-- Rollback (manual, no aplicar en esta fase). NO es completamente simetrico:
--   -- Reversible directamente:
--   DROP TABLE "WebhookEvent";                    -- la tabla del ledger puede eliminarse
--   DROP TYPE "WebhookEventResult";               -- el tipo puede eliminarse UNA VEZ que la tabla ya no exista
--   ALTER TABLE "Payment" DROP COLUMN "approvedEffectReconciliationRequired";  -- columna nueva, eliminable
--   ALTER TABLE "Payment" DROP COLUMN "approvedEffectAppliedAt";               -- columna nueva, eliminable
--
--   -- NO reversible con un simple ALTER TYPE:
--   -- El valor de enum "AuditAction"."PAYMENT_RECONCILED" NO puede eliminarse con
--   -- "ALTER TYPE ... DROP VALUE" (PostgreSQL no lo soporta). En un rollback normal
--   -- se DEJA ese valor huerfano e inocuo (no afecta el funcionamiento; solo queda
--   -- un valor de enum sin uso). Retirarlo exigiria una migracion especial que
--   -- reconstruya el tipo "AuditAction" (crear tipo nuevo, migrar columnas, borrar el
--   -- viejo), operacion destructiva que NO debe ejecutarse automaticamente.
