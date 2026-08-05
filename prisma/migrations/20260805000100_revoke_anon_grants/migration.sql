-- Quita los permisos de los roles `anon` y `authenticated` sobre el esquema public.
--
-- POR QUE: Supabase concede por defecto a esos dos roles todos los privilegios
-- sobre las tablas de public: 252 permisos cada uno, incluidos DELETE, UPDATE y
-- TRUNCATE. Los usa PostgREST, que esta aplicacion no utiliza (Prisma conecta
-- como `postgres` y el Storage usa la service role).
--
-- Activar RLS no cierra este hueco. Las politicas de RLS gobiernan filas:
-- SELECT, INSERT, UPDATE y DELETE. TRUNCATE es una operacion de tabla y NO
-- pasa por RLS: basta con tener el privilegio para vaciar una tabla protegida.
-- Es decir, quien obtuviera la llave anonima podria borrar toda la base aunque
-- las 35 tablas tengan RLS activo.
--
-- Hoy no es explotable: la llave anonima no esta publicada en el navegador, ni
-- en Vercel, ni en el codigo. Esto es prevencion: el dia que se agregue
-- cualquier funcionalidad de Supabase del lado del cliente, esa llave pasa a
-- ser publica por diseno y el hueco quedaria abierto sin que nadie lo note.
--
-- NO ROMPE LA APP: Prisma conecta con el rol `postgres`, que es dueno de las
-- tablas y tiene rolbypassrls. Estos REVOKE solo afectan a `anon` y
-- `authenticated`, que la aplicacion no usa en ningun punto.
--
-- ALTER DEFAULT PRIVILEGES cubre las tablas que aun no existen: sin esa parte,
-- la proxima migracion de Prisma crearia tablas nuevas con los permisos
-- concedidos otra vez y volveriamos al punto de partida en silencio.

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
