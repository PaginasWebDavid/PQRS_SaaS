-- R2A: catalogo tenant-scoped, snapshots historicos, correcciones idempotentes
-- y retiro trazable de evidencias. La migracion es aditiva: asunto, subAsunto y
-- tipoPqrs permanecen para lectores legacy.

CREATE TABLE "PqrsCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "canonicalKey" TEXT,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "workflowType" "PqrsWorkflowType" NOT NULL DEFAULT 'SIMPLE',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PqrsCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PqrsCategory_tenantId_slug_key" ON "PqrsCategory"("tenantId", "slug");
CREATE UNIQUE INDEX "PqrsCategory_tenantId_canonicalKey_key" ON "PqrsCategory"("tenantId", "canonicalKey");
CREATE INDEX "PqrsCategory_tenantId_isActive_sortOrder_idx" ON "PqrsCategory"("tenantId", "isActive", "sortOrder");
ALTER TABLE "PqrsCategory" ADD CONSTRAINT "PqrsCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PqrsCategory" ADD CONSTRAINT "PqrsCategory_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Pqrs"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "categorySnapshot" TEXT,
  ADD COLUMN "evidenciaArchivoRetiradaAt" TIMESTAMP(3),
  ADD COLUMN "evidenciaArchivoRetiradaPorId" TEXT,
  ADD COLUMN "evidenciaArchivoRetiroMotivo" TEXT;

CREATE INDEX "Pqrs_tenantId_categoryId_idx" ON "Pqrs"("tenantId", "categoryId");
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PqrsCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_evidenciaArchivoRetiradaPorId_fkey" FOREIGN KEY ("evidenciaArchivoRetiradaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PqrsFoto"
  ADD COLUMN "removedAt" TIMESTAMP(3),
  ADD COLUMN "removedByUserId" TEXT,
  ADD COLUMN "removalReason" TEXT;
