# FASE 2S — CORRECCIÓN ACOTADA DE COBERTURA DEL OUTBOX

## Documentación automática

Antes de revisar o modificar archivos:

1. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/07-prompt-claude-correccion-cobertura-outbox.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/08-respuesta-claude-correccion-cobertura-outbox.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

No modifiques los documentos 01 a 06.

---

Actúa como implementador correctivo especializado en pruebas deterministas de:

* Transactional outbox.
* Prisma y PostgreSQL.
* Claims concurrentes.
* Fencing.
* Recuperación de leases.
* Idempotencia de Notification.
* EmailLog y trazabilidad de intentos.
* Ventanas de crash antes y después de un proveedor externo.

Codex realizó la revisión final de solo lectura y emitió:

```text
REQUIERE CORRECCIONES
```

No encontró un defecto funcional crítico o alto en producción. Abrió únicamente:

```text
R-01 · MEDIA · Cinco ventanas obligatorias no se provocan mediante pruebas reales.
```

Esta intervención debe corregir exclusivamente R-01.

Después de esta fase, Codex repetirá la revisión final en modo solo lectura.

No hagas commit.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/05-notificaciones-email-idempotencia/04-respuesta-claude-revision-correccion-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/05-prompt-codex-revision-final-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/06-respuesta-codex-revision-final-outbox-idempotencia.md`
* `docs/TESTING.md`
* `scripts/run-tests.ts`

Inspecciona completamente:

* `src/domains/billing/billing-outbox.service.ts`
* `src/domains/billing/billing-outbox-policy.ts`
* `src/domains/billing/billing.service.ts`
* `src/domains/notifications/notification.service.ts`
* `src/lib/email.ts`
* `tests/billing-outbox-idempotency.test.ts`
* `tests/unit/billing-outbox-policy.test.ts`
* `tests/billing-cron-atomicity.test.ts`

La fuente de verdad es el código actual y el informe 06 de Codex.

# 1. Alcance estricto

Corrige únicamente:

1. Los seams mínimos necesarios para provocar las ventanas reales.
2. Las pruebas de integración necesarias para cerrar R-01.
3. Pruebas puras solo si una corrección lo exige.
4. Documentos 07 y 08.

No cambies:

* Schema.
* Migración.
* Política de estados.
* Dedupe key.
* Backoff.
* Límite de intentos.
* Resumen.
* Autenticación.
* Rutas.
* UI.
* Contratos públicos.
* Servicios que ya funcionan.

Si una prueba revela un defecto funcional real:

1. Documenta el hallazgo.
2. Clasifícalo.
3. Corrígelo únicamente si es crítico, alto o medio y pertenece al outbox.
4. Añade la regresión correspondiente.
5. No amplíes el alcance.

# 2. Estado inicial

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

* HEAD sigue siendo:

```text
b924f64 feat(billing): make overdue cron atomic and concurrency-safe
```

* No hay staged diff.
* Los únicos cambios pendientes corresponden a la Fase 2P/2Q y documentos 01–08.
* No hay cambios nuevos en `.env`, `.env.test`, package files o migraciones históricas.
* Schema y migración nueva no deben modificarse en esta corrección salvo que una prueba revele una divergencia funcional bloqueante.

# 3. Hallazgo R-01

Codex marcó como ausentes o insuficientes estos cinco escenarios:

1. Dos dispatchers concurrentes sobre una fila IN_APP.
2. Crash después de crear Notification y antes de finalizar el outbox.
3. Crash después de persistir `providerAttemptStartedAt` y antes del fetch.
4. Eliminación real del User destinatario.
5. Conflictos reales de EmailLog y BillingOutboxAttempt.

Además, la prueba actual de fencing debe fortalecerse:

* debe usar el camino real de recuperación;
* no debe sustituir la recuperación mediante updates directos.

Cierra todos estos puntos.

# 4. Seam post-marcador y pre-fetch

Actualmente se necesita una ventana determinista después de que:

```text
providerAttemptStartedAt
```

quede persistido y confirmado, pero antes de llamar a Resend.

Añade un seam test-only con un nombre explícito, por ejemplo:

```text
AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED
```

o un nombre equivalente coherente con el código.

Debe ejecutarse:

1. después del commit que persiste `providerAttemptStartedAt`;
2. antes de cualquier `fetch` al proveedor.

Requisitos:

* solo se ejecuta cuando `NODE_ENV === "test"`;
* no tiene entrada HTTP;
* puede dirigirse por `outboxId`;
* no usa sleeps;
* se limpia en `finally`, `afterEach` y `after`;
* no deja promesas pendientes;
* no modifica comportamiento de producción.

No reutilices un seam cuya posición semántica sea distinta.

# 5. Dos dispatchers concurrentes IN_APP

Añade una prueba real que:

1. Cree una única fila outbox IN_APP elegible.
2. Inicie dos llamadas reales a `dispatchBillingOutbox`.
3. Use una barrera determinista para que ambos seleccionen la misma fila antes del claim.
4. Libere ambos workers.
5. Compruebe que:

   * exactamente uno gana el claim;
   * el otro reporta claim perdido o no reclamado;
   * existe exactamente una Notification;
   * existe exactamente un efecto de auditoría asociado, cuando corresponda;
   * existe una sola finalización válida;
   * no existen dos attempts con el mismo número;
   * el outbox queda COMPLETED;
   * no quedan PROCESSING residuales.

No uses dos crons como sustituto de dos dispatchers.

No uses sleeps.

# 6. Crash después de Notification y antes de finalizar

Usa el seam real:

```text
AFTER_NOTIFICATION_CREATE
```

La prueba debe:

1. Crear y reclamar una intención IN_APP.
2. Ejecutar la creación real de Notification.
3. Lanzar una excepción desde `AFTER_NOTIFICATION_CREATE`, antes de finalizar el outbox.
4. Verificar el comportamiento real de la transacción.

Si Notification y finalización están en la misma transacción, el resultado esperado es:

* rollback de Notification;
* rollback de cualquier AuditLog de Notification;
* outbox no marcado COMPLETED;
* attempt no marcado COMPLETED;
* fila recuperable o correctamente clasificada según el servicio;
* un retry posterior crea exactamente una Notification y completa el outbox.

La prueba debe demostrar la atomicidad real. No aceptes una Notification insertada mediante setup manual como sustituto.

# 7. Crash post-marcador y pre-fetch

Usa el nuevo seam post-marcador.

La prueba debe:

1. Reclamar una intención EMAIL.
2. Crear/reutilizar EmailLog.
3. Persistir y confirmar `providerAttemptStartedAt`.
4. Lanzar una excepción desde el nuevo seam antes del fetch.
5. Comprobar que:

   * `fetch` fue llamado cero veces;
   * la fila permanece con evidencia durable de frontera cruzada;
   * al vencer el lease, la recuperación real la convierte en DELIVERY_UNKNOWN;
   * no vuelve a PENDING;
   * una corrida posterior no llama al proveedor;
   * EmailLog y Attempt reflejan el resultado conservador;
   * el resumen cuenta DELIVERY_UNKNOWN;
   * no queda retry automático.

No simules la frontera mediante un update directo del test.

# 8. Fencing con recuperación real

Fortalece o reemplaza la prueba actual del worker tardío.

Escenario obligatorio:

1. Worker A reclama una fila EMAIL.
2. Worker A persiste la frontera.
3. Worker A realiza un fetch mockeado exitoso y queda detenido antes de finalizar.
4. El reloj controlado avanza más allá del lease.
5. Un segundo flujo ejecuta la función real de recuperación del outbox.
6. La recuperación real marca DELIVERY_UNKNOWN.
7. Worker A continúa e intenta finalizar como COMPLETED/SENT.
8. El CAS final de A pierde.

Comprueba:

* outbox permanece DELIVERY_UNKNOWN;
* A no sobrescribe el estado;
* `completedEmail` no aumenta para A;
* EmailLog no termina afirmando SENT;
* el attempt conserva un resultado coherente;
* no existe retry posterior;
* no se ejecuta un segundo fetch;
* no hay PROCESSING residual.

No uses updates directos como sustituto de la recuperación.

# 9. Eliminación real del User

Añade una prueba que elimine realmente de PostgreSQL al User destinatario después de crear la intención y antes del despacho.

Debe comprobar:

* FK `recipientUserId` aplica realmente `SET NULL`;
* la fila outbox se conserva;
* `recipientUserId` queda null;
* dispatcher no llama al proveedor;
* no crea Notification;
* finaliza en el estado explícito previsto, normalmente FAILED_FINAL;
* incrementa `noValidRecipient`;
* EmailLog/Attempt quedan coherentes;
* no filtra el email eliminado;
* el lote continúa con otras filas.

No reemplaces la eliminación con:

```text
recipientUserId = null
```

ejecutado directamente por el test.

# 10. Conflicto real de EmailLog

Añade una prueba concurrente o de restricción real que demuestre:

* máximo un EmailLog por `outboxId`;
* máximo una fila por `dedupeKey`;
* dos workers no crean dos EmailLogs;
* el worker perdedor reutiliza o detecta correctamente la fila existente;
* no aparece un error no controlado por unique;
* el outbox conserva un resultado coherente.

Debe ejercer la restricción real de PostgreSQL, no solo inspeccionar el schema.

# 11. Conflicto real de BillingOutboxAttempt

Añade una prueba que ejerza realmente:

```text
@@unique([outboxId, attemptNumber])
```

Debe comprobar uno de estos enfoques:

## Enfoque concurrente preferido

* dos claims compiten por el mismo outbox y attemptNumber;
* solo una transacción confirma;
* la otra pierde el CAS o revierte;
* no quedan dos attempts.

## Enfoque de conflicto controlado

* se provoca un unique conflict real durante la creación del Attempt;
* claim y Attempt están en una misma transacción;
* el claim revierte;
* el outbox no queda PROCESSING;
* `attemptCount` no queda incrementado sin Attempt;
* un intento posterior limpio funciona.

No basta con contar filas después de una ejecución normal.

# 12. Mapeo de cobertura

Actualiza el mapeo de los 28 requisitos originales.

Los siguientes deben pasar de AUSENTE/MATIZ a CUBIERTO:

* requisito 4: dos dispatchers IN_APP;
* requisito 6: crash tras Notification;
* requisito 8: crash post-marcador pre-fetch;
* requisito 10: worker tardío mediante recuperación real;
* requisito 13: eliminación real de User;
* requisito 26: unique real de EmailLog y Attempt.

Para cada uno indica:

* nombre exacto de la prueba;
* seam utilizado;
* ventana provocada;
* aserciones principales.

No declares cubierto un requisito si la prueba no ejecuta el camino productivo real.

# 13. Conteo esperado

La línea base actual es:

* 219 pruebas puras.
* 353 pruebas totales.
* 12 escenarios en `billing-outbox-idempotency.test.ts`.

Después de esta corrección, reporta el conteo real.

No ajustes las pruebas para alcanzar un número predeterminado.

Explica exactamente:

* pruebas nuevas;
* pruebas reemplazadas;
* pruebas fortalecidas;
* total puro;
* total integración;
* total suite.

# 14. Archivos permitidos

Puedes modificar únicamente:

```text
src/domains/billing/billing-outbox.service.ts
tests/billing-outbox-idempotency.test.ts
```

Y, solo si es estrictamente necesario para el registro/reset del seam:

```text
src/domains/billing/billing.service.ts
```

También puedes crear o modificar:

```text
docs/programa-mejora/05-notificaciones-email-idempotencia/07-prompt-claude-correccion-cobertura-outbox.md
docs/programa-mejora/05-notificaciones-email-idempotencia/08-respuesta-claude-correccion-cobertura-outbox.md
```

No modifiques:

* `prisma/schema.prisma`;
* la migración;
* `billing-outbox-policy.ts`;
* `notification.service.ts`;
* `email.ts`;
* pruebas históricas;
* package files;
* entorno.

Si una prueba revela un defecto real que exige otro archivo, documenta la necesidad antes de tocarlo.

# 15. Ejecución segura

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

No modifiques el runner, guard ni entorno.

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

# 16. Limpieza

Antes y después confirma:

* conteos básicos iguales;
* cero outbox residual;
* cero attempts;
* cero PROCESSING;
* cero DELIVERY_UNKNOWN de pruebas;
* cero Notifications de prueba;
* cero EmailLogs de prueba;
* cero usuarios de prueba;
* cero fixtures cron/billing;
* cero WebhookEvent;
* cero emails reales;
* cero Mercado Pago real;
* variables restauradas;
* seams reseteados;
* barreras liberadas;
* `.env` intacto;
* `.env.test` ignorado.

# 17. Criterios de aceptación

R-01 solo queda cerrado si:

1. Existe una prueba real de dos dispatchers IN_APP.
2. Existe una prueba real de rollback tras Notification.
3. Existe un seam post-marcador/pre-fetch.
4. Existe una prueba real de crash en esa ventana.
5. El fencing usa recuperación real.
6. Existe una eliminación real de User.
7. FK SetNull se demuestra en PostgreSQL.
8. Existe un conflicto real de EmailLog.
9. Existe un conflicto real de Attempt.
10. Claim revierte si Attempt falla.
11. No se modifica schema.
12. No se modifica migración.
13. Typecheck pasa.
14. Lint pasa.
15. Puras pasan.
16. Suite completa pasa.
17. No existen skips en los archivos del outbox.
18. Fixtures quedan limpios.
19. No se envían emails reales.
20. No se llama Mercado Pago real.
21. No se hace commit.

# 18. Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado inicial de Git.
3. Alcance aplicado.
4. R-01.
5. Seam añadido.
6. Dos dispatchers IN_APP.
7. Rollback tras Notification.
8. Crash post-marcador/pre-fetch.
9. Fencing con recuperación real.
10. Eliminación real del User.
11. Conflicto real de EmailLog.
12. Conflicto real de Attempt.
13. Mapeo actualizado de requisitos.
14. Archivos modificados.
15. Schema y migración intactos.
16. Pruebas añadidas o fortalecidas.
17. Conteos.
18. Compatibilidad.
19. Procedimiento seguro.
20. Comandos ejecutados.
21. Resultados.
22. Limpieza.
23. Hallazgos funcionales descubiertos, si los hubo.
24. Riesgos restantes.
25. Recomendación para Codex.
26. Estado:

* CORREGIDO.
* CORREGIDO CON RIESGOS.
* BLOQUEADO.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/08-respuesta-claude-correccion-cobertura-outbox.md`

2. Confirma que el prompt quedó guardado en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/07-prompt-claude-correccion-cobertura-outbox.md`

3. No hagas commit.

4. No hagas push.

5. No crees tags.

6. No inicies otra subfase.

7. Detente después del informe.
