# Seguridad y aislamiento

La promesa central del producto: **un [[Conjunto]] nunca ve datos de otro.** Es tambien
la unica falla que acabaria con el negocio de un dia para otro.

## La regla

El identificador del conjunto sale **siempre de la sesion autenticada**, nunca de lo que
manda el navegador. El id del recurso viene de la URL, y el servicio cruza los dos.

Un [[Admin]] puede pedir operar sobre otro conjunto en la peticion: ese valor **se
descarta** y se usa el de su sesion. Solo el [[Super Admin]] puede apuntar a otro conjunto,
y eso pasa por su propia validacion.

Hay una prueba que recorre el arbol de rutas y **falla** si aparece una ruta nueva que no
respete esto. Cubre la ruta que se escriba con prisa dentro de seis meses.

## En la base de datos

RLS activo en todas las tablas. No lleva politicas a proposito: el aislamiento real vive
en la aplicacion, y duplicarlo en SQL crearia dos fuentes de verdad que pueden divergir.

Los roles `anon` y `authenticated` estan revocados. Importante: **`TRUNCATE` no pasa por
RLS**, asi que tener RLS activo no bastaba — con esos permisos, quien obtuviera la llave
publica podia vaciar la base entera.

## En los archivos

Bucket privado. Las rutas son `{conjunto}/{carpeta}/{archivo}` y se validan en cada
descarga. El tipo real del archivo se verifica por su contenido, no por la extension.

Relacionado: [[Documentos legales]]
Codigo: `src/lib/authorization.ts` · `tests/unit/api-tenant-scoping.test.ts`
