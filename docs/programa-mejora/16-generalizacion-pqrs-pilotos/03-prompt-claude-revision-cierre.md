# FASE R2B — REVISIÓN ADVERSARIAL, CORRECCIÓN Y COMMIT

Guarda este prompt exacto en:

`docs/programa-mejora/16-generalizacion-pqrs-pilotos/03-prompt-claude-revision-cierre.md`

Guarda el informe final completo en:

`docs/programa-mejora/16-generalizacion-pqrs-pilotos/04-respuesta-claude-revision-cierre.md`

## Objetivo

Revisa adversarialmente la implementación R2A realizada por Codex:

1. categorías de PQRS configurables por tenant;
2. catálogo canónico y categorías personalizadas;
3. snapshot histórico de categoría y workflow;
4. corrección administrativa auditada;
5. reapertura y cambio controlado de fase;
6. retiro seguro de evidencias;
7. reportes, exportaciones y compatibilidad legacy;
8. aislamiento entre tenants.

No reabras otros módulos.

## Orden de trabajo

Claude actúa como revisor independiente.

* Si no encuentra defectos críticos, altos o medios: aprueba y crea el commit.
* Si encuentra defectos acotados:

  * corrígelos directamente;
  * añade o ajusta las pruebas necesarias;
  * ejecuta únicamente las pruebas afectadas;
  * ejecuta las validaciones finales una vez;
  * crea el commit cuando quede verde.
* Detente sin commit únicamente si encuentra:

  * migración destructiva o incorrecta;
  * pérdida potencial de históricos;
  * aislamiento multi-tenant roto;
  * correcciones que dejan estados financieros o PQRS incoherentes;
  * rediseño estructural amplio;
  * problema que no pueda validarse focalmente.

No inicies otra fase.

## Eficiencia

* No revises branch, HEAD ni historial al comenzar.
* Inspecciona solo el diff de R2A y dependencias directas.
* No repitas pruebas verdes si no modificas su código.
* No repitas automáticamente la suite integral.
* No reaudites autenticación, billing, reservas, pagos de residentes, soporte o cuenta global.
* No ejecutes pruebas después del commit.
* Informe final breve pero suficientemente preciso.

## Archivos principales

```text
prisma/schema.prisma
prisma/migrations/20260801000100_generalize_pqrs_categories/migration.sql

src/domains/pqrs/pqrs-category-policy.ts
src/domains/pqrs/pqrs-category.service.ts
src/domains/pqrs/pqrs-correction-policy.ts
src/domains/pqrs/pqrs-correction.service.ts
src/domains/pqrs/pqrs-evidence.service.ts
src/domains/pqrs/reportes.service.ts
src/domains/pqrs/resident-view.ts

src/domains/platform/tenant-admin.service.ts
src/domains/platform/tenant-export.service.ts

src/app/api/pqrs/route.ts
src/app/api/pqrs/[id]/route.ts
src/app/api/pqrs/[id]/corregir/route.ts
src/app/api/pqrs/[id]/evidencia/route.ts
src/app/api/pqrs/[id]/fotos/[fotoId]/route.ts
src/app/api/pqrs/categories/route.ts
src/app/api/tenant/pqrs-categories/route.ts

src/app/api/dashboard/route.ts
src/app/api/dashboard/excel/route.ts
src/app/api/reportes/route.ts
src/app/api/reportes/excel/route.ts
src/app/api/reportes/pdf/route.ts

src/app/admin/configuracion/page.tsx
src/app/admin/pqrs/page.tsx
src/app/admin/reportes/page.tsx
src/app/residente/page.tsx
src/app/consejo/page.tsx
src/app/consejo/reportes/page.tsx

tests/pqrs-category-correction-integration.test.ts
```

Lee además los documentos `01` y `02` de esta fase.

# 1. Migración y backfill

Revisa la migración SQL línea por línea.

Confirma:

* es aditiva;
* no elimina datos;
* no convierte valores ambiguos de manera destructiva;
* crea las ocho categorías para todos los tenants existentes;
* no duplica categorías al volver a ejecutarse;
* nuevos tenants reciben el catálogo por el flujo normal de creación;
* las categorías legacy desconocidas quedan tenant-scoped;
* los subtipos históricos de humedad no desaparecen;
* `categorySnapshot` conserva una etiqueta suficientemente fiel al caso histórico;
* `workflowType` de PQRS existentes mantiene `MAINTENANCE`;
* no se sobrescriben snapshots válidos al repetir la migración;
* las relaciones y foreign keys tienen comportamiento de borrado seguro.