ALTER TABLE "PqrsFoto" ADD CONSTRAINT "PqrsFoto_removedByUserId_fkey" FOREIGN KEY ("removedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PqrsCorrection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "operationId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PqrsCorrection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PqrsCorrection_tenantId_operationId_key" ON "PqrsCorrection"("tenantId", "operationId");
CREATE INDEX "PqrsCorrection_tenantId_pqrsId_createdAt_idx" ON "PqrsCorrection"("tenantId", "pqrsId", "createdAt");
CREATE INDEX "PqrsCorrection_actorUserId_idx" ON "PqrsCorrection"("actorUserId");
ALTER TABLE "PqrsCorrection" ADD CONSTRAINT "PqrsCorrection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PqrsCorrection" ADD CONSTRAINT "PqrsCorrection_pqrsId_fkey" FOREIGN KEY ("pqrsId") REFERENCES "Pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PqrsCorrection" ADD CONSTRAINT "PqrsCorrection_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ocho categorias iniciales por tenant. Los IDs son deterministas para que el
-- backfill y una ejecucion idempotente puedan referenciarlos sin secuencias.
INSERT INTO "PqrsCategory" (
  "id", "tenantId", "canonicalKey", "slug", "displayName", "isActive",
  "isCustom", "sortOrder", "workflowType", "createdAt", "updatedAt"
)
SELECT
  'r2cat_' || md5(t."id" || ':' || seed.key),
  t."id", seed.key, seed.slug, seed.label, true, false, seed.position,
  seed.workflow::"PqrsWorkflowType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
CROSS JOIN (VALUES
  ('CONVIVENCIA', 'convivencia', 'Convivencia', 10, 'SIMPLE'),
  ('SEGURIDAD_VIGILANCIA', 'seguridad-vigilancia', 'Seguridad y vigilancia', 20, 'SIMPLE'),
  ('ACCESOS_CORRESPONDENCIA', 'accesos-correspondencia', 'Accesos y correspondencia', 30, 'SIMPLE'),
  ('MANTENIMIENTO', 'mantenimiento', 'Mantenimiento', 40, 'MAINTENANCE'),
  ('ZONAS_COMUNES', 'zonas-comunes', 'Zonas comunes', 50, 'MAINTENANCE'),
  ('CARTERA_PAGOS', 'cartera-pagos', 'Cartera y pagos', 60, 'SIMPLE'),
  ('ADMINISTRACION_CERTIFICADOS', 'administracion-certificados', 'Administracion y certificados', 70, 'SIMPLE'),
  ('OTROS', 'otros', 'Otros', 80, 'SIMPLE')
) AS seed(key, slug, label, position, workflow)
ON CONFLICT ("tenantId", "canonicalKey") DO NOTHING;

-- Valores historicos sin correspondencia segura se conservan como categorias
-- legacy inactivas tenant-scoped. No se ofrecen para nuevas PQRS.
INSERT INTO "PqrsCategory" (
  "id", "tenantId", "canonicalKey", "slug", "displayName", "isActive",
  "isCustom", "sortOrder", "workflowType", "createdAt", "updatedAt"
)
SELECT DISTINCT
  'r2legacy_' || md5(p."tenantId" || ':' || p."asunto"),
  p."tenantId", NULL, 'legacy-' || substr(md5(p."asunto"), 1, 16),
  p."asunto", false, false, 900, p."workflowType", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Pqrs" p
WHERE p."asunto" IS NOT NULL
  AND p."asunto" NOT IN (
    'CONVIVENCIA', 'CONTABILIDAD', 'AREA COMUN', 'AREA PRIVADA',
    'HUMEDAD/CUBIERTA', 'HUMEDAD/DEPOSITO', 'HUMEDAD/VENTANAS',
    'HUMEDAD/FACHADA', 'HUMEDAD/GARAJE'
  )
ON CONFLICT ("tenantId", "slug") DO NOTHING;

UPDATE "Pqrs" p
SET
  "categoryId" = CASE
    WHEN p."asunto" = 'CONVIVENCIA' THEN 'r2cat_' || md5(p."tenantId" || ':CONVIVENCIA')
    WHEN p."asunto" = 'CONTABILIDAD' THEN 'r2cat_' || md5(p."tenantId" || ':CARTERA_PAGOS')
    WHEN p."asunto" = 'AREA COMUN' THEN 'r2cat_' || md5(p."tenantId" || ':ZONAS_COMUNES')
    WHEN p."asunto" IN ('AREA PRIVADA', 'HUMEDAD/CUBIERTA', 'HUMEDAD/DEPOSITO', 'HUMEDAD/VENTANAS', 'HUMEDAD/FACHADA', 'HUMEDAD/GARAJE')
      THEN 'r2cat_' || md5(p."tenantId" || ':MANTENIMIENTO')
    WHEN p."asunto" IS NOT NULL THEN 'r2legacy_' || md5(p."tenantId" || ':' || p."asunto")
    ELSE NULL
  END,
  "categorySnapshot" = CASE p."asunto"
    WHEN 'AREA COMUN' THEN 'Area comun'
    WHEN 'AREA PRIVADA' THEN 'Area privada'
    WHEN 'CONTABILIDAD' THEN 'Contabilidad'
    WHEN 'CONVIVENCIA' THEN 'Convivencia'
    WHEN 'HUMEDAD/CUBIERTA' THEN 'Humedad - Cubierta'
    WHEN 'HUMEDAD/DEPOSITO' THEN 'Humedad - Deposito'
    WHEN 'HUMEDAD/VENTANAS' THEN 'Humedad - Ventanas'
    WHEN 'HUMEDAD/FACHADA' THEN 'Humedad - Fachada'
    WHEN 'HUMEDAD/GARAJE' THEN 'Humedad - Garaje'
    ELSE p."asunto"
  END
WHERE p."categoryId" IS NULL;