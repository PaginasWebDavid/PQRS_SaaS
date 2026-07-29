# FASE R2B — Informe de revisión adversarial, corrección y commit

## 1. Defectos encontrados

Dos defectos acotados, ambos en flujos de alta sensibilidad explícitamente señalados por el prompt de revisión.

**D1 — Idempotencia semántica incompleta en `correctPqrs` (alto).** El lookup de `tenantId_operationId` solo comparaba `pqrsId`. Si el mismo `operationId` se reenviaba con un `body` distinto (otro `bloque`, otra `reason`, etc.) para la misma PQRS, el servicio devolvía silenciosamente el resultado de la *primera* corrección como si la segunda hubiera aplicado (`idempotent: true`, HTTP 200), sin aplicar los nuevos cambios y sin señal de conflicto. Un cliente que reintenta con datos corregidos podía creer que su corrección se aplicó cuando en realidad persistía la anterior.

**D2 — Referencia de Storage no recuperable tras un cleanup fallido (medio).** `withdrawPqrsFileEvidence` y `withdrawPqrsPhotoEvidence` capturaban el `storagePath` original solo en una variable de la transacción y lo perdían (columna puesta en `null`) en el mismo `update` que hacía el retiro lógico. Si `deleteFromStorage` fallaba después del commit, el error quedaba solo en un `console.error`; no había ninguna referencia durable y privada al objeto para reintentar la limpieza. Resultado: archivo huérfano en Storage sin forma de localizarlo.

No se encontraron defectos críticos, ni problemas de aislamiento multi-tenant, ni migraciones destructivas, ni pérdida de históricos, ni combinaciones workflow/fase/estado inválidas alcanzables. El resto de las 18 secciones de la guía de revisión se verificó por lectura de código y no arrojó hallazgos adicionales que ameritaran cambio.

## 2. Correcciones realizadas

**Para D1** (`src/domains/pqrs/pqrs-correction.service.ts`): se añadió `requestFingerprint(body)`, un hash SHA-256 determinista del payload (claves ordenadas, excluyendo `operationId`). Se agregó la columna `PqrsCorrection.requestHash` (nullable, aditiva). En el lookup de reintento: si `pqrsId` coincide pero el hash no, se lanza `CONFLICT` (409) en vez de devolver el resultado anterior como éxito idempotente. Si `pqrsId` y hash coinciden, el comportamiento idempotente original se conserva sin cambios.

**Para D2** (`src/domains/pqrs/pqrs-evidence.service.ts`): se añadieron columnas privadas `Pqrs.evidenciaArchivoRetiroStoragePath` y `PqrsFoto.retiroStoragePath`. En el mismo `update` que hace el retiro lógico, el `storagePath` original se mueve a esa columna privada (nunca seleccionada fuera de este servicio; confirmado por `grep` que ningún reporte, exportación o ruta de API la lee). `cleanupStorage` ahora recibe un callback `onCleaned` que limpia esa referencia únicamente si `deleteFromStorage` tiene éxito; si falla, la referencia permanece para un futuro reintento (manual u operativo), sin revertir el retiro lógico ya confirmado ni exponer el path en auditoría.

Ambos cambios están cubiertos por dos pruebas nuevas (48 y 49) y no alteraron el comportamiento de las 47 pruebas preexistentes de R2A.

## 3. Migración y compatibilidad legacy

Migración de R2A revisada línea por línea: aditiva, sin `DROP`, backfill idempotente (`ON CONFLICT ... DO NOTHING`), las ocho categorías canónicas se crean por tenant, los subtipos de humedad se preservan como snapshot con etiqueta legible, `workflowType` de PQRS existentes permanece en `MAINTENANCE` (no se recalcula desde la categoría asignada), categorías legacy desconocidas quedan tenant-scoped e inactivas. La unicidad `tenantId + canonicalKey` con `canonicalKey = null` en categorías personalizadas es válida en PostgreSQL (NULL no colisiona con NULL en un índice único) — confirmado con la prueba 15 (tres personalizadas simultáneas sin bloqueo espurio).

Se agregó una segunda migración aditiva (`20260802000100_pqrs_correction_hash_and_evidence_tombstone`) para D1/D2: dos columnas nuevas nullable en `Pqrs`/`PqrsFoto` y una en `PqrsCorrection`. Ninguna reescribe ni elimina datos existentes.

## 4. Categorías y concurrencia

