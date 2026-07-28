# FASE 2Q — REVISIÓN Y CORRECCIÓN DIRECTA DEL OUTBOX DE NOTIFICACIONES Y EMAILS

## Documentación automática

Antes de revisar o modificar código:

1. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/03-prompt-claude-revision-correccion-outbox-idempotencia.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/04-respuesta-claude-revision-correccion-outbox-idempotencia.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques los documentos 01 y 02.

---

Actúa como revisor e implementador correctivo especializado en:

* PostgreSQL.
* Prisma.
* Transactional outbox.
* Idempotencia.
* Procesamiento concurrente.
* Semántica de entrega de email.
* Recuperación ante crashes.
* Migraciones aditivas.
* Auditoría y trazabilidad.

Codex implementó el outbox de notificaciones y emails en la Fase 2P.

En esta intervención debes:

1. Revisar adversarialmente el diff completo.
2. Reproducir y clasificar defectos.
3. Corregir directamente todos los hallazgos críticos, altos y medios dentro del alcance.
4. Fortalecer schema, migración, implementación y pruebas cuando sea necesario.
5. Ejecutar la validación completa.
6. No aprobar tu propio trabajo.
7. No hacer commit.

Después de esta fase, Codex realizará una revisión final de solo lectura.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/05-notificaciones-email-idempotencia/01-prompt-codex-implementacion-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/02-respuesta-codex-implementacion-outbox-idempotencia.md`
* `docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/08-respuesta-codex-commit-cron-cas-atomicidad.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

Inspecciona completamente:

* `prisma/schema.prisma`
* `prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql`
* `src/domains/billing/billing.service.ts`
* `src/domains/billing/billing-outbox-policy.ts`
* `src/domains/billing/billing-outbox.service.ts`
* El servicio real de Notification.
* El servicio real de Email/EmailLog.
* El helper real de Resend.
* La ruta cron.
* La ruta super-admin.
* `tests/unit/billing-outbox-policy.test.ts`
* `tests/billing-outbox-idempotency.test.ts`
* `tests/billing-cron-atomicity.test.ts`
* Cualquier otra prueba nueva o modificada en esta fase.

La fuente de verdad es el código, el SQL de migración y las pruebas actuales.

## Alcance

Esta fase comprende:

* Schema y migración de outbox.
* Claves de deduplicación.
* Creación atómica de intenciones.
* Selección y claim concurrente.
* Recuperación de PROCESSING abandonado.
* Notification interna idempotente.
* EmailLog trazable.
* Semántica de `DELIVERY_UNKNOWN`.
* Clasificación de fallos.
* Retry y backoff.
* Dispatcher.
* Integración con cron y super-admin.
* Resumen estructurado.
* Seams.
* Pruebas puras, migración e integración.

## Fuera de alcance

No implementes:

* Colas externas.
* Webhooks de entrega de Resend.
* Reconciliación automática contra el proveedor.
* Locks distribuidos.
* Rediseño completo del sistema de email.
* Nuevas rutas públicas.
* UI nueva para conciliación.
* Cambios de pricing.
* Cambios de política de facturación.
* Métricas comerciales.
* Modificaciones de migraciones históricas.

Sí puedes corregir la migración nueva de esta fase porque todavía no está comprometida.

## Restricciones

No debes:

* Modificar migraciones históricas.
* Usar `db push`.
* Aplicar nada al entorno normal o producción.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar package files salvo necesidad crítica demostrada.
* Mostrar credenciales.
* Enviar emails reales.
* Llamar a Mercado Pago real.
* Ejecutar build.
* Levantar servidor.
* Hacer commit.
* Hacer push.
* Crear tags.
* Usar `git add`.

# 1. Estado inicial de Git

Guarda primero este prompt.

Después ejecuta:

