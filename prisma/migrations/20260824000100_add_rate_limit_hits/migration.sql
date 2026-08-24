-- Tabla de intentos para limitar fuerza bruta contra el login y abuso del
-- correo de recuperacion de contrasena.
--
-- POR QUE EN LA BASE Y NO EN MEMORIA: en Vercel cada invocacion puede caer en
-- una instancia distinta y las instancias se reciclan solas. Un contador en
-- memoria daria sensacion de proteccion y dejaria pasar casi todo el trafico
-- de un ataque real. Esta tabla es el unico estado compartido que ya existe.
--
-- CRECIMIENTO: cada fila es un intento, y las vencidas se borran en la misma
-- operacion que las cuenta (src/lib/rate-limit.ts). Ningun bucket crece sin
-- limite, asi que no hace falta un proceso de limpieza aparte.

CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- El indice compuesto sirve a las tres consultas del limitador (contar, borrar
-- vencidas y limpiar el bucket), todas filtradas por bucket.
CREATE INDEX "RateLimitHit_bucket_createdAt_idx" ON "RateLimitHit"("bucket", "createdAt");

-- Igual que el resto de tablas de public: RLS activo y sin politicas, para que
-- los roles anon y authenticated de PostgREST no puedan leerla ni vaciarla.
-- Prisma conecta como `postgres`, que tiene rolbypassrls, asi que la aplicacion
-- no se ve afectada. Los permisos de esos roles ya los cubre el
-- ALTER DEFAULT PRIVILEGES de la migracion 20260805000100.
ALTER TABLE "RateLimitHit" ENABLE ROW LEVEL SECURITY;