## Unicidad nullable

Revisa específicamente:

```text
tenantId + canonicalKey
```

Las categorías personalizadas tienen `canonicalKey = null`.

Confirma que PostgreSQL permite varias categorías personalizadas por tenant sin que la restricción de unicidad nullable las bloquee, y que no se puede crear dos veces la misma categoría canónica.

## Categorías legacy

Confirma que un valor histórico no reconocido:

* no se transforma silenciosamente en `OTROS` perdiendo significado;
* sigue mostrando su etiqueta original;
* no aparece como opción activa para nuevas PQRS salvo decisión explícita;
* no colisiona con una categoría legacy del mismo nombre en otro tenant.

# 2. Inicialización de categorías

Verifica todos los caminos que crean tenants.

El catálogo debe inicializarse para:

* creación desde SUPER_ADMIN;
* cualquier seed o fixture real;
* onboarding, si crea tenants;
* futuras rutas válidas de alta.

La inicialización debe ser:

* idempotente;
* tenant-scoped;
* atómica o recuperable;
* sin dejar un tenant activo sin categorías por un fallo parcial.

Confirma qué ocurre si:

1. se crea el tenant;
2. falla la inicialización del catálogo;
3. el proceso se reintenta.

No debe producir catálogo incompleto o duplicado.

# 3. Autorización de categorías

Confirma en rutas y servicios:

* ADMIN configura solo su tenant seleccionado;
* RESIDENTE y CONSEJO no configuran;
* SUPER_ADMIN no usa tenant implícito;
* el cliente no impone tenant, creador, ID, slug o canonicalKey;
* una categoría cross-tenant es opaca;
* `includeInactive` no permite a RESIDENTE enumerar categorías históricas;
* una membresía inactiva no modifica el catálogo;
* cambiar de tenant no conserva IDs del tenant anterior.

No confíes únicamente en controles de UI.

# 4. Catálogo canónico y categorías personalizadas

Confirma:

* existen exactamente ocho categorías canónicas por tenant;
* una categoría canónica puede renombrarse, pero no convertirse en personalizada;
* una personalizada no suplanta una canonicalKey;
* máximo tres personalizadas;
* dos creaciones concurrentes no superan el límite;
* el advisory lock está dentro de la transacción;
* el identificador del lock incluye tenant;
* conflictos serializables se mapean sin filtrar Prisma o SQL;
* el slug generado es estable y sanitizado;
* nombres como rutas, controles, strings vacíos o valores excesivos se rechazan;
* mismo nombre o slug puede existir en tenants distintos.

Revisa si dos categorías del mismo tenant pueden terminar con el mismo nombre visible. Si se permite, documenta la decisión. Si genera ambigüedad real en formularios y reportes, aplica una validación mínima.

# 5. Snapshot de categoría y workflow

Confirma que una PQRS nueva obtiene desde el servidor:

```text
categoryId
categorySnapshot
workflowType
```

El cliente no debe imponer ninguno de los valores efectivos.

Revisa:

* creación por RESIDENTE;
* cualquier creación administrativa;
* seeds o servicios alternativos;
* pruebas;
* importaciones, si existiera alguna vía.

No debe quedar un camino productivo nuevo que cree PQRS sin categoría.

## Inmutabilidad histórica

Después de crear una PQRS:

* renombrar categoría no cambia su snapshot;
* desactivar categoría no la oculta;
* cambiar workflow de la categoría no cambia casos existentes;
* eliminar una categoría no debe dejar históricos ilegibles.

Si la eliminación física de categorías es posible, bloquéala o conviértela en desactivación.

# 6. Compatibilidad legacy

Confirma que:

* `asunto` y `subAsunto` siguen siendo fallback, no fuente principal para casos nuevos;
* la UI nueva envía `categoryId`;
* el endpoint transitorio de `asunto` no permite introducir nuevamente valores arbitrarios indefinidamente;
* reportes y notificaciones prefieren `categorySnapshot`;
* valores históricos específicos siguen visibles;
* filtros nuevos no hacen desaparecer PQRS antiguas con `categoryId = null`;
* exportación de salida conserva información histórica suficiente.

Determina si debe existir una fecha o condición clara para retirar la compatibilidad legacy. Solo documenta; no elimines campos en esta revisión.

# 7. Corrección administrativa

