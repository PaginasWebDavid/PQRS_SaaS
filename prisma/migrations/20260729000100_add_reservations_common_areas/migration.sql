-- Fase 8A: reservas y zonas comunes. Migracion aditiva; no toca datos ni
-- columnas existentes.

-- Nuevos valores de auditoria para reservas/zonas.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESERVATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESERVATION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESERVATION_REJECTED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'RESERVATION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMON_AREA_CREATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMON_AREA_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMMON_AREA_BLOCK_CREATED';

CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "CommonArea" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "minDurationMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxDurationMinutes" INTEGER NOT NULL DEFAULT 120,
    "maxReservationsPerWeek" INTEGER NOT NULL DEFAULT 2,
    "openingTime" TEXT NOT NULL,
    "closingTime" TEXT NOT NULL,
    "blockedWeekdays" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "rules" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommonArea_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commonAreaId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CommonAreaBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "commonAreaId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommonAreaBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommonArea_tenantId_name_key" ON "CommonArea"("tenantId", "name");
CREATE INDEX "CommonArea_tenantId_isActive_idx" ON "CommonArea"("tenantId", "isActive");

CREATE INDEX "Reservation_tenantId_commonAreaId_status_startAt_idx" ON "Reservation"("tenantId", "commonAreaId", "status", "startAt");
CREATE INDEX "Reservation_tenantId_membershipId_status_idx" ON "Reservation"("tenantId", "membershipId", "status");
CREATE INDEX "Reservation_commonAreaId_status_startAt_endAt_idx" ON "Reservation"("commonAreaId", "status", "startAt", "endAt");

CREATE INDEX "CommonAreaBlock_tenantId_commonAreaId_startAt_endAt_idx" ON "CommonAreaBlock"("tenantId", "commonAreaId", "startAt", "endAt");

ALTER TABLE "CommonArea" ADD CONSTRAINT "CommonArea_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_commonAreaId_fkey"
FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "TenantMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_reviewedByUserId_fkey"
FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_cancelledByUserId_fkey"
FOREIGN KEY ("cancelledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CommonAreaBlock" ADD CONSTRAINT "CommonAreaBlock_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommonAreaBlock" ADD CONSTRAINT "CommonAreaBlock_commonAreaId_fkey"
FOREIGN KEY ("commonAreaId") REFERENCES "CommonArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommonAreaBlock" ADD CONSTRAINT "CommonAreaBlock_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevencion de doble reserva a nivel de base de datos (no representable en
-- schema.prisma): un EXCLUDE constraint garantiza que ninguna reserva PENDING
-- u APPROVED pueda superponerse en el tiempo con otra PENDING/APPROVED de la
-- misma zona, incluso bajo dos inserciones concurrentes desde procesos
-- distintos. Usa semantica de intervalo semiabierto [startAt, endAt): una
-- reserva que termina a las 10:00 no colisiona con otra que empieza a las
-- 10:00. REJECTED y CANCELLED quedan fuera del filtro y no bloquean el
-- horario. Requiere la extension btree_gist para indexar la igualdad de
-- commonAreaId (texto) dentro de un indice GiST junto al rango de tiempo.
--
-- Se usa tsrange (timestamp SIN zona horaria), no tstzrange: las columnas
-- "startAt"/"endAt" son TIMESTAMP(3) sin tz porque asi mapea Prisma DateTime
-- por defecto, y Prisma siempre lee/escribe el valor numerico como el instante
-- UTC (sin conversion). Usar tstzrange forzaria un cast implicito segun el
-- `TimeZone` de la sesion de PostgreSQL, reintroduciendo exactamente la
-- ambiguedad de zona horaria del servidor que esta fase evita a proposito.
-- tsrange trata ambos valores como numeros puros, consistente con como la
-- aplicacion los trata (siempre UTC), sin ninguna conversion de por medio.
--
-- La aplicacion tambien re-verifica solapamiento antes de insertar para dar
-- un mensaje de error controlado; este constraint es la barrera autoritativa
-- de PostgreSQL y su violacion (SQLSTATE 23P01) se traduce a un error publico
-- "SLOT_UNAVAILABLE" en la capa de servicio.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_no_overlap_excl"
EXCLUDE USING gist (
  "commonAreaId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE ("status" IN ('PENDING', 'APPROVED'));
