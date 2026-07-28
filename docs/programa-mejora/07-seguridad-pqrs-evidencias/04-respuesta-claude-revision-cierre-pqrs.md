# FASE 4B — Revisión, corrección y cierre de seguridad PQRS

## 1. Defectos encontrados

Ninguno de severidad crítica, alta o media. La revisión adversarial de PQRS, fotos, evidencias y Storage no encontró defecto explotable dentro del alcance. No se modificó código ni pruebas.

## 2. Correcciones

No aplican. No se cambió ningún archivo de código ni de pruebas.

## 3. Autorización e IDOR

- **Identidad de servidor:** todas las operaciones resuelven la identidad con `auth()` + `getTenantAccessResponse(session)` (capa común comprometida en Fase 3: revalida usuario activo, tenant/licencia y claims frescos) y `getTenantIdFromSession(session)`. La sesión se refresca desde DB en cada request (callback JWT), por lo que rol y tenant son actuales.
- **ADMIN:** solo su tenant (`pqrsResourceScopeForUser` → `{ id, tenantId }`; mutaciones `update/updateMany` con `where { id, tenantId }`).
- **CONSEJO:** solo lectura; el gate de escritura (`["ADMIN","RESIDENTE"].includes(role)`) lo bloquea con 403 y `canAdministerPqrs("CONSEJO") === false`. No hay ruta de escritura alcanzable.
- **RESIDENTE:** solo sus PQRS (`pqrsResourceScopeForUser` añade `creadoPorId`); PATCH solo edita `descripcion` de la propia y una sola vez (CAS `updateMany` con `editadoPorResidente:false`).
- **SUPER_ADMIN:** negado en todas las rutas (403 vía `getTenantAccessResponse`, 403 explícito en el listado y `pqrsScopeForUser` lanza). Se verificó que **negar es la política pre-existente** (test histórico `phase2-flows` 8b: "SUPER_ADMIN no opera PQRS"); no es una restricción inventada.
- **Tenant/propietario del cliente nunca conceden acceso:** `residentDescriptionPatch` descarta `tenantId`/`creadoPorId` del body; el tenant sale de la sesión.
- **Opacidad:** ID inexistente, cross-tenant y cross-owner producen el mismo `404 "PQRS no encontrada"` (el `findFirst` scoped devuelve `null`).
- **Herencia foto/evidencia:** la foto exige `{ id: fotoId, pqrsId, tenantId, (RESIDENTE: pqrs.creadoPorId) }`; la evidencia hereda `pqrsResourceScopeForUser` del PQRS padre.
- **Sin mutaciones por solo ID:** una búsqueda dirigida de `update/delete/updateMany/deleteMany/findUnique` con `where: { id }` de clave única no arrojó coincidencias en el alcance; todas incluyen `tenantId` (y `pqrsId`/`creadoPorId` donde aplica).

## 4. Upload genérico y consumidores

`POST /api/upload` responde `410` con mensaje genérico. Búsqueda global de `"/api/upload"` en `**/*.{ts,tsx,js,jsx}`: **sin consumidores**. El avatar usa su propia ruta `POST /api/me/avatar` (no `/api/upload`). Documentos, comprobantes u otros módulos no dependen de `/api/upload`. Por tanto el `410` **no rompe ningún flujo** y es aceptable.

## 5. Impacto de `storage.ts`

