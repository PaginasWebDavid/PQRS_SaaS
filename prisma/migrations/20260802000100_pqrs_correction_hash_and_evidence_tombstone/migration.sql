-- R2B: cierra dos brechas acotadas encontradas en la revision adversarial de R2A.
-- Aditiva; no elimina ni transforma datos existentes.

-- 1) Huella del payload de correccion para distinguir un reintento legitimo del
--    mismo operationId (idempotente) de un reuso con datos distintos (conflicto).
ALTER TABLE "PqrsCorrection" ADD COLUMN "requestHash" TEXT;

-- 2) Referencia privada y durable del objeto de Storage retirado, para poder
--    reintentar la limpieza fisica si el primer intento falla. Nunca se expone
--    en AuditLog, exportaciones ni respuestas de API; solo la lee el servicio
--    de retiro de evidencias.
ALTER TABLE "Pqrs" ADD COLUMN "evidenciaArchivoRetiroStoragePath" TEXT;
ALTER TABLE "PqrsFoto" ADD COLUMN "retiroStoragePath" TEXT;