Revisa `POST /api/pqrs/[id]/corregir` como una operación de alta sensibilidad.

Confirma:

* solo ADMIN activo del tenant;
* PQRS tenant-scoped;
* whitelist estricta;
* motivo obligatorio;
* `operationId` obligatorio y válido;
* al menos un cambio real;
* validación completa antes de escribir;
* transacción única;
* auditoría e historial coherentes;
* errores inesperados genéricos.

## Idempotencia semántica

Mismo `tenantId + operationId`:

* debe devolver el resultado anterior o un resultado idempotente;
* no duplica historial;
* no duplica auditoría.

Pero si el mismo `operationId` se reutiliza con un payload diferente:

* no debe aplicar silenciosamente la segunda corrección;
* debe devolver conflicto controlado.

Verifica que exista una huella o comparación suficiente del contenido de la operación.

# 8. Coherencia entre workflow, ruta, fase y estado

Este es uno de los puntos críticos.

Construye la matriz real de invariantes:

## SIMPLE

Solo debe permitir fases compatibles con SIMPLE.

No puede tener:

* ruta INSUMOS;
* ruta PROVEEDOR;
* fase exclusiva de mantenimiento.

## MAINTENANCE

Debe respetar las fases existentes y la ruta correspondiente.

Confirma que una corrección no pueda dejar combinaciones como:

```text
workflow SIMPLE + fase de INSUMOS
workflow SIMPLE + fase de PROVEEDOR
workflow MAINTENANCE + fase que exige ruta pero ruta null
estado TERMINADO + fase no final
estado EN_PROGRESO + fase final sin reapertura explícita
```

Toda corrección múltiple debe validarse sobre el **estado final proyectado**, no campo por campo contra el estado anterior.

# 9. Reapertura

Revisa cuidadosamente la reapertura de una PQRS cerrada.

Debe conservar evidencia de que:

* fue cerrada;
* cuándo se cerró;
* quién la cerró;
* por qué se reabrió.

Pero el estado actual debe quedar coherente para:

* dashboard;
* tiempo de resolución;
* reportes;
* alertas;
* listados;
* notificaciones;
* nuevo cierre.

Determina qué ocurre con:

```text
fechaCierre
fechaFinalizacion
closedAt
estado
faseActual
```

Una PQRS reabierta no debe seguir apareciendo simultáneamente como cerrada en reportes operativos actuales.

Es válido:

* limpiar el campo operativo actual de cierre al reabrir;
* conservar el cierre anterior en `PqrsCorrection` e `HistorialPqrs`.

No es válido borrar el cierre anterior sin rastro.

Añade una prueba focalizada si esta coherencia no está demostrada.

# 10. Corrección de responsable

Confirma:

* el responsable pertenece al mismo tenant;
* tiene membresía activa;
* tiene rol permitido;
* una cuenta global activa;
* no se asigna por email o userId sin membership;
* cambiar responsable no modifica membresías;
* auditoría registra IDs técnicos mínimos, no PII innecesaria.

Revisa si CONSEJO puede ser responsable según la política anterior. No amplíes roles sin evidencia; conserva la política real.

# 11. Corrección de categoría y ubicación

## Categoría

* nueva categoría activa;
* mismo tenant;
* snapshot actualizado al nuevo nombre;
* workflow resultante coherente;
* no modifica el catálogo;
* no altera otras PQRS.

## Bloque y apartamento

* normalización correcta;
* valores permitidos;
* solo afecta la PQRS;
* no cambia `TenantMembership`;
* before/after suficientes;
* no filtra ubicación innecesariamente en AuditLog global.

# 12. Retiro de evidencias

Revisa tanto:

* evidencia principal;
* fotos.

Confirma:

* retiro lógico tenant-scoped;
* motivo obligatorio;
* actor y fecha;
* la fila permanece;
* descarga posterior bloqueada;
* URL legacy bloqueada;
* el cliente no envía path;
* auditoría no contiene path, URL o base64;
* storage cleanup ocurre después del commit;
* fallo Storage no revierte el retiro lógico.

## Recuperabilidad del cleanup

Codex reporta que se eliminan:

```text
contenido
URL
path accesible
```

antes del cleanup físico.

Revisa si, después de borrar `storagePath` de la fila, todavía queda una referencia durable y privada que permita:

* reintentar limpieza;
* reconciliar objetos huérfanos;
* saber qué objeto debe eliminarse.

Si el path se pierde completamente y el cleanup falla, existe un archivo huérfano irrecuperable.

