-- AlterTable
ALTER TABLE "Pqrs" ADD COLUMN "evidenciaArchivoUrl" TEXT,
ADD COLUMN "evidenciaArchivoPath" TEXT,
ADD COLUMN "evidenciaArchivoSize" INTEGER;

-- AlterTable
ALTER TABLE "PqrsFoto" ALTER COLUMN "data" DROP NOT NULL,
ADD COLUMN "url" TEXT,
ADD COLUMN "storagePath" TEXT,
ADD COLUMN "size" INTEGER;