# FASE 2P — IMPLEMENTACIÓN DE OUTBOX E IDEMPOTENCIA PARA NOTIFICACIONES Y EMAILS

## Documentación automática

Antes de analizar o modificar código:

1. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/01-prompt-codex-implementacion-outbox-idempotencia.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/02-respuesta-codex-implementacion-outbox-idempotencia.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques documentos de fases anteriores.

---

Actúa como ingeniero principal especializado en:

* PostgreSQL.
* Prisma.
* Transactional outbox.
* Idempotencia.
* Procesamiento concurrente.
* Notificaciones internas.
* Email transaccional.
* Recuperación ante fallos.
* Trazabilidad operacional.

Debes diagnosticar e implementar en una sola intervención la siguiente subfase:

> Idempotencia, durabilidad y trazabilidad de las notificaciones y emails producidos por las transiciones automáticas de facturación.

Esta implementación será revisada y corregida posteriormente por Claude. Después, Codex realizará una revisión final de solo lectura. No apruebes tu propio trabajo y no hagas commit.

# 1. Contexto aprobado

Las fases anteriores ya garantizan:

* Idempotencia del efecto económico de Payment APPROVED.
* Precedencia de estados.
* Cobertura exacta.
* Separación entre economía y acceso.
* Reactivación Serializable.
* CAS en webhooks.
* Cron con decisión pura.
* Cron con CAS por candidato.
* Atomicidad entre Subscription, Tenant y AuditLog.
* Control de concurrencia entre cron, pagos y acciones administrativas.
* Efectos externos únicamente después del commit.
* Resumen estructurado del cron.

El commit HEAD debe tener el mensaje:

```text
feat(billing): make overdue cron atomic and concurrency-safe
```

No asumas el hash. Léelo desde Git.

## Riesgo actualmente abierto

Una transición de billing puede quedar confirmada y:

* el proceso puede caer antes de notificar;
* la Notification puede crearse y el email no enviarse;
* una reejecución puede generar avisos duplicados;
* dos workers pueden intentar enviar el mismo aviso;
* un fallo posterior al proveedor puede dejar resultado ambiguo;
* no existe una fuente durable que permita retomar el trabajo pendiente.

La solución debe cerrar esos huecos sin alterar la transición económica ya confirmada.

# 2. Flujo de trabajo

En esta fase Codex es implementador.

Después:

1. Claude revisará y corregirá directamente.
2. Codex hará la revisión final de solo lectura.
3. Solo tras aprobación se hará commit.

No hagas commit ahora.

