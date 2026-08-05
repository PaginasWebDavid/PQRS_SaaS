-- Activa Row Level Security en todas las tablas del esquema public.
--
-- POR QUE: Supabase expone un API REST (PostgREST) sobre el esquema public.
-- Con RLS desactivado y sin politicas, cualquiera que obtenga la llave anonima
-- del proyecto podria leer las 36 tablas: usuarios, PQRS, pagos, auditoria.
-- Hoy la app no publica esa llave (solo usa SERVICE_ROLE en el servidor), pero
-- la llave anonima es publica por diseno y no es un secreto que controlemos.
-- Esto es defensa en profundidad: sin politicas, RLS niega todo por defecto.
--
-- POR QUE NO ROMPE LA APP: Prisma conecta con el rol `postgres`, que tiene
-- rolbypassrls = true (verificado contra la base real). Un rol con BYPASSRLS
-- ignora RLS siempre, asi que las consultas de la aplicacion no cambian.
-- Los roles `anon` y `authenticated` de PostgREST si quedan sin acceso.
--
-- Deliberadamente NO se crean politicas: el aislamiento entre conjuntos ya se
-- hace en la capa de aplicacion (tenantId en cada consulta). Duplicarlo aqui
-- crearia dos fuentes de verdad que pueden divergir.

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> '_prisma_migrations'
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target.relname);
  END LOOP;
END
$$;