```text
git status --short
git log -3 --oneline
git diff --check
git diff --stat
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD es el commit del cron atómico:

  * mensaje `feat(billing): make overdue cron atomic and concurrency-safe`;
* no existe staged diff;
* los cambios pendientes corresponden únicamente al outbox, schema, migración, pruebas y documentos 01–04;
* no quedan cambios de fases anteriores;
* `.env`, `.env.test`, package files y migraciones históricas están intactos.

Registra el hash real de HEAD.

Si el working tree contiene cambios inesperados, detente y marca `BLOQUEADO`.

# 2. Verificación de las afirmaciones de Codex

Crea una tabla con:

* afirmación;
* estado:

  * CONFIRMADA;
  * CONFIRMADA CON MATICES;
  * INCORRECTA;
  * NO DEMOSTRADA;
* evidencia;
* riesgo;
* corrección aplicada.

Verifica expresamente:

1. Existe un outbox durable.
2. La transición y el outbox se crean atómicamente.
3. IN_APP es efectivamente exactly-once.
4. EMAIL no se presenta falsamente como exactly-once.
5. Dos workers no procesan la misma fila.
6. Un crash previo al despacho se recupera.
7. Un crash posterior al inicio del proveedor termina en DELIVERY_UNKNOWN.
8. DELIVERY_UNKNOWN nunca se reenvía automáticamente.
9. No quedan dos caminos de envío activos.
10. Una corrida sin transiciones procesa pendientes antiguos.
11. El dispatcher procesa máximo 100 filas.
12. Los nueve escenarios de integración demuestran todas las garantías declaradas.
13. La migración es aditiva y compatible con datos existentes.
14. No se guarda PII en dedupe keys ni payloads.
15. No se realizaron llamadas reales a proveedores.

# 3. Schema

Revisa completamente los modelos y enums nuevos.

## BillingNotificationOutbox

Confirma la semántica de cada campo:

* `id`.
* `tenantId`.
* `subscriptionId`.
* `recipientUserId`.
* `channel`.
* `eventType`.
* `dedupeKey`.
* `status`.
* `attemptCount`.
* `nextAttemptAt`.
* `lockedAt`.
* `processingStartedAt`.
* `providerAttemptStartedAt`.
* `processedAt`.
* `lastErrorCode`.
* payload o metadata.
* timestamps.

Verifica:

* relaciones y foreign keys;
* `onDelete` y `onUpdate`;
* compatibilidad si se elimina un User, Tenant o Subscription;
* si una eliminación puede borrar evidencia operacional necesaria;
* defaults;
* nullabilidad;
* tamaños máximos;
* índices de selección;
* unique real de dedupe;
* índices redundantes;
* estados imposibles permitidos por schema.

## BillingOutboxAttempt

Confirma:

* relación exacta con outbox;
* número de intento;
* timestamps;
* resultado;
* error code;
* provider message ID, si corresponde;
* unique que impida dos registros para el mismo número de intento;
* que no almacene payloads sensibles.

## Notification

Confirma:

* `dedupeKey` nullable;
* unique compatible con múltiples null históricos;
* la restricción distingue correctamente destinatarios;
* no puede deduplicar accidentalmente dos usuarios diferentes.

## EmailLog

Confirma:

* dedupe estable;
* vínculo con outbox;
* provider ID acotado;
* estado coherente;
* campos históricos compatibles;
* no puede haber varios EmailLog para la misma intención salvo que el diseño lo justifique expresamente.

Corrige cualquier defecto de modelado.

# 4. Migración SQL

Lee el SQL línea por línea.

Confirma:

* crea enums antes de usarlos;
* columnas nuevas son compatibles;
* defaults no bloquean filas históricas;
* constraints coinciden con Prisma;
* foreign keys usan política explícita;
* índices cubren selección elegible;
* unique de dedupe es real;
* unique de Notification funciona con nulls históricos;
* unique de EmailLog funciona;
* unique de intentos funciona;
* no hay casts destructivos;
* no hay eliminación de datos;
* no hay locks evitables de larga duración;
* el SQL puede ejecutarse desde cero y sobre el baseline actual.

Compara:

```text
prisma/schema.prisma
```

contra:

```text
migration.sql
```

No aceptes divergencias silenciosas.

Si corriges schema, corrige la misma migración nueva.

No crees una segunda migración para corregir una migración aún no comprometida.

# 5. Dedupe key

Revisa el helper puro.

Confirma que la clave cambia por:

* Subscription.
* Event type.
* Frontera real.
* Destinatario.
* Canal.

Confirma:

* mismo evento produce exactamente la misma clave;
* una transición futura produce otra clave;
* no contiene email, nombre o IDs en claro;
* no depende de orden no determinista;
* normaliza fechas de forma estable;
* maneja fechas inválidas;
* longitud máxima;
* prefijo versionado;
* SHA-256 calculado sobre un formato no ambiguo.

Analiza colisiones semánticas.

Ejemplos:

* dos eventos diferentes con el mismo texto concatenado;
* null vs string `"null"`;
* timezone;
* milisegundos;
* recipient eliminado y recreado;
* mismo `subscriptionId` y frontera, pero distinto evento.

Añade pruebas si faltan.

# 6. Creación atómica del outbox

Reconstruye una transición del cron:

1. CAS de Subscription.
2. Tenant.
3. AuditLog.
4. Resolución de destinatarios.
5. Creación de outbox.
6. Commit.

Confirma que todo ocurre en la misma transacción.

## Fallos

Prueba y revisa:

* fallo al leer recipients;
* fallo al crear una fila outbox;
* unique conflict;
* fallo después de crear parcialmente varios canales;
* fallo en AuditLog;
* fallo al actualizar Tenant.

Resultado obligatorio:

* cero transición parcial;
* cero AuditLog parcial;
* cero outbox huérfano;
* cero transición confirmada sin intención durable cuando había destinatarios válidos.

## Sin destinatarios

Confirma que:

* la transición confirma;
* AuditLog confirma;
* cero outbox;
* resumen registra `NO_ACTIVE_RECIPIENTS`;
* no se considera error transaccional;
* no almacena PII.

# 7. Momento de resolución de destinatarios

Codex afirma que los ADMIN activos se resuelven dentro de la transacción.

Analiza:

* consistencia si el usuario se desactiva después del commit;
* consistencia si cambia el email;
* consistencia si se elimina el usuario;
* si la outbox debe preservar la intención para el user ID histórico;
* si `onDelete` elimina la fila y destruye trazabilidad;
* si es mejor `Restrict`, `SetNull` o conservar una identidad estable.

No almacenes email en la outbox solo para evitar una relación bien diseñada.

# 8. Selección elegible

Reconstruye la query de selección.

Debe considerar:

* PENDING.
* FAILED_RETRYABLE con `nextAttemptAt <= now`.
* PROCESSING abandonado antes de provider.
* PROCESSING abandonado después de provider, para marcar unknown, no reenviar.

Confirma:

* orden `nextAttemptAt`, `createdAt`, `id`;
* límite 100;
* no carga toda la tabla;
* no selecciona COMPLETED;
* no selecciona FAILED_FINAL;
* no selecciona DELIVERY_UNKNOWN para reenvío;
* una fila se intenta máximo una vez por corrida;
* no existe starvation obvio.

## Null y orden

Revisa el comportamiento de `nextAttemptAt = null`.

La selección debe tener semántica inequívoca.

# 9. Claim concurrente

Revisa el CAS de claim.

Confirma que compara suficientemente:

* id;
* status;
* attemptCount;
* lockedAt;
* nextAttemptAt;
* cualquier lease relevante.

Analiza estas carreras:

1. Dos dispatchers seleccionan PENDING.
2. Dos dispatchers seleccionan FAILED_RETRYABLE.
3. Un dispatcher intenta recuperar PROCESSING abandonado.
4. Otro finaliza la fila mientras se intenta reclamar.
5. Dos workers intentan crear `BillingOutboxAttempt`.
6. El claim gana, pero falla la creación del attempt.

El claim y la creación de `BillingOutboxAttempt` deben ser atómicos.

No debe quedar:

* attempt incrementado sin intento;
* intento sin claim;
* dos intentos con el mismo número;
* status PROCESSING sin timestamps coherentes.

# 10. Semántica de intentos

Define y verifica exactamente cuándo aumenta `attemptCount`.

Debe ser inequívoco:

* al reclamar;
* al comenzar efecto;
* o al finalizar.

Confirma que:

* backoff usa el número correcto;
* máximo de cinco intentos significa realmente cinco llamadas máximas;
* recuperar un lease antes del provider no consume incorrectamente un intento adicional, salvo política explícita;
* DELIVERY_UNKNOWN conserva el intento que sí cruzó la frontera del proveedor.

Añade pruebas de frontera:

* intento 1;
* intento 4;
* intento 5;
* intento 6 imposible.

# 11. Notification IN_APP

Reconstruye la operación completa.

Confirma:

* claim previo;
* creación idempotente;
* `createMany(skipDuplicates)` respaldado por unique real;
* búsqueda de Notification existente cuando se omite por duplicado;
* finalización del outbox;
* registro de attempt;
* atomicidad entre Notification y finalización.

## Crash windows

Prueba:

1. Notification se crea.
2. El proceso cae antes de marcar outbox COMPLETED.
3. El lease vence.
4. Otro worker recupera.

Resultado:

* no duplica Notification;
* detecta la existente;
* outbox queda COMPLETED;
* attempt final coherente.

Analiza también:

* Notification preexistente de otra fuente con la misma dedupe key;
* usuario eliminado;
* fallo de FK;
* fallo al finalizar.

# 12. EmailLog y frontera del proveedor

Este es el punto más crítico.

Reconstruye el orden exacto:

1. Claim outbox.
2. Crea/reclama EmailLog.
3. Guarda `providerAttemptStartedAt`.
4. Commit durable.
5. Ejecuta seam previo.
6. Llama a Resend.
7. Recibe respuesta o error.
8. Guarda resultado.
9. Finaliza outbox e intento.

Confirma que `providerAttemptStartedAt` se guarda **antes** del fetch y en una transacción confirmada.

Si se guarda en la misma transacción que permanece abierta durante el fetch, corrígelo.

No mantengas una transacción de base de datos abierta durante una llamada a Resend.

## Ventana antes del proveedor

Si el proceso cae después del claim pero antes de guardar `providerAttemptStartedAt`:

* lease recuperable;
* no se asume envío;
* puede reintentarse.

## Ventana después de guardar frontera y antes del fetch

Analiza cuidadosamente:

* la base indica que el intento externo comenzó, pero quizá el fetch nunca ocurrió;
* el diseño marcará DELIVERY_UNKNOWN tras expirar;
* esto es conservador, pero puede perder un email no enviado.

Confirma que es una decisión explícita.

No lo clasifiques como retry seguro.

## Ventana después del fetch y antes de persistir respuesta

* DELIVERY_UNKNOWN;
* no retry automático.

# 13. Clasificación real de errores de email

Lee el helper real de Resend.

No aceptes clasificaciones inventadas.

Crea una matriz:

| Situación                     |                        Hubo posible envío | Estado                   |           Retry |
| ----------------------------- | ----------------------------------------: | ------------------------ | --------------: |
| API key ausente               |                                        No | ?                        |               ? |
| Email inválido                |                                        No | ?                        |               ? |
| Usuario inactivo              |                                        No | ?                        |               ? |
| Error local antes de fetch    |                                        No | ?                        |               ? |
| HTTP 400/401/403              |                 Normalmente no/definitivo | ?                        |               ? |
| HTTP 408/429/5xx              | Resultado conocido o ambiguo según helper | ?                        |               ? |
| Timeout                       |                                Sí/ambiguo | DELIVERY_UNKNOWN         |              No |
| Error de red                  |                                Sí/ambiguo | DELIVERY_UNKNOWN         |              No |
| 2xx con body ilegible         |                        Posible aceptación | DELIVERY_UNKNOWN         |              No |
| 2xx sin provider ID           |                        Posible aceptación | DELIVERY_UNKNOWN         |              No |
| Respuesta de rechazo conocida |                  No aceptación confirmada | FAILED_RETRYABLE o FINAL | según evidencia |

La ausencia de `RESEND_API_KEY` merece revisión especial:

* en producción suele ser configuración faltante persistente;
* cinco reintentos automáticos pueden ser ruido;
* puede ser `FAILED_FINAL` o `FAILED_RETRYABLE` con política operacional explícita.

Clasifica según contrato real y documenta.

# 14. DELIVERY_UNKNOWN

Confirma que:

* no es elegible para retry;
* no vuelve a PENDING;
* no se procesa en otra corrida;
* no se presenta como SENT;
* no se presenta como FAILED;
* queda asociado a EmailLog y Attempt;
* conserva timestamps suficientes;
* no requiere el payload completo del proveedor;
* el resumen lo cuenta;
* existe forma operacional de localizarlo sin PII.

Busca cualquier función que pueda cambiar DELIVERY_UNKNOWN automáticamente.

No debe existir.

# 15. PROCESSING abandonado

Distingue por canal.

## IN_APP

Puede recuperarse siempre mediante dedupe real.

Confirma que un PROCESSING IN_APP abandonado vuelve a ser elegible.

## EMAIL sin providerAttemptStartedAt

Puede recuperarse.

Confirma:

* lease vencido;
* nuevo claim;
* intento coherente;
* no dos workers.

## EMAIL con providerAttemptStartedAt

Debe convertirse a DELIVERY_UNKNOWN.

Confirma que:

* el worker no hace un segundo fetch;
* la conversión usa CAS;
* no existe carrera con el worker original que todavía intenta finalizar;
* si el worker original finaliza al mismo tiempo, solo un estado final prevalece de forma segura.

Este escenario concurrente es obligatorio.

# 16. Finalización de email y fencing

Analiza el siguiente riesgo:

1. Worker A reclama.
2. Su lease vence.
3. Worker B marca DELIVERY_UNKNOWN.
4. Worker A recibe éxito tardío del proveedor.
5. Worker A intenta marcar COMPLETED.

Debe existir una protección de fencing.

La finalización de A debe comparar:

* id;
* status PROCESSING;
* attempt actual;
* lock/claim token o timestamp esperado.

Si B ya cambió el estado, A no puede sobrescribir DELIVERY_UNKNOWN.

Define qué registra A cuando pierde el CAS final.

No debe afirmar SENT en outbox si perdió ownership.

Añade una prueba concurrente determinista.

# 17. Retry y backoff

Verifica la fórmula exacta:

* 15 minutos exponencial;
* límite 24 horas;
* máximo 5 intentos.

Calcula y prueba:

* intento 1;
* intento 2;
* intento 3;
* intento 4;
* intento 5.

Confirma:

* no overflow;
* `nextAttemptAt` se calcula desde un `now` controlado;
* no usa reloj varias veces de forma inconsistente;
* FAILED_FINAL después del máximo;
* no retry dentro de la misma corrida;
* no sleeps.

# 18. Dispatcher y lote

Confirma:

* máximo 100 seleccionados;
* una fila máximo una vez por ejecución;
* un error no detiene las demás;
* una fila DELIVERY_UNKNOWN no consume repetidamente el lote;
* PROCESSING no abandonado no se selecciona;
* selección antigua funciona aunque no haya transición nueva;
* el cron llama al dispatcher aunque aplique cero transiciones.

Analiza backlog:

* 100 filas problemáticas recurrentes no deben bloquear indefinidamente filas nuevas;
* orden y backoff deben permitir progreso razonable.

# 19. Integración con cron

Confirma que el camino inmediato anterior quedó realmente eliminado.

Busca globalmente:

* `notifyTenantAdminsOfLicenseChange`;
* llamadas directas a Notification desde billing cron;
* llamadas directas a Resend desde billing cron;
* uso de `appliedTenantIds`;
* el resumen `externalEffects`.

Clasifica cada referencia.

Debe existir un solo camino activo para los efectos de billing:

```text
transición → outbox durable → dispatcher
```

No deben coexistir:

```text
transición → helper inmediato
```

y:

```text
transición → outbox
```

# 20. Resumen y compatibilidad

Reconstruye:

* `outboxCreation`.
* `outboxDispatch`.
* campos anteriores del cron.

Confirma que incluye:

* intenciones creadas;
* transiciones sin recipients;
* elegibles;
* claims ganados;
* claims perdidos;
* completados IN_APP;
* completados EMAIL;
* duplicados internos;
* retries;
* finales;
* unknown;
* destinatarios inválidos;
* intentos de proveedor;
* errores limitados;
* truncamiento.

No debe incluir:

* emails;
* nombres;
* payloads;
* provider responses;
* stack;
* secretos.

Confirma compatibilidad con super-admin y UI.

# 21. Autenticación

No se añadieron rutas.

Confirma que:

* cron sigue fail-closed;
* dispatcher no es invocable desde input HTTP arbitrario;
* super-admin conserva su autorización;
* no se exponen opciones de outbox desde query/body;
* no se devuelve metadata sensible.

# 22. Seams

Inspecciona los ocho seams.

Confirma:

* solo `NODE_ENV === "test"`;
* sin entrada HTTP;
* reset en `finally`;
* cleanup global;
* dirigibles por outbox ID;
* sin sleeps;
* sin promesas colgadas;
* permiten reproducir:

  * caída antes del provider;
  * caída después de frontera;
  * respuesta tardía;
  * fallo antes de finalizar;
  * dos workers.

Corrige cualquier seam inseguro.

# 23. Cobertura de pruebas

Codex reporta:

* 13 pruebas puras.
* 9 escenarios de integración.
* 348 pruebas totales.

El incremento es:

```text
348 - 326 = 22
13 + 9 = 22
```

El conteo coincide, pero **nueve escenarios de integración pueden ser insuficientes** para todas las garantías obligatorias del prompt original.

Mapea cada uno de los 26 escenarios solicitados originalmente contra una prueba real.

Usa una tabla:

* requisito;
* prueba;
* aserciones;
* estado:

  * cubierto;
  * parcialmente cubierto;
  * ausente.

Añade las pruebas faltantes.

No basta con que un único test mencione muchas propiedades sin provocar las ventanas reales.

## Pruebas que deben existir explícitamente

1. Outbox revierte con la transición.
2. Sin recipients.
3. Dos crons no duplican outbox.
4. Dos dispatchers IN_APP.
5. Dos dispatchers EMAIL.
6. Crash después de Notification, antes de finalizar.
7. Crash antes de provider.
8. Crash después de frontera, antes de fetch.
9. Crash después de fetch, antes de guardar respuesta.
10. Worker tardío no sobrescribe DELIVERY_UNKNOWN.
11. Sin API key.
12. Usuario inactivo.
13. Usuario eliminado.
14. Éxito con provider ID.
15. 2xx sin ID.
16. 2xx ilegible.
17. Rechazo temporal conocido.
18. Rechazo permanente conocido.
19. Timeout.
20. Error de red.
21. Máximo de intentos.
22. Backoff.
23. Corrida sin transiciones drena pendientes.
24. Un error no bloquea otras filas.
25. Unique real de Notification.
26. Unique real de EmailLog/outbox attempt.
27. Detalles truncados.
28. Compatibilidad del resumen.

No uses `skip`.

No llames proveedores reales.

# 24. Corrección directa

Después de la revisión:

* Corrige todos los hallazgos críticos, altos y medios.
* Corrige schema y la migración nueva cuando sea necesario.
* Añade las pruebas faltantes.
* No te limites a emitir recomendaciones.
* Riesgos bajos pueden documentarse si no bloquean commit, producción o la revisión final.
* No hagas commit.

# 25. Archivos permitidos

Puedes modificar únicamente:

* `prisma/schema.prisma`
* `prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql`
* `src/domains/billing/billing.service.ts`
* `src/domains/billing/billing-outbox-policy.ts`
* `src/domains/billing/billing-outbox.service.ts`
* El servicio actual de Notification.
* El servicio actual de Email/EmailLog/Resend.
* Pruebas puras del outbox.
* Pruebas de integración del outbox.
* `tests/billing-cron-atomicity.test.ts`, solo por compatibilidad.
* Documentos 03 y 04.

Si necesitas otro archivo, documenta primero la razón y limita el cambio.

# 26. Validación de migración

Ejecuta de forma segura:

```text
npx prisma validate
npx prisma generate
```

Valida el SQL:

* contra el baseline protegido;
* desde cero en un esquema temporal aislado;
* con todas las migraciones;
* confirmando índices y restricciones.

No uses `db push`.

No apliques al entorno normal.

Elimina el esquema temporal al terminar.

# 27. Ejecución segura

## Ruta insegura

Ejecuta primero:

```text
npm test
```

Debe abortar antes de Prisma.

## POSIX autorizado

```bash
env DATABASE_URL= DIRECT_URL= npm test
```

## PowerShell autorizado

```powershell
$hadDatabaseUrl = Test-Path Env:DATABASE_URL
$hadDirectUrl = Test-Path Env:DIRECT_URL
$previousDatabaseUrl = $env:DATABASE_URL
$previousDirectUrl = $env:DIRECT_URL