# 3. Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/04-cron-atomicidad/04-respuesta-codex-revision-correccion-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/06-respuesta-claude-revision-final-cron-cas-atomicidad.md`
* `docs/programa-mejora/04-cron-atomicidad/08-respuesta-codex-commit-cron-cas-atomicidad.md`
* `docs/programa-mejora/03-precedencia-cron/20-respuesta-claude-revision-final-economia-acceso.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

Inspecciona completamente:

* `prisma/schema.prisma`
* Las migraciones existentes relacionadas con:

  * Notification;
  * EmailLog;
  * User;
  * Tenant;
  * Subscription;
  * AuditLog.
* `src/domains/billing/billing.service.ts`
* El helper actual `notifyTenantAdminsOfLicenseChange`
* Los servicios reales de:

  * Notification;
  * Email;
  * EmailLog;
  * Resend.
* Las rutas cron.
* La acción manual de super-admin.
* Las pruebas actuales del cron.
* Las pruebas actuales de Notification/email.
* Cualquier proceso que cree notificaciones de licencia.

La fuente de verdad es el código actual.

# 4. Estado inicial de Git

Ejecuta:

```text
git status --short
git log -3 --oneline
git diff --check
git diff --stat
git diff --name-status
git diff --cached --name-status
```

Confirma:

* HEAD tiene el mensaje del cron aprobado.
* No existe staged diff.
* No quedan cambios pendientes de la fase anterior.
* Schema, migraciones, paquetes y entorno están limpios.
* No existe una implementación previa parcial de outbox.
* Los documentos de fases anteriores están comprometidos.

Registra el hash real de HEAD.

Si el working tree contiene cambios inesperados, detente y marca `BLOQUEADO`.

# 5. Diagnóstico previo obligatorio

Antes de editar, documenta:

1. Cómo se crea actualmente una Notification.
2. Cómo se crea actualmente un EmailLog.
3. Cuándo se llama a Resend.
4. Qué función procesa varios administradores.
5. Qué pasa si falla la lectura de destinatarios.
6. Qué pasa si falla Notification.
7. Qué pasa si falla EmailLog.
8. Qué pasa si Resend acepta el email y el proceso cae antes de guardar el resultado.
9. Qué pasa si el cron confirma la transición y cae antes de llamar al helper.
10. Qué pasa si dos procesos intentan notificar la misma transición.
11. Qué identificador estable existe para una transición.
12. Qué datos del destinatario se almacenan.
13. Qué PII podría quedar dentro de metadata.
14. Qué índices y restricciones existen.
15. Qué cambios de schema son realmente necesarios.

No diseñes desde cero sin entender los servicios actuales.

# 6. Garantías objetivo

La implementación debe distinguir claramente:

## Notification interna

Debe ser **efectivamente exactly-once** para una combinación de:

* evento de facturación;
* destinatario;
* canal interno.

Un retry no puede crear dos Notifications iguales.

## Email externo

No afirmes “exactly-once” si el proveedor y el código actual no ofrecen una clave de idempotencia verificable.

La garantía mínima debe ser:

* una intención durable;
* un claim concurrente único;
* trazabilidad de cada intento;
* no reenvío automático ante resultado ambiguo;
* retry controlado ante fallo conocido y seguro;
* cero duplicación por dos workers simultáneos.

Distingue expresamente:

* `FAILED_RETRYABLE`.
* `FAILED_FINAL`.
* `DELIVERY_UNKNOWN`.

Adapta nombres al diseño real.

## Transición de facturación

La transición no puede revertirse por un fallo de notificación o email.

Subscription, Tenant y AuditLog siguen siendo la fuente de verdad de la transición.

# 7. Arquitectura mínima esperada

Implementa un **transactional outbox** para los efectos de billing.

Puedes adaptar nombres, pero el diseño debe incluir una entidad durable equivalente a:

```text
BillingNotificationOutbox
```

Cada fila representa una intención para:

* un destinatario;
* un canal;
* un evento concreto.

## Canales mínimos

* `IN_APP`.
* `EMAIL`.

## Estados mínimos

El modelo debe distinguir de forma inequívoca:

* pendiente;
* en procesamiento;
* completado;
* fallo reintentable;
* fallo final;
* resultado de entrega desconocido.

Puedes usar enum Prisma o strings controlados, según el patrón del repositorio.

## Campos mínimos

La entidad debe tener equivalentes a:

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
* `providerAttemptStartedAt`, para EMAIL.
* `processedAt`.
* `lastErrorCode`.
* `payload` sanitizado o campos explícitos.
* `createdAt`.
* `updatedAt`.

No almacenes:

* nombres de personas;
* direcciones de email dentro de la dedupe key;
* secretos;
* tokens;
* payload completo del proveedor;
* información financiera innecesaria.

# 8. Clave de deduplicación

Define una clave determinista, estable y acotada.

Debe diferenciar:

* evento de transición;
* Subscription;
* destinatario;
* canal.

Puede basarse en:

* `subscriptionId`;
* tipo de transición;
* frontera temporal que originó la transición;
* `recipientUserId`;
* canal.

Ejemplo conceptual:

```text
billing:<subscriptionId>:<transition>:<boundary>:<recipientUserId>:<channel>
```

No copies el ejemplo ciegamente. Adáptalo a la información estable disponible.

Requisitos:

* Sin PII.
* Máximo razonable, preferiblemente 255 caracteres.
* Determinista.
* Mismo evento → misma clave.
* Nueva transición real → nueva clave.
* Cambio de recipient → nueva clave.
* Cambio de canal → nueva clave.

Debe existir una restricción única en base de datos.

# 9. Notification y EmailLog

Revisa los modelos existentes.

## Notification

Añade una forma de deduplicar una Notification interna.

Solución esperada:

* `dedupeKey` nullable para compatibilidad con notificaciones históricas;
* restricción única;
* la clave incluye destinatario o el destinatario forma parte de una restricción compuesta;
* retry de outbox encuentra la Notification existente y se considera exitoso.

No conviertas todas las notificaciones actuales en obligatorias de dedupe.

## EmailLog

Añade trazabilidad idempotente.

Debe existir una clave estable por intención de email.

Confirma si conviene:

* `dedupeKey` nullable y única;
* vínculo con outbox;
* provider message ID;
* estado de intento;
* error clasificado.

No almacenes respuesta completa de Resend.

# 10. Creación atómica de outbox

Cuando el cron gana una transición:

Dentro de la misma transacción que confirma:

* Subscription.
* Tenant.
* AuditLog.

debe crear también las intenciones de outbox correspondientes.

La transición y las intenciones deben confirmarse juntas.

Si falla la creación del outbox:

* revierte Subscription;
* revierte Tenant;
* revierte AuditLog.

No debe quedar una transición confirmada sin una intención durable, salvo que no exista ningún destinatario válido.

## Destinatarios

Determina una política estable.

Opción preferida:

* resolver los usuarios administradores activos dentro de la transacción;
* crear una fila outbox por destinatario y canal;
* almacenar únicamente `recipientUserId`, no el email en la outbox.

Si no hay destinatarios:

* la transición puede confirmarse;
* el AuditLog permanece;
* el resumen debe registrar `NO_ACTIVE_RECIPIENTS`;
* no inventes un destinatario.

## Duplicados

Usa `createMany({ skipDuplicates: true })`, upsert o una estrategia equivalente respaldada por la restricción única.

Dos intentos de crear la misma intención no pueden producir dos filas.

# 11. Tipos de evento

Incluye como mínimo los eventos actuales del cron:

* Inicio de Grace.
* Suspensión por Grace vencida.

Usa nombres estables, por ejemplo:

* `BILLING_GRACE_STARTED`.
* `BILLING_SUSPENDED`.

Adapta los nombres a las convenciones del repositorio.

No mezcles eventos de pago o marketing que están fuera de esta fase.

# 12. Desacoplar transición y despacho

Después del commit:

* el cron puede intentar despachar outbox pendiente;
* pero el éxito del despacho no cambia el resultado de la transición.

La siguiente ejecución del cron debe procesar outbox pendiente aunque:

* no existan nuevas transiciones;
* el proceso anterior haya caído;
* la transición tenga varias horas de antigüedad.

El despacho no puede depender únicamente de una lista en memoria de `appliedTenantIds`.

# 13. Selección del outbox

Implementa una selección limitada y ordenada.

Debe considerar:

* PENDING.
* FAILED_RETRYABLE con `nextAttemptAt <= now`.
* Filas en PROCESSING abandonadas, según una política segura.

Orden mínimo:

* `nextAttemptAt`.
* `createdAt`.
* `id`.

Límite de lote documentado.

No cargues toda la tabla.

# 14. Claim concurrente

Cada fila debe reclamarse con CAS.

Ejemplo conceptual:

```text
updateMany where:
- id
- status elegible
- attemptCount actual
- lockedAt actual
```

Si `count = 1`:

* el worker ganó.

Si `count = 0`:

* otro worker ganó;
* no crea Notification;
* no intenta email;
* devuelve `SKIPPED_CONCURRENT_CLAIM`.

Dos dispatchers concurrentes no pueden procesar dos veces la misma fila.

No uses locks distribuidos.

# 15. Notification interna

Para una fila `IN_APP` reclamada:

1. Crea Notification con `dedupeKey`.
2. Si ya existe por restricción única:

   * trátala como completada;
   * no crees una segunda.
3. Marca outbox como completado.
4. Registra `processedAt`.
5. No envíes email desde esta rama.

La operación Notification + finalización del outbox debe ser atómica cuando sea posible.

Si crear Notification falla de forma conocida:

* clasifica el error;
* programa retry si es reintentable;
* no marque completado.

# 16. Email externo

Para una fila `EMAIL` reclamada:

1. Relee el usuario destinatario.
2. Confirma:

   * usuario existente;
   * activo;
   * email válido conforme al contrato actual.
3. Crea o reclama EmailLog por `dedupeKey`.
4. Marca durablemente que el intento hacia proveedor va a comenzar.
5. Llama a Resend fuera de la transacción de base de datos.
6. Guarda únicamente:

   * éxito/fallo;
   * provider message ID, si existe;
   * código de error sanitizado;
   * timestamps.

## Fallo conocido antes de enviar

Ejemplos:

* Sin API key.
* Destinatario inválido.
* Configuración ausente.
* Error local previo al fetch.

Puede clasificarse como:

* reintentable;
* final.

## Fallo conocido del proveedor

Clasifica de acuerdo con el comportamiento real del helper:

* errores temporales → retry;
* errores permanentes → final.

No inventes clasificaciones sin evidencia del servicio actual.

## Resultado ambiguo

Si el proveedor pudo haber aceptado el email, pero la aplicación no pudo confirmar el resultado:

* marca `DELIVERY_UNKNOWN`;
* no lo reenvíes automáticamente;
* no lo presentes como SENT;
* no lo presentes como FAILED_RETRYABLE.

Sin idempotency key real del proveedor, un retry automático podría duplicar el email.

# 17. Procesamiento abandonado

Distingue:

## Claim abandonado antes del intento externo

Si una fila quedó PROCESSING pero:

* `providerAttemptStartedAt = null`;
* el lease venció;

puede volver a PENDING o reclamarse de nuevo con seguridad.

## Claim abandonado después de iniciar proveedor

Si:

* `providerAttemptStartedAt != null`;
* no existe confirmación final;
* el lease venció;

para EMAIL debe convertirse en `DELIVERY_UNKNOWN`.

No reenvíes automáticamente.

Para IN_APP puede recuperarse de forma segura gracias a la restricción única de Notification.

# 18. Retry y backoff

Implementa una política acotada.

Debe incluir:

* máximo de intentos.
* backoff determinista.
* `nextAttemptAt`.
* paso a fallo final cuando excede el máximo.
* sin loops dentro de una ejecución.
* una fila se intenta como máximo una vez por corrida.

No uses sleeps.

No reintentes dentro de la misma llamada al proveedor.

# 19. Resumen estructurado

El cron o dispatcher debe devolver métricas como:

* outbox elegible.
* reclamado.
* procesado.
* completado IN_APP.
* completado EMAIL.
* duplicados internos detectados.
* claims perdidos.
* retries programados.
* fallos finales.
* delivery unknown.
* sin destinatario válido.
* errores sanitizados.
* detalles limitados.
* truncamiento.

No incluyas:

* nombres;
* emails;
* stack;
* secretos;
* payloads del proveedor.

Conserva compatibilidad con los campos actuales del cron.

# 20. Integración con `applyOverdueLicenseRules`

El cron debe:

1. Procesar transiciones.
2. Confirmar outbox dentro de cada transición.
3. Después, despachar un lote de outbox.
4. Despachar también filas pendientes antiguas.
5. Incorporar el resumen del dispatcher en `CronRunSummary`.

El cron no debe volver a usar directamente la lista en memoria de tenants aplicados para crear Notification/email.

Retira o deja de usar el camino inmediato anterior cuando el outbox esté activo.

No dejes dos caminos de envío funcionando al mismo tiempo.

# 21. Super-admin

Revisa la ejecución manual.

Debe:

* conservar los campos consumidos por UI/toast;
* poder despachar outbox de las transiciones que acaba de aplicar;
* no exponer opciones inseguras;
* no mostrar PII en la respuesta.

No rediseñes la UI salvo incompatibilidad real.

# 22. Autenticación

Cualquier ruta que despache outbox debe:

* reutilizar el mecanismo seguro del cron;
* ser fail-closed;
* no aceptar opciones arbitrarias desde HTTP;
* no exponer secretos.

Prioriza usar el cron existente en lugar de crear una ruta nueva.

Si creas una ruta nueva, justifica por qué es necesaria y añade pruebas completas de auth.

# 23. Migración y schema

Esta fase autoriza cambios de schema y una migración.

## Restricciones

* Una única migración coherente para esta subfase.
* No modificar migraciones históricas.
* No usar `db push`.
* No aplicar migración al entorno normal.
* No tocar producción.
* No modificar `.env` o `.env.test`.
* No mostrar URLs ni credenciales.
* No borrar datos.

## Compatibilidad

Los nuevos campos de Notification y EmailLog deben ser nullable o tener defaults seguros para datos existentes.

La migración debe incluir:

* tablas o enums nuevos necesarios;
* columnas;
* índices;
* restricciones únicas;
* foreign keys con política explícita;
* índices para selección del outbox.

## Ejecución segura

Usa únicamente el procedimiento de base de pruebas autorizado.

Si no existe una forma segura de crear/aplicar la migración contra la base de pruebas:

1. Crea y revisa el SQL de migración.
2. No lo apliques al entorno normal.
3. Documenta el bloqueo de ejecución.
4. No uses `db push`.

## Prisma Client

Puedes ejecutar:

```text
npx prisma generate
```

después de modificar schema.

No incluyas archivos generados que el repositorio no versiona.

# 24. Archivos permitidos

Puedes modificar únicamente lo estrictamente necesario dentro de:

* `prisma/schema.prisma`
* Una migración nueva bajo `prisma/migrations/`
* `src/domains/billing/billing.service.ts`
* Un nuevo servicio de outbox dentro de `src/domains/billing/` o el dominio real de notificaciones
* El servicio actual de Notification
* El servicio actual de Email/EmailLog/Resend
* La ruta cron, solo si es necesario
* La ruta super-admin, solo por compatibilidad
* Pruebas puras
* Pruebas de integración
* Documentos 01 y 02

Antes de editar cualquier otro archivo:

1. Documenta la necesidad.
2. Comprueba que pertenece al alcance.
3. Limita el cambio.

No modifiques package files salvo dependencia absolutamente imprescindible. No añadas dependencias para resolver algo que Prisma/PostgreSQL ya pueden hacer.

# 25. Seams deterministas

Puedes crear seams como:

* `AFTER_OUTBOX_CREATED`.
* `AFTER_OUTBOX_SELECTED`.
* `AFTER_OUTBOX_CLAIMED`.
* `BEFORE_NOTIFICATION_CREATE`.
* `AFTER_NOTIFICATION_CREATE`.
* `BEFORE_EMAIL_PROVIDER_ATTEMPT`.
* `AFTER_EMAIL_PROVIDER_RESPONSE`.
* `BEFORE_OUTBOX_FINALIZE`.

Requisitos:

* solo `NODE_ENV === "test"`;
* sin entrada HTTP;
* sin sleeps;
* reset en `finally`;
* limpieza global;
* dirigibles por outbox ID;
* no ejecutables en producción.

# 26. Pruebas puras

Añade pruebas para:

1. Dedupe key estable.
2. Dedupe key cambia por destinatario.
3. Dedupe key cambia por canal.
4. Dedupe key cambia por transición real.
5. Dedupe key sin PII.
6. Límite de longitud.
7. Clasificación de errores.
8. Backoff.
9. Máximo de intentos.
10. Claim abandonado antes de proveedor.
11. Claim abandonado después de proveedor.
12. Payload sanitizado.
13. No mutación.

No importes PrismaClient en helpers puros.

# 27. Pruebas de integración obligatorias

Usa PostgreSQL real de pruebas.

## Atomicidad de creación

1. Transición a Grace crea:

   * Subscription;
   * Tenant;
   * AuditLog;
   * outbox IN_APP;
   * outbox EMAIL;
     todo atómicamente.

2. Transición a SUSPENDED crea las intenciones equivalentes.

3. Fallo al crear outbox revierte:

   * Subscription;
   * Tenant;
   * AuditLog;
   * outbox.

4. Sin administradores activos:

   * transición confirma;
   * cero filas para destinatarios;
   * resumen registra ausencia.

## Deduplicación

5. Reprocesar el mismo evento no crea outbox duplicado.

6. Dos crons concurrentes crean una sola intención por destinatario/canal.

7. Dos dispatchers concurrentes:

   * un claim gana;
   * el otro pierde;
   * una Notification;
   * un intento de email.

8. Retry de IN_APP después de crear Notification pero antes de finalizar:

   * encuentra la existente;
   * no duplica;
   * outbox termina completado.

## Durabilidad

9. Transición confirma y el proceso “cae” antes del despacho:

   * outbox queda pendiente;
   * la siguiente corrida lo procesa.

10. Corrida sin nuevas transiciones procesa outbox antiguo.

11. Un fallo de una fila outbox no impide procesar otras.

## Email

12. Sin API key:

* cero fetch real;
* estado correctamente clasificado;
* EmailLog trazable.

13. Éxito mockeado:

* un fetch;
* provider ID guardado de forma acotada;
* EmailLog y outbox completados.

14. Fallo temporal conocido:

* intento incrementado;
* `nextAttemptAt`;
* retry permitido en otra corrida.

15. Fallo permanente:

* `FAILED_FINAL`;
* no nuevo retry.

16. Caída antes del provider:

* lease recuperable;
* retry seguro.

17. Caída después de iniciar provider, antes de finalizar:

* `DELIVERY_UNKNOWN`;
* no segundo fetch automático.

18. Dos workers sobre EMAIL:

* máximo un fetch.

## Notification

19. Dos workers sobre IN_APP:

* una Notification.

20. Restricción única real evita duplicados.

## Destinatarios

21. Usuario desactivado antes del despacho:

* no se envía;
* estado final explícito;
* no se filtra email.

22. Usuario eliminado o ausente:

* comportamiento controlado;
* no rompe el lote.

## Resumen

23. Resume todas las categorías nuevas.

24. Detalles acotados y truncamiento.

## Compatibilidad

25. Los campos anteriores del cron continúan presentes.

26. UI/super-admin no se rompe.

No uses `skip`.

No uses sleeps.

No llames Resend real.

No llames Mercado Pago real.

# 28. Pruebas de migración

Verifica:

* Migration SQL válido.
* Prisma Client genera.
* Restricciones únicas reales.
* Datos históricos con null siguen válidos.
* Índices creados.
* La migración puede aplicarse a una base de pruebas limpia.
* La suite puede correr después de aplicar la migración.
* No se modifica el entorno normal.

# 29. Compatibilidad completa

Deben seguir verdes:

* Idempotencia de Payment.
* Precedencia.
* Cobertura.
* Reactivación.
* Período compartido.
* Términos pendientes.
* Cron CAS.
* Atomicidad del cron.
* Starvation.
* Autenticación.
* Guard de base de pruebas.
* UI super-admin.
* Rutas existentes.

No reduzcas garantías ni elimines aserciones anteriores.

# 30. Ejecución segura

## Ruta insegura

Ejecuta primero:

```text
npm test
```

Debe abortar antes de Prisma con el entorno normal.

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

## POSIX autorizado

```bash
env DATABASE_URL= DIRECT_URL= npm test
```

No modifiques el guard.

No muevas `.env`.

No modifiques `.env.test`.

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

Ejecuta además la validación segura de la migración contra la base de pruebas conforme al procedimiento real del repositorio.

No reintentes automáticamente un fallo lógico.

# 31. Limpieza

Antes y después confirma:

* conteos básicos;
* cero fixtures de outbox;
* cero fixtures cron;
* cero fixtures billing;
* cero WebhookEvent residuales;
* cero usuarios de prueba;
* cero llamadas reales a Mercado Pago;
* cero emails reales;
* cero outbox PROCESSING residual de pruebas;
* variables restauradas;
* hooks reseteados;
* `.env` intacto;
* `.env.test` ignorado;
* conteos de mockdata iguales, salvo cambios de estructura por la migración.

# 32. Criterios de aceptación

La implementación solo se considera completa si:

1. Existe outbox durable.
2. Outbox se crea atómicamente con la transición.
3. Existe dedupe key única.
4. Notification interna no se duplica.
5. EmailLog es trazable por intención.
6. Dos workers no procesan la misma fila.
7. Un crash antes del despacho se recupera.
8. Una corrida sin transiciones drena outbox.
9. Fallos externos no revierten billing.
10. Fallo conocido reintentable tiene backoff.
11. Fallo final no se reintenta.
12. Resultado ambiguo queda DELIVERY_UNKNOWN.
13. DELIVERY_UNKNOWN no se reenvía automáticamente.
14. Claim abandonado antes del provider es recuperable.
15. No hay dos caminos de envío activos.
16. Resumen es completo.
17. No contiene PII.
18. Auth sigue segura.
19. Migración es válida.
20. Datos históricos siguen válidos.
21. Prisma genera.
22. Typecheck pasa.
23. Lint pasa.
24. Pruebas puras pasan.
25. Suite completa pasa.
26. No existen `skip`.
27. Fixtures quedan limpios.
28. No se envían emails reales.
29. No se llama Mercado Pago real.
30. No se hace commit.

# 33. Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git y hash base.
3. Diagnóstico previo.
4. Arquitectura elegida.
5. Garantías reales.
6. Limitaciones de entrega de email.
7. Modelos y campos.
8. Dedupe key.
9. Migración.
10. Creación atómica.
11. Destinatarios.
12. Selección del outbox.
13. Claim concurrente.
14. Notification interna.
15. Email.
16. Delivery unknown.
17. Retry y backoff.
18. Procesamiento abandonado.
19. Integración con cron.
20. Super-admin.
21. Autenticación.
22. Resumen.
23. Seams.
24. Archivos modificados.
25. Schema.
26. Migración aplicada únicamente a pruebas.
27. Pruebas puras.
28. Pruebas de integración.
29. Compatibilidad.
30. Procedimiento seguro.
31. Comandos ejecutados.
32. Resultados.
33. Limpieza.
34. Hallazgos o riesgos restantes.
35. Recomendación para Claude.
36. Estado:

* IMPLEMENTADO.
* IMPLEMENTADO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/02-respuesta-codex-implementacion-outbox-idempotencia.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/01-prompt-codex-implementacion-outbox-idempotencia.md`

3. No hagas commit.

4. No hagas push.

5. No crees tags.

6. No inicies otra subfase.

7. Detente después del informe.
