# FASE 4A - Respuesta de auditoria y correccion de seguridad en PQRS y evidencias

## 1. Estado inicial

- HEAD inicial: `63b6020 feat(auth): centralize tenant authorization`.
- El indice estaba limpio y no habia cambios staged.
- La revision se limito a PQRS, detalle, respuestas operativas, estados, fotos, evidencias y Storage.
- No se modificaron entorno, schema, migraciones, paquetes, billing ni la base de autorizacion de Fase 3.

## 2. Archivos inspeccionados

- `src/app/api/pqrs/route.ts`
- `src/app/api/pqrs/[id]/route.ts`
- `src/app/api/pqrs/[id]/evidencia/route.ts`
- `src/app/api/pqrs/[id]/fotos/[fotoId]/route.ts`
- `src/app/api/upload/route.ts`
- `src/domains/pqrs/pqrs-permissions.ts`
- `src/domains/pqrs/resident-view.ts`
- `src/lib/storage.ts`
- Payloads relacionados en las vistas de ADMIN, CONSEJO y RESIDENTE.
- Modelos Prisma relacionados, solo para lectura.
- Pruebas existentes relacionadas con PQRS y aislamiento.

## 3. Matriz de permisos resultante

| Rol | Listar/ver | Crear | Editar descripcion propia | Gestionar estado/notas | Descargar archivos | Eliminar archivos |
| --- | --- | --- | --- | --- | --- | --- |
| `SUPER_ADMIN` | No | No | No | No | No | No |
| `ADMIN` | Solo su conjunto | Si | Si | Si | Solo su conjunto | Si |
| `CONSEJO` | Solo su conjunto | No | No | No | Solo su conjunto | No |
| `RESIDENTE` | Solo propias | Si | Solo antes de toma administrativa | No | Solo de sus PQRS | No |

El conjunto y propietario efectivos se obtienen de la sesion y de filtros de base de datos, no del cuerpo enviado por el cliente.

## 4. Vulnerabilidades encontradas

- Respuestas distintas para una PQRS inexistente y una PQRS ajena, permitiendo inferir IDs.
- Consultas y mutaciones de recursos secundarios sin combinar siempre `id`, `tenantId`, PQRS padre y propietario.
- Actualizaciones por `id` sin alcance multi-tenant en operaciones internas.
- Ruta generica de carga capaz de crear objetos sin recurso autorizado asociado.
- URLs publicas almacenadas para fotos o evidencias de PQRS.
- Validacion insuficiente de nombre, extension, firma real, tamano y ruta del archivo.
- Falta de endpoints seguros para descargar y eliminar archivos.
- Posibles objetos huerfanos ante fallos parciales entre Storage y base de datos.
- Contenido de usuario interpolado en correos HTML sin escape consistente.
- Errores historicos sobredimensionados que podian filtrar detalles internos.

## 5. Correcciones implementadas

- Se centralizaron roles, scopes, validacion de payloads, archivos, nombres y errores publicos en `pqrs-security.ts`.
- Todos los recursos PQRS se consultan con tenant y, para RESIDENTE, con propietario.
- Las mutaciones sensibles usan filtros multi-tenant y verificaciones de estado.
- Las respuestas cross-tenant, cross-owner e inexistentes son opacas.
- Se limitaron y normalizaron descripcion, titulo, notas y campos de cierre.
- Se escaparon datos dinamicos antes de insertarlos en correos HTML.
- La carga generica quedo deshabilitada con `410`; los archivos solo se adjuntan desde una PQRS autorizada.

## 6. IDOR y aislamiento

- ADMIN y CONSEJO solo obtienen scopes de su conjunto.
- RESIDENTE siempre recibe un scope con `tenantId` y `creadoPorId`.
- La foto exige coincidencia de `fotoId`, `pqrsId`, tenant y propietario cuando aplica.
- La evidencia de cierre hereda el scope de la PQRS padre.
- Un ID conocido de otro conjunto o usuario produce el mismo `404` generico que un ID inexistente.

## 7. Creacion y PATCH

- Solo ADMIN y RESIDENTE pueden crear PQRS.
- El cliente no puede imponer tenant ni propietario.
- Solo ADMIN puede registrar primer contacto, asignacion, fases, notas y cierre.
- CONSEJO mantiene lectura estricta.
- RESIDENTE solo puede modificar la descripcion de su propia PQRS antes de que la administracion la tome.
- El control de toma administrativa y el PATCH restringido se aplican en backend.

## 8. Comentarios y respuestas

