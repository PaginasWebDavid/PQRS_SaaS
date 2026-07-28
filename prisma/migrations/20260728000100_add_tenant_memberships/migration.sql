-- Fase 6A: membresias multi-conjunto. Esta migracion es deliberadamente
-- aditiva: las columnas tenant/rol legacy de User se retiran en una fase futura.
CREATE TABLE "TenantMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bloque" INTEGER,
    "apto" INTEGER,
    "haCorregidoUbicacion" BOOLEAN NOT NULL DEFAULT false,
    "bloqueAptoEditado" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "notifyNewPqrsEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TenantMembership_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TenantMembership_role_check" CHECK ("role" <> 'SUPER_ADMIN')
);

INSERT INTO "TenantMembership" (
    "id", "userId", "tenantId", "role", "isActive", "bloque", "apto",
    "haCorregidoUbicacion", "bloqueAptoEditado", "onboardingCompletedAt",
    "notifyNewPqrsEmail", "createdAt", "updatedAt"
)
SELECT
    'tm_' || md5(u."id" || ':' || u."tenantId"),
    u."id", u."tenantId", u."role", u."isActive", u."bloque", u."apto",
    u."haCorregidoUbicacion", u."bloqueAptoEditado", u."onboardingCompletedAt",
    u."notifyNewPqrsEmail", u."createdAt", CURRENT_TIMESTAMP
FROM "User" u
WHERE u."tenantId" IS NOT NULL AND u."role" <> 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "TenantMembership_userId_tenantId_key" ON "TenantMembership"("userId", "tenantId");
CREATE INDEX "TenantMembership_tenantId_role_idx" ON "TenantMembership"("tenantId", "role");
CREATE INDEX "TenantMembership_userId_isActive_idx" ON "TenantMembership"("userId", "isActive");
CREATE INDEX "TenantMembership_tenantId_isActive_idx" ON "TenantMembership"("tenantId", "isActive");
CREATE INDEX "TenantMembership_tenantId_bloque_apto_idx" ON "TenantMembership"("tenantId", "bloque", "apto");

ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantMembership" ADD CONSTRAINT "TenantMembership_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;