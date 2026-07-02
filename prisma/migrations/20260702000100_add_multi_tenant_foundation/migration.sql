-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ASISTENTE', 'CONSEJO', 'RESIDENTE');

-- CreateEnum
CREATE TYPE "Medio" AS ENUM ('PLATAFORMA_WEB');

-- CreateEnum
CREATE TYPE "TipoPqrs" AS ENUM ('PETICION', 'QUEJA', 'RECLAMO', 'SUGERENCIA');

-- CreateEnum
CREATE TYPE "Estado" AS ENUM ('EN_ESPERA', 'EN_PROGRESO', 'TERMINADO');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "units" INTEGER NOT NULL DEFAULT 0,
    "city" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RESIDENTE',
    "tenantId" TEXT NOT NULL,
    "bloque" INTEGER,
    "apto" INTEGER,
    "haCorregidoUbicacion" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pqrs" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "medio" "Medio" NOT NULL DEFAULT 'PLATAFORMA_WEB',
    "fechaRecibido" TIMESTAMP(3) NOT NULL,
    "mes" TEXT NOT NULL,
    "bloque" INTEGER NOT NULL,
    "apto" INTEGER NOT NULL,
    "nombreResidente" TEXT NOT NULL,
    "tipoPqrs" "TipoPqrs",
    "asunto" TEXT,
    "subAsunto" TEXT,
    "descripcion" TEXT NOT NULL,
    "numeroRadicacion" TEXT,
    "fechaPrimerContacto" TIMESTAMP(3),
    "tiempoRespuestaPrimerContacto" INTEGER,
    "notaPrimerContacto" TEXT,
    "accionTomada" TEXT,
    "estado" "Estado" NOT NULL DEFAULT 'EN_ESPERA',
    "evidenciaCierre" TEXT,
    "evidenciaArchivoData" TEXT,
    "evidenciaArchivoNombre" TEXT,
    "evidenciaArchivoTipo" TEXT,
    "fechaCierre" TIMESTAMP(3),
    "tiempoRespuestaCierre" INTEGER,
    "faseActual" INTEGER,
    "faseTipo" TEXT,
    "fase1Inicio" TIMESTAMP(3),
    "fase1Nota" TEXT,
    "fase2Inicio" TIMESTAMP(3),
    "fase2Nota" TEXT,
    "fase3Inicio" TIMESTAMP(3),
    "fase3Nota" TEXT,
    "fase4Inicio" TIMESTAMP(3),
    "fase4Nota" TEXT,
    "fase5Inicio" TIMESTAMP(3),
    "queSeHizoParaCerrar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creadoPorId" TEXT,
    "gestionadoPorId" TEXT,

    CONSTRAINT "Pqrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PqrsFoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PqrsFoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistorialPqrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pqrsId" TEXT NOT NULL,
    "estadoAntes" "Estado",
    "estadoDespues" "Estado" NOT NULL,
    "nota" TEXT,
    "creadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistorialPqrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_slug_idx" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Pqrs_numero_key" ON "Pqrs"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Pqrs_numeroRadicacion_key" ON "Pqrs"("numeroRadicacion");

-- CreateIndex
CREATE INDEX "Pqrs_tenantId_idx" ON "Pqrs"("tenantId");

-- CreateIndex
CREATE INDEX "Pqrs_tenantId_estado_idx" ON "Pqrs"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Pqrs_tenantId_fechaRecibido_idx" ON "Pqrs"("tenantId", "fechaRecibido");

-- CreateIndex
CREATE INDEX "PqrsFoto_tenantId_idx" ON "PqrsFoto"("tenantId");

-- CreateIndex
CREATE INDEX "PqrsFoto_pqrsId_idx" ON "PqrsFoto"("pqrsId");

-- CreateIndex
CREATE INDEX "HistorialPqrs_tenantId_idx" ON "HistorialPqrs"("tenantId");

-- CreateIndex
CREATE INDEX "HistorialPqrs_pqrsId_idx" ON "HistorialPqrs"("pqrsId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pqrs" ADD CONSTRAINT "Pqrs_gestionadoPorId_fkey" FOREIGN KEY ("gestionadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsFoto" ADD CONSTRAINT "PqrsFoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PqrsFoto" ADD CONSTRAINT "PqrsFoto_pqrsId_fkey" FOREIGN KEY ("pqrsId") REFERENCES "Pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialPqrs" ADD CONSTRAINT "HistorialPqrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistorialPqrs" ADD CONSTRAINT "HistorialPqrs_pqrsId_fkey" FOREIGN KEY ("pqrsId") REFERENCES "Pqrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