No existe un modelo independiente de comentarios. Las respuestas operativas actuales son notas de primer contacto, notas de fase e historial. Solo ADMIN puede escribirlas; CONSEJO y RESIDENTE conservan lectura segun el alcance de la PQRS. Los textos tienen limites y no se aceptan campos administrativos adicionales desde RESIDENTE.

## 9. Evidencias y Storage

- Se validan MIME declarado, firma binaria, extension compatible, tamano y nombre.
- Se rechazan rutas absolutas, separadores, traversal y carpetas no autorizadas.
- Las rutas se construyen bajo el tenant y carpeta permitida.
- Fotos y evidencias nuevas guardan `url: null`; no se generan URLs publicas.
- La descarga pasa por endpoints autenticados y aplica permisos antes de consultar Storage.
- Solo ADMIN puede eliminar fotos o evidencia de cierre.
- En cargas parciales se compensan objetos ya creados.
- En reemplazos se actualiza primero la referencia autorizada y despues se intenta limpiar el objeto anterior.
- No se mantiene una transaccion de base de datos abierta durante llamadas de red a Storage.

## 10. Errores y auditoria

- Los errores inesperados devuelven mensajes genericos y no exponen stack, Prisma, SQL, constraints, host, URL ni secretos.
- Las eliminaciones registran actor, tenant, recurso y metadatos tecnicos minimos.
- No se registra contenido de evidencias, descripciones ni credenciales en auditoria.
- Los fallos de limpieza de Storage se registran en servidor sin filtrar detalles al cliente.

## 11. Archivos modificados

- `src/app/api/pqrs/route.ts`
- `src/app/api/pqrs/[id]/route.ts`
- `src/app/api/pqrs/[id]/evidencia/route.ts`
- `src/app/api/pqrs/[id]/fotos/[fotoId]/route.ts`
- `src/app/api/upload/route.ts`
- `src/domains/pqrs/pqrs-permissions.ts`
- `src/domains/pqrs/pqrs-security.ts`
- `src/lib/storage.ts`
- `tests/unit/pqrs-security.test.ts`
- `docs/programa-mejora/07-seguridad-pqrs-evidencias/01-prompt-codex-auditoria-correccion-pqrs.md`
- `docs/programa-mejora/07-seguridad-pqrs-evidencias/02-respuesta-codex-auditoria-correccion-pqrs.md`

## 12. Pruebas especificas

Comando:

```text
node --import tsx --test tests/unit/pqrs-security.test.ts
```

Resultado: 22 pruebas aprobadas, 0 fallidas y 0 omitidas. Cubren permisos por rol, scopes de tenant y propietario, PATCH de RESIDENTE, opacidad cross-tenant, notas, descarga/eliminacion, traversal, MIME, extension, tamano, errores publicos y camino valido.

La primera ejecucion no inicio pruebas por `spawn EPERM` del sandbox. La repeticion autorizada fuera de esa restriccion completo correctamente.

## 13. Typecheck y lint

- `npx tsc --noEmit`: aprobado.
- `npm run lint`: aprobado, sin warnings ni errores.
- `git diff --check`: aprobado; solo aparecen avisos informativos de conversion LF/CRLF de Git en Windows.

## 14. Riesgos restantes

- Debe verificarse en Supabase que el bucket usado por PQRS sea privado. El codigo ya no entrega URLs publicas, pero la politica remota no puede demostrarse solo desde el repositorio.
- No se implemento antivirus o escaneo de malware; los controles actuales son de tipo, firma, extension y tamano.
- No se ejecuto una prueba HTTP con PostgreSQL y Supabase reales por restriccion expresa de esta fase.
- Base de datos y Storage no comparten una transaccion distribuida. Hay compensacion y limpieza best-effort, pero un fallo adicional de red puede dejar un objeto huerfano que requeriria reconciliacion.
- Registros historicos pueden conservar URLs o datos base64 anteriores; su saneamiento requiere una migracion o cuarentena separada.
- Conviene agregar rate limiting y monitoreo a las descargas autenticadas antes de produccion.

Estos riesgos no bloquean el cierre del cambio local, pero la privacidad del bucket, las pruebas reales y el tratamiento de archivos historicos si bloquean una aprobacion definitiva para produccion.

## 15. Recomendacion para Claude

Revisar exclusivamente el diff de esta fase, con prioridad en filtros Prisma efectivos, opacidad `404`, orden de compensacion DB/Storage y ausencia de URLs publicas. Despues ejecutar pruebas HTTP de integracion con dos conjuntos, dos residentes y un bucket privado, incluyendo fallos inducidos de Storage y limpieza de objetos huerfanos.

## 16. Estado

`IMPLEMENTADO CON RIESGOS`

No se hizo commit, push ni tag.