- Bucket y path **no** provienen del cliente: `buildStoragePath` valida `tenantId` y `objectId` (UUID) con regex y arma `tenantId/folder/objectId-nombre`; `folder` es un literal del servidor.
- Separación por tenant y carpeta: `assertStoragePathForTenant` exige 3 segmentos, `segments[0] === tenantId`, `folder` en whitelist, sin `%`, `\`, `\0` ni `..`.
- Nombres seguros: `sanitizeFileName`/`normalizeUploadFileName` bloquean traversal, rutas absolutas (`C:`), separadores y NUL; extensión coherente con MIME.
- MIME/firma/extensión/tamaño: `validatePqrsFile` + `matchesDeclaredType` (magic bytes PNG/JPEG/WEBP/PDF) + límite de bytes.
- Privacidad: las fotos y evidencias de PQRS guardan `url: null`; los bytes se sirven por rutas autenticadas que proxyean con la service-role key **en servidor** (nunca se entrega la clave ni una URL pública al cliente).
- **Consumidor ajeno (avatar):** `folder === "avatares"` conserva su URL pública legítima (`user.image`); la restricción de "sin URL pública" aplica solo a PQRS. El flujo de avatar **no se rompe**.
- La service-role key solo se usa en `fetch` de servidor (upload/download/delete); nunca se expone al cliente.

## 6. Archivos y compensación

- **Sin transacción DB abierta durante red:** subidas/descargas/borrados de Storage ocurren fuera de `prisma.$transaction`.
- **Creación:** las fotos se suben antes de la transacción; si la DB falla → `cleanupStoredFotos` (best-effort) y no queda referencia DB huérfana.
- **Cierre con evidencia:** se sube antes de la transacción; si la DB falla → se borra el objeto recién subido; si hay reemplazo, la **nueva referencia se confirma antes** de borrar la anterior (orden correcto).
- **Borrado de evidencia/foto:** se limpia primero la referencia DB (scoped, con verificación de `count`) y luego el objeto (best-effort); un fallo de limpieza se registra en servidor sin exponerse.
- **Borrado acotado:** `deleteFromStorage` valida el path contra tenant/carpeta y el path proviene de DB, no del cliente → no se pueden borrar paths arbitrarios.

## 7. Emails y errores

- Contenido dinámico de texto libre (título, nombre, descripción, notas, acción, evidencia) escapado con `escapePqrsHtml` antes del HTML. Los valores no escapados son numéricos (`numero`, `bloque`, `apto`) o de whitelist (`asunto`, `numeroRadicacion`), no controlables como texto libre → sin XSS.
- Errores inesperados devuelven mensajes genéricos por ruta (`500` "No se pudo …"); no se exponen Prisma, SQL, path, bucket, host ni secretos (los `detail` de Storage se colapsan a mensaje genérico en el `catch` de ruta).
- Auditoría: metadatos técnicos mínimos (`numero`, `estado`, `fields`, `removed`); no se registran descripciones, archivos ni PII innecesaria.

## 8. Pruebas ejecutadas

No aplicó ejecución. No se modificó código ni pruebas; las 22 pruebas de `tests/unit/pqrs-security.test.ts` ya están verdes (según Fase 4A) y **ejercen la lógica real** (constructor de scope `pqrsResourceScopeForUser`, validador de path `assertStoragePathForTenant`, validador de archivo `validatePqrsFile`, sanitizadores de nombre y error). Cubren roles/propiedad, cross-tenant, tenant/propietario falsificados, PATCH protegido, notas, foto/evidencia padre, descarga, eliminación, traversal, MIME, firma, extensión, tamaño, nombre, error genérico y camino autorizado. No se repiten typecheck ni lint (ya verdes, sin cambios) conforme a la política de eficiencia.

## 9. Riesgos que bloquean producción

| Riesgo | Bloquea commit local | Bloquea producción |
| --- | --- | --- |
| Bucket privado no verificado en Supabase (el código ya no entrega URLs públicas de PQRS, pero la política remota no se prueba desde el repo) | No | Sí |
| Archivos históricos con `url`/base64 (`evidenciaArchivoData`, fotos heredadas) requieren migración/cuarentena | No | Sí (saneamiento previo) |
| Ausencia de antivirus/escaneo de malware (solo tipo/firma/extensión/tamaño) | No | Sí (recomendado antes de exponer descargas) |
| Falta de rate limiting/monitoreo en descargas autenticadas | No | Sí (recomendado) |
| Compensación DB/Storage best-effort (un fallo adicional de red puede dejar objeto huérfano) | No | No (requiere reconciliación ocasional) |
| Falta de prueba de integración real con Supabase + PostgreSQL (dos conjuntos, dos residentes, fallos inducidos) | No | Sí (validación previa a producción) |

Ninguno bloquea el commit local. La privacidad del bucket, el saneamiento de archivos históricos y la integración real sí condicionan la aprobación definitiva para producción.

## 10. Resultado

`APROBADO Y COMMIT CREADO`.

La implementación de Codex es sólida: autorización server-side y capa común, aislamiento por tenant y propietario, opacidad `404`, herencia de permisos en foto/evidencia, `/api/upload` sin consumidores válidos (`410` seguro), Storage privado con paths validados y sin URLs públicas de PQRS, compensación DB/Storage con orden correcto y sin transacción durante red, escape de HTML en correos y errores genéricos. No se modificó código ni pruebas; el commit local se crea en esta misma intervención. El hash se informa en la respuesta de la sesión.