try {
  $env:DATABASE_URL = " "
  $env:DIRECT_URL = " "

  npm test
}
finally {
  if ($hadDatabaseUrl) {
    $env:DATABASE_URL = $previousDatabaseUrl
  } else {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  }

  if ($hadDirectUrl) {
    $env:DIRECT_URL = $previousDirectUrl
  } else {
    Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue
  }
}
```

No modifiques el guard ni archivos de entorno.

## Comandos mínimos

Ejecuta:

```text
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
npm test
```

El último comando debe usar el aislamiento correspondiente.

No reintentes automáticamente un fallo lógico.

# 28. Limpieza

Antes y después confirma:

* conteos básicos;
* cero fixtures de outbox;
* cero attempts residuales;
* cero PROCESSING residual;
* cero DELIVERY_UNKNOWN de pruebas;
* cero fixtures cron;
* cero fixtures billing;
* cero WebhookEvent residuales;
* cero usuarios de prueba;
* cero llamadas reales a Mercado Pago;
* cero emails reales;
* variables restauradas;
* hooks reseteados;
* esquema temporal eliminado;
* `.env` intacto;
* `.env.test` ignorado.

# 29. Criterios de aceptación

El resultado solo puede considerarse corregido si:

1. Schema y migración coinciden.
2. Migración es aditiva.
3. Dedupe key no tiene colisiones semánticas conocidas.
4. Creación de outbox es atómica con billing.
5. Claim e intento son atómicos.
6. Notification no se duplica.
7. EmailLog no se duplica.
8. No hay transacción DB abierta durante Resend.
9. La frontera del proveedor se persiste antes del fetch.
10. Crash antes del provider es recuperable.
11. Crash después de frontera no se reenvía.
12. Crash después del fetch queda unknown.
13. Worker tardío no sobrescribe unknown.
14. DELIVERY_UNKNOWN nunca es elegible para retry.
15. Retry usa backoff correcto.
16. Máximo de intentos correcto.
17. Dos workers producen máximo un efecto.
18. Corrida sin transiciones drena pendientes.
19. Solo existe un camino de envío.
20. Resumen completo y sin PII.
21. Auth permanece segura.
22. Migración valida desde cero.
23. Prisma genera.
24. Typecheck pasa.
25. Lint pasa.
26. Pruebas puras pasan.
27. Suite completa pasa.
28. No existen `skip`.
29. Fixtures limpios.
30. No se envían emails reales.
31. No se llama Mercado Pago real.
32. No se hace commit.

# 30. Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Verificación de afirmaciones.
4. Hallazgos iniciales.
5. Correcciones realizadas.
6. Schema.
7. Migración.
8. Dedupe key.
9. Creación atómica.
10. Destinatarios.
11. Selección.
12. Claim.
13. Intentos.
14. IN_APP.
15. EmailLog.
16. Frontera del proveedor.
17. Clasificación de errores.
18. Delivery unknown.
19. Procesamiento abandonado.
20. Fencing de finalización.
21. Retry y backoff.
22. Dispatcher.
23. Integración con cron.
24. Resumen.
25. Autenticación.
26. Seams.
27. Mapeo de pruebas obligatorias.
28. Archivos modificados.
29. Validación de migración.
30. Pruebas puras.
31. Pruebas de integración.
32. Compatibilidad.
33. Procedimiento seguro.
34. Comandos ejecutados.
35. Resultados.
36. Limpieza.
37. Hallazgos restantes.
38. Riesgos aceptados.
39. Recomendación para la revisión final de Codex.
40. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/04-respuesta-claude-revision-correccion-outbox-idempotencia.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/03-prompt-claude-revision-correccion-outbox-idempotencia.md`

3. No hagas commit.

4. No hagas push.

5. No crees tags.

6. No inicies otra subfase.

7. Detente después del informe.
