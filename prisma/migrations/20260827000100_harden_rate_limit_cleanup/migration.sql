-- La limpieza global del limitador elimina por createdAt. Este indice evita que
-- un crecimiento de buckets distintos convierta la limpieza en un table scan.
CREATE INDEX "RateLimitHit_createdAt_idx" ON "RateLimitHit"("createdAt");