El límite de tres personalizadas se aplica bajo `pg_advisory_xact_lock` con clave `tenant`-scoped dentro de una transacción `Serializable`; conflictos `P2034` se mapean a `409` sin filtrar detalle de Prisma/SQL. `updatePqrsCategory` permite renombrar una canónica sin volverla personalizada (no toca `isCustom`/`canonicalKey`). No existe ruta de borrado físico de categorías, solo `isActive`. El catálogo se auto-inicializa de forma idempotente en cada punto de entrada (lectura, creación, administración) bajo el mismo advisory lock, por lo que no depende de ningún flujo específico de alta de tenant — un fallo parcial de inicialización se autocorrige en la siguiente llamada.

## 5. Creación y snapshots

`POST /api/pqrs` bloquea explícitamente `tenantId`, `workflowType` y `categorySnapshot` en el body del cliente y deriva ambos valores de `resolvePqrsCategoryForCreation` en servidor. No se encontró otra vía productiva de creación de PQRS. Renombrar/desactivar una categoría o cambiar su workflow no altera `categorySnapshot`/`workflowType` de PQRS ya creadas (pruebas 7, 9, 10).

## 6. Correcciones e idempotencia

Cubierto en la sección 2 (D1). El resto de la validación de `correctPqrs` es sólida: whitelist estricta, motivo 10–500 caracteres, transacción única serializable, auditoría e historial coherentes con `changes` técnico (sin PII innecesaria), errores inesperados no mapeados devuelven 500 genérico.

## 7. Coherencia de workflow, fase y reapertura

`validateWorkflowPhase` se evalúa siempre sobre el estado final proyectado (workflow + fase + ruta ya combinados, incluyendo campos no tocados por la corrección actual), no campo por campo — confirmado leyendo el código y con la prueba 28 (cambiar solo `workflowType` a `SIMPLE` sobre una PQRS en fase 2/INSUMOS falla). La reapertura limpia `fechaCierre`/`tiempoRespuestaCierre` y pasa `estado` a `EN_PROGRESO`, mientras conserva el cierre anterior en `changes` (JSON) e `HistorialPqrs`; no hay borrado sin rastro.

## 8. Evidencias y cleanup

Cubierto en la sección 2 (D2). Concurrencia (dos retiros, retiro vs. descarga) queda cubierta por el gating existente en `evidenciaArchivoRetiradaAt`/`removedAt` en las rutas de lectura, no modificado en esta fase.

## 9. Aislamiento

Verificado por lectura y por la prueba 47 (smoke de dos tenants: catálogos, PQRS, evidencias, historial, reporte y exportación no se mezclan). Todas las escrituras exigen `TenantMembership` ADMIN activa además del rol de sesión.

## 10. Reportes y UI

`categorySnapshot` se usa como fuente preferida con fallback a `asunto` en dashboard, reportes y exportación (confirmado por lectura de `dashboard/route.ts`). UI de configuración (`admin/configuracion`) expone las ocho categorías, activar/desactivar, renombrar, orden, workflow y hasta tres personalizadas, consistente con el servicio.

## 11. Pruebas ejecutadas

- Archivo focalizado `tests/pqrs-category-correction-integration.test.ts`: **49/49** (47 originales + 2 nuevas).
- Suite completa (obligatoria por cambio de código productivo y de esquema): **733/733**.
- `npx prisma generate`, `npx prisma validate`, `npx tsc --noEmit`, `npm run lint`: todos aprobados (se corrigió una variable no usada detectada por lint).
- `git diff --cached --check`: sin errores tras limpiar dos líneas de espacio final preexistentes en `pqrs-category.service.ts`.

## 12. Riesgos restantes

- `PqrsCorrection.requestHash` es nullable por ser aditiva; no hay filas legacy que dependan de ella (la tabla es nueva en R2A).
- La limpieza física de Storage sigue siendo best-effort; D2 la hace *recuperable* (referencia durable) pero no agrega un job de reintento automático — eso queda fuera del alcance acotado de esta fase.
- Los riesgos ya documentados en el informe de R2A (campos legacy `asunto`/`subAsunto`/`tipoPqrs`/`Tenant.pqrsWorkflowType` pendientes de retiro futuro, ausencia de E2E de navegador, pruebas externas reales pendientes) se mantienen sin cambios.

## 13. Commit y hash

Commit `0440b41`: `feat(pqrs): add tenant categories and audited corrections`. Incluye todos los archivos de R2A, las dos correcciones de R2B (esquema, dos servicios, dos migraciones) y `docs/programa-mejora/16-generalizacion-pqrs-pilotos/`. Se excluyó explícitamente `docs/programa-mejora/14-reencuadre-comercial/` (módulo no relacionado, ya presente sin commitear). No se hizo push ni tags.

## 14. Resultado

`CORREGIDO Y COMMIT CREADO`