Corrige de forma mínima si aplica. Opciones aceptables:

* conservar `storagePath` en la fila retirada y bloquear acceso por `retiredAt`;
* moverlo a un campo privado de tombstone;
* crear una tarea durable de cleanup.

No pongas el path en AuditLog ni en respuestas públicas.

## Concurrencia

Verifica:

* dos retiros simultáneos;
* retiro vs descarga;
* retiro vs nueva evidencia;
* retiro repetido.

No deben generar auditorías contradictorias ni borrar un archivo nuevo.

# 13. Reportes y exportaciones

Confirma:

* usan `categorySnapshot`;
* fallback legacy correcto;
* no mezclan tenants;
* categorías desactivadas siguen visibles en históricos;
* filtros por categoría no ocultan silenciosamente históricos legacy;
* agrupaciones no combinan categorías distintas solo porque fueron renombradas igual;
* la sanitización contra fórmulas XLSX implementada en R1B sigue activa;
* PDF y XLSX no exponen información de evidencia retirada.

No agregues reportes.

# 14. UI

Revisa únicamente fallos funcionales:

## ADMIN

* ve las ocho categorías;
* activa/desactiva;
* renombra;
* cambia orden;
* selecciona workflow;
* crea máximo tres personalizadas;
* entiende SIMPLE vs MAINTENANCE;
* puede corregir una PQRS;
* ve el motivo e historial;
* puede retirar evidencia sensible.

## RESIDENTE

* ve solo categorías activas;
* no puede falsificar workflow;
* al cambiar tenant, recarga catálogo;
* no puede descargar evidencia retirada.

## CONSEJO

* ve categorías históricas correctas;
* no configura;
* reportes mantienen snapshots.

No hagas rediseño visual.

# 15. Pruebas y suite

Codex reportó:

```text
Ejecución integral:
731 totales
728 aprobadas
3 fallidas por aserciones del archivo R2A

Después de corregir únicamente pruebas:
47/47 focales aprobadas
```

Las 728 pruebas preexistentes sí quedaron verdes sobre el código productivo final de R2A. No repitas la suite completa si:

* no modificas código productivo;
* confirmas que las tres correcciones fueron exclusivamente de aserciones;
* las pruebas focalizadas cubren correctamente el comportamiento.

Si modificas código productivo:

1. ejecuta las pruebas focalizadas de R2A;
2. ejecuta las pruebas directamente relacionadas;
3. ejecuta una sola vez la suite completa sobre el estado final.

Si modificas solo pruebas:

* ejecuta el archivo afectado;
* no repitas automáticamente toda la suite.

Validaciones finales, solo si modificas código:

```text
npx prisma generate
npx prisma validate
npx tsc --noEmit
npm run lint
```

# 16. Riesgos externos

No intentes enviar emails ni cobrar.

Confirma que el runbook distingue claramente:

* probado automáticamente;
* simulado localmente;
* pendiente externo real.

No declares producción validada.

# 17. Commit

Si la implementación queda aprobada o se corrigen defectos acotados:

1. Ejecuta una sola lista de archivos modificados.
2. Añade los archivos de R2A, cualquier corrección y:

```text
docs/programa-mejora/16-generalizacion-pqrs-pilotos/
```

3. Revisa una vez el staged diff para confirmar:

   * sin `.env`;
   * sin secretos;
   * sin connection strings;
   * sin datos reales;
   * sin evidencias reales;
   * sin archivos de otro módulo.
4. Crea:

```text
git commit -m "feat(pqrs): add tenant categories and audited corrections"
```

No ejecutes pruebas después del commit.

No hagas push ni tags.

# 18. Informe final

Entrega:

1. Defectos encontrados.
2. Correcciones realizadas.
3. Migración y compatibilidad legacy.
4. Categorías y concurrencia.
5. Creación y snapshots.
6. Correcciones e idempotencia.
7. Coherencia de workflow, fase y reapertura.
8. Evidencias y cleanup.
9. Aislamiento.
10. Reportes y UI.
11. Pruebas ejecutadas.
12. Riesgos restantes.
13. Commit y hash.
14. Resultado:

* `APROBADO Y COMMIT CREADO`;
* `CORREGIDO Y COMMIT CREADO`;
* `BLOQUEADO`.

No inicies otra fase.

Respeta las reglas permanentes de carpetas, archivos, orden Codex/Claude, revisión independiente y commits definidas para este proyecto.
