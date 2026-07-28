# FASE 2R — REVISIÓN FINAL DEL OUTBOX DE NOTIFICACIONES Y EMAILS

## Documentación automática

Antes de comenzar:

1. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/05-prompt-codex-revision-final-outbox-idempotencia.md`

2. Guarda allí el contenido completo y exacto de este prompt.

Al terminar:

3. Crea:

`docs/programa-mejora/05-notificaciones-email-idempotencia/06-respuesta-codex-revision-final-outbox-idempotencia.md`

4. Guarda allí el informe final completo, exactamente como lo entregas al usuario.

Solo puedes crear o modificar estos dos documentos.

No modifiques código, pruebas, schema, migración, configuración ni documentos 01–04.

---

Actúa como revisor técnico independiente especializado en:

* PostgreSQL.
* Prisma.
* Transactional outbox.
* Idempotencia.
* Procesamiento concurrente.
* Semántica de entrega de email.
* Recuperación ante crashes.
* Fencing.
* Migraciones aditivas.
* Auditoría y trazabilidad.

Codex implementó inicialmente el outbox en la Fase 2P. Claude realizó después una revisión adversarial y corrección directa en la Fase 2Q.

Debes revisar el estado final en modo **solo lectura** y decidir si puede convertirse en commit.

No apruebes únicamente porque las pruebas estén verdes.

## Documentos obligatorios

Lee completamente:

* `docs/programa-mejora/05-notificaciones-email-idempotencia/01-prompt-codex-implementacion-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/02-respuesta-codex-implementacion-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/03-prompt-claude-revision-correccion-outbox-idempotencia.md`
* `docs/programa-mejora/05-notificaciones-email-idempotencia/04-respuesta-claude-revision-correccion-outbox-idempotencia.md`
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
* `src/domains/notifications/notification.service.ts`
* `src/lib/email.ts`
* `tests/unit/billing-outbox-policy.test.ts`
* `tests/billing-outbox-idempotency.test.ts`
* `tests/billing-cron-atomicity.test.ts`

La fuente de verdad es el código, el SQL, el diff y las pruebas actuales.

## Restricciones

Esta es una revisión de solo lectura.

No debes:

* Modificar implementación.
* Modificar pruebas.
* Modificar schema.
* Modificar migración.
* Crear otra migración.
* Usar `db push`.
* Aplicar migraciones al entorno normal.
* Modificar `.env`.
* Modificar `.env.test`.
* Modificar package files.
* Modificar runner o guard.
* Enviar emails reales.
* Llamar a Mercado Pago real.
* Ejecutar build.
* Levantar servidor.
* Hacer commit.
* Hacer push.
* Crear tags.
* Iniciar otra subfase.

Puedes:

* Ejecutar comandos Git de lectura.
* Ejecutar Prisma validate/generate.
* Validar la migración en el entorno protegido.
* Ejecutar typecheck y lint.
* Ejecutar pruebas puras.
* Ejecutar la suite mediante el runner seguro.
* Consultar conteos antes y después.

# 1. Estado inicial

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

* HEAD es:

```text
b924f64 feat(billing): make overdue cron atomic and concurrency-safe
```

* No existe commit nuevo.
* No hay staged diff.
* Los cambios pendientes corresponden únicamente a:

  * schema;
  * migración nueva;
  * servicios de outbox;
  * integración con cron;
  * Notification;
  * EmailLog/Resend;
  * pruebas;
  * documentos 01–06.
* Migraciones históricas intactas.
* `.env`, `.env.test`, package files, runner y guard intactos.

Si existe un cambio inesperado, marca `REQUIERE CORRECCIONES` o `RECHAZADA` según gravedad. No lo modifiques.

# 2. Verificación de la revisión de Claude

Crea una tabla con:

* afirmación;
* estado:

  * CONFIRMADA;
  * CONFIRMADA CON MATICES;
  * INCORRECTA;
  * NO DEMOSTRADA;
* evidencia;
* riesgo;
* ¿bloquea commit?;
* ¿bloquea producción?

Verifica:

1. No hay defectos críticos, altos ni medios.
2. Schema y migración coinciden.
3. Outbox es durable.
4. Outbox se crea atómicamente con la transición.
5. IN_APP es efectivamente exactly-once.
6. EMAIL no se presenta falsamente como exactly-once.
7. Claim y attempt son atómicos.
8. La frontera del proveedor se persiste antes del fetch.
9. No hay transacción DB abierta durante Resend.
10. DELIVERY_UNKNOWN nunca se reenvía.
11. Un worker tardío no sobrescribe DELIVERY_UNKNOWN.
12. Solo existe un camino de envío.
13. La corrida sin transiciones drena pendientes.
14. No se almacena PII en dedupe/payload.
15. Las pruebas añadidas cubren las ventanas de crash obligatorias.
16. No hubo llamadas reales a proveedores.

# 3. Schema

Revisa los cuatro enums nuevos y los modelos:

* `BillingNotificationOutbox`.
* `BillingOutboxAttempt`.
* `Notification`.
* `EmailLog`.

Confirma:

## Outbox

* `dedupeKey` único.
* Longitud suficiente.
* Status con default seguro.
* `attemptCount` con default.
* `nextAttemptAt` no nulo.
* Campos de lease.
* Frontera del proveedor.
* Timestamps.
* Error code acotado.
* Payload sanitizado.
* Índice de dispatch.
* Relaciones consistentes.

## Attempt

* Unique `(outboxId, attemptNumber)`.
* Relación correcta.
* Intento y resultado trazables.
* Provider ID acotado.
* Sin payload sensible.

## Notification

* `dedupeKey` nullable y único.
* Múltiples null históricos permitidos.
* La clave incluye destinatario dentro del hash.
* No deduplica dos usuarios diferentes.

## EmailLog

* `dedupeKey` nullable y único.
* `outboxId` nullable y único.
* Máximo un EmailLog por intención.
* Datos históricos compatibles.
* `updatedAt` correctamente agregado.
* No se guarda respuesta completa del proveedor.

## Foreign keys

Analiza:

* Tenant/Subscription con Cascade.
* Recipient con SetNull.
* EmailLog outbox con SetNull.
* Attempt con Cascade.

Confirma que no se destruye evidencia operacional relevante en escenarios normales.

# 4. Migración

Lee línea por línea:

`prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql`

Confirma:

* Enums creados antes de usarlos.
* Nuevos valores de `EmailLogStatus` compatibles.
* No usa valores añadidos de enum dentro de una operación incompatible.
* Columnas históricas nullable o con backfill.
* `updatedAt` se rellena antes de `NOT NULL`.
* Uniques correctos.
* Índices correctos.
* Foreign keys correctas.
* No hay casts destructivos.
* No hay borrado de datos.
* No modifica migraciones históricas.

Compara Prisma schema contra SQL.

Ejecuta, usando procedimientos seguros:

```text
npx prisma validate
npx prisma generate
```

Valida:

* todas las migraciones desde cero en un esquema temporal;
* migración sobre el baseline protegido;
* índices y constraints;
* eliminación del esquema temporal al terminar.

No uses `db push`.

# 5. Dedupe key

Revisa:

```text
buildBillingOutboxDedupeKey
```

Confirma que cambia por:

* Subscription.
* Event.
* Boundary.
* Recipient.
* Channel.

Confirma:

* mismo evento → misma clave;
* transición distinta → clave distinta;
* destinatario distinto → clave distinta;
* canal distinto → clave distinta;
* ISO estable;
* boundary inválido rechazado;
* SHA-256;
* prefijo versionado;
* longitud < 255;
* sin IDs, emails o nombres en claro;
* serialización no ambigua.

Evalúa el separador `|` y el riesgo N-03.

# 6. Creación atómica

Reconstruye `processCronCandidate`.

Orden esperado dentro de una sola transacción:

1. Relectura.
2. Decisión.
3. CAS de Subscription.
4. Tenant.
5. AuditLog.
6. Recipients.
7. Outbox.
8. Commit.

Confirma:

* fallo en outbox revierte Subscription/Tenant/AuditLog;
* fallo parcial entre canales revierte todo;
* unique conflict se maneja sin duplicar;
* sin recipients confirma la transición;
* `transitionsWithoutRecipients` se incrementa;
* cero outbox inventado.

Lee la prueba real de rollback.

# 7. Destinatarios

Confirma:

* se seleccionan ADMIN activos dentro de la transacción;
* solo se almacena `recipientUserId`;
* email se relee al despachar;
* usuario inactivo → estado final controlado;
* usuario eliminado → FK SetNull y estado final controlado;
* no se envía a un email obsoleto;
* no se filtra email en resumen o errores.

# 8. Selección de outbox

Reconstruye:

* PENDING.
* FAILED_RETRYABLE vencido.
* PROCESSING abandonado.

Confirma:

* COMPLETED no elegible;
* FAILED_FINAL no elegible;
* DELIVERY_UNKNOWN no elegible;
* PROCESSING vigente no elegible;
* orden por `nextAttemptAt`, `createdAt`, `id`;
* límite 100;
* una fila máximo una vez por corrida;
* nulls sin ambigüedad.

# 9. Claim y attempt

Revisa el CAS del claim:

* id;
* status;
* attemptCount;
* lockedAt;
* nextAttemptAt.

Confirma:

* claim y creación de attempt en la misma transacción;
* `attemptCount` incrementado una sola vez;
* attemptNumber correcto;
* unique evita intentos repetidos;
* fallo creando attempt revierte claim;
* no queda PROCESSING incoherente.

Analiza dos workers sobre:

* PENDING;
* FAILED_RETRYABLE;
* PROCESSING abandonado.

# 10. IN_APP exactly-once

Revisa:

* `createNotificationIdempotent`;
* unique real;
* `createMany(skipDuplicates)`;
* finalización de outbox;
* finalización de attempt;
* AuditLog de Notification, si aplica.

Confirma que Notification y finalización del outbox son atómicas.

## Crash

Analiza:

1. Notification creada.
2. Proceso cae antes de finalizar.
3. Lease expira.
4. Otro worker recupera.

Confirma:

* no hay duplicado;
* la Notification existente se reconoce;
* outbox termina COMPLETED;
* attempt queda coherente.

Determina si la prueba existente provoca realmente esa ventana o si la atomicidad elimina la ventana por diseño.

# 11. Frontera del proveedor

Reconstruye con precisión:

1. Claim.
2. EmailLog.
3. Transacción corta para `providerAttemptStartedAt`.
4. Commit.
5. Fetch a Resend.
6. Persistencia del resultado.
7. Finalización.

Confirma:

* frontera persistida antes del fetch;
* transacción cerrada antes de fetch;
* no se mantiene cliente transaccional durante red;
* caída antes de frontera es recuperable;
* caída después de frontera no es reintentable;
* caída después del fetch es unknown.

# 12. Clasificación de email

Verifica en código la matriz:

* API key ausente → FAILED_FINAL.
* Email deshabilitado → FAILED_FINAL.
* Email inválido → FAILED_FINAL.
* Recipient unavailable → FAILED_FINAL.
* 400/401/403 → FAILED_FINAL.
* 408/425/429/5xx → FAILED_RETRYABLE.
* Timeout → DELIVERY_UNKNOWN.
* Error de red → DELIVERY_UNKNOWN.
* 2xx ilegible → DELIVERY_UNKNOWN.
* 2xx sin provider ID → DELIVERY_UNKNOWN.
* 2xx con provider ID → SENT.

Confirma:

* códigos sanitizados;
* provider ID truncado;
* sin cuerpo completo;
* sin payload completo;
* máximo cinco intentos.

Evalúa especialmente 5xx como retry seguro según el helper real.

# 13. DELIVERY_UNKNOWN

Confirma:

* no se selecciona;
* no vuelve a PENDING;
* no se procesa automáticamente;
* no se convierte automáticamente en FAILED o SENT;
* EmailLog y Attempt conservan trazabilidad;
* resumen lo cuenta;
* puede localizarse operacionalmente sin PII.

Busca globalmente cualquier escritura que modifique DELIVERY_UNKNOWN.

# 14. Recovery y fencing

## Antes del provider

* lease vencido;
* vuelve a PENDING;
* nuevo claim posible.

## Después del provider

* pasa a DELIVERY_UNKNOWN;
* no se llama proveedor nuevamente.

## Worker tardío

Reconstruye la prueba añadida por Claude:

1. Worker A obtiene respuesta exitosa.
2. Antes de finalizar, recuperación marca DELIVERY_UNKNOWN.
3. A intenta finalizar.
4. CAS de A pierde.

Confirma:

* A no sobrescribe unknown;
* Outbox permanece DELIVERY_UNKNOWN;
* EmailLog no afirma SENT;
* resumen no cuenta completedEmail;
* no hay retry.

Verifica si `(status, attemptCount)` es fencing suficiente.

# 15. Intentos y backoff

Confirma:

* attemptCount aumenta al claim.
* Máximo cinco claims/intentos.
* Intento 1: 15 minutos.
* Intento 2: 30 minutos.
* Intento 3: 60 minutos.
* Intento 4: 120 minutos.
* Intento 5: 240 minutos.
* Tope de 24 horas.
* `now` controlado.
* Sin sleeps.
* Sin retry en la misma ejecución.

Evalúa N-01:

> abandono pre-provider consume intento.

Clasifica si es aceptable o bloqueante.

# 16. Dispatcher

Confirma:

* máximo 100;
* procesamiento secuencial o controlado;
* error de una fila no aborta otras;
* corridas sin transiciones procesan pendientes;
* DELIVERY_UNKNOWN no consume lote repetidamente;
* FAILED_FINAL no consume lote;
* backoff evita que fallos reintentables bloqueen nuevas filas;
* no existe starvation grave.

Evalúa la cadencia del cron y riesgo de backlog.

# 17. Un solo camino de envío

Busca globalmente:

```text
notifyTenantAdminsOfLicenseChange
sendEmailSafe
appliedTenantIds
createNotification
sendBillingOutboxEmail
dispatchBillingOutbox
```

Clasifica todas las referencias.

Confirma que para transiciones de billing solo existe:

```text
transición → outbox → dispatcher
```

Los emails no relacionados con billing pueden seguir usando el servicio anterior.

# 18. Resumen

Reconstruye:

## `outboxCreation`

* activeRecipients.
* planned.
* created.
* transitionsWithoutRecipients.

## `outboxDispatch`

* eligible.
* claimed.
* processed.
* completedInApp.
* completedEmail.
* internalDuplicates.
* skippedConcurrentClaim.
* retriesScheduled.
* failedFinal.
* deliveryUnknown.
* noValidRecipient.
* providerAttempts.
* inAppAttempts.
* emailAttempts.
* notificationTenantsAttempted.
* errors.
* errorDetails.
* truncamiento.

Confirma:

* sin emails;
* sin nombres;
* sin provider payload;
* sin stack;
* sin secretos;
* compatibilidad con campos antiguos del cron y UI.

# 19. Autenticación

Confirma:

* no hay ruta nueva;
* cron sigue fail-closed;
* super-admin sigue autorizado;
* dispatcher no es invocable desde input HTTP arbitrario;
* overrides de test solo con `NODE_ENV=test`;
* no se exponen opciones de outbox.

# 20. Seams

Revisa los ocho seams.

Confirma:

* solo test;
* sin HTTP;
* reset;
* cleanup;
* dirigibles por outbox;
* sin sleeps;
* sin promesas pendientes;
* barreras liberadas ante errores;
* reproducen las ventanas declaradas.

# 21. Pruebas

Explica:

* 219 pruebas puras.
* 12 escenarios en `billing-outbox-idempotency.test.ts`.
* 353 pruebas totales.

Verifica la aritmética:

```text
353 - 326 = 27
```

Determina exactamente cuántas pruebas nuevas existen en:

* unitarias;
* integración;
* otros archivos modificados.

No apruebes una discrepancia no explicada.

## Cobertura obligatoria

Revisa la tabla de 28 requisitos del informe 04.

No aceptes como “cubierto” un requisito si la prueba no provoca realmente la ventana.

Atención especial a:

* crash tras Notification;
* dos crons vs dos dispatchers;
* unique real de Attempt;
* caída después de frontera antes del fetch;
* caída después del fetch antes de persistir;
* worker tardío;
* EmailLog unique;
* usuario eliminado;
* detalles truncados.

Clasifica cada requisito:

* CUBIERTO.
* CUBIERTO CON MATICES.
* AUSENTE.

# 22. Riesgos N-01 a N-05

Crea una tabla:

| ID | Riesgo | Severidad real | Aceptable | Bloquea commit | Bloquea producción |
| -- | ------ | -------------- | --------- | -------------- | ------------------ |

Incluye:

* N-01: abandono pre-provider consume intento.
* N-02: `lockedAt` usa now de la corrida.
* N-03: separador `|`.
* N-04: 5xx retryable.
* N-05: `externalEffects.emailFailed` aproximado.

Añade cualquier riesgo nuevo.

# 23. Ejecución segura

Ejecuta primero:

```text
npm test
```

Debe abortar antes de Prisma.

Después ejecuta, según shell:

```bash
env DATABASE_URL= DIRECT_URL= npm test
```

o el procedimiento PowerShell autorizado.

Ejecuta además:

```text
npx prisma validate
npx prisma generate
npx tsc --noEmit
npm run lint
node --import tsx --test tests/unit/*.test.ts
```

Valida migraciones de forma segura.

No reintentes automáticamente un fallo lógico.

# 24. Limpieza

Antes y después confirma:

* conteos básicos iguales;
* cero outbox residual;
* cero attempts;
* cero PROCESSING;
* cero DELIVERY_UNKNOWN de pruebas;
* cero fixtures cron;
* cero fixtures billing;
* cero WebhookEvent;
* cero usuarios de prueba;
* cero emails reales;
* cero Mercado Pago real;
* variables restauradas;
* hooks reseteados;
* esquema temporal eliminado;
* `.env` intacto;
* `.env.test` ignorado.

# 25. Compatibilidad

Confirma que siguen verdes:

* Payment idempotente.
* Precedencia.
* Cobertura.
* Reactivación.
* Cuarentena.
* Cron CAS.
* Atomicidad.
* Starvation.
* Autenticación.
* Invitaciones.
* Permisos.
* Super-admin.
* UI.
* Guard de pruebas.

# 26. Alcance del eventual commit

Si apruebas, entrega lista exacta.

## Schema y migración

```text
prisma/schema.prisma
prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql
```

## Implementación

```text
src/domains/billing/billing.service.ts
src/domains/billing/billing-outbox-policy.ts
src/domains/billing/billing-outbox.service.ts
src/domains/notifications/notification.service.ts
src/lib/email.ts
```

## Pruebas

Incluye exactamente los archivos modificados o creados de esta subfase, entre ellos:

```text
tests/unit/billing-outbox-policy.test.ts
tests/billing-outbox-idempotency.test.ts
tests/billing-cron-atomicity.test.ts
```

Confirma si existe otro archivo de pruebas modificado.

## Documentación

Todos los `.md` de:

```text
docs/programa-mejora/05-notificaciones-email-idempotencia/
```

No incluir:

* `.env`.
* `.env.test`.
* package files.
* migraciones históricas.
* temporales.
* logs.
* archivos generados no versionados.
* cambios ajenos.

Entrega comandos `git add` explícitos, pero no los ejecutes.

# 27. Mensaje de commit

Si apruebas, propone:

```text
feat(billing): add durable notification outbox
```

# Hallazgos

Para cada hallazgo nuevo incluye:

* ID.
* Severidad.
* Archivo/símbolo.
* Comportamiento.
* Impacto.
* Evidencia.
* Corrección mínima.
* Prueba requerida.
* ¿Bloquea commit?
* ¿Bloquea producción?

# Criterios de aprobación

La subfase solo puede aprobarse si:

1. Schema y migración coinciden.
2. Migración es aditiva.
3. Outbox es durable.
4. Creación es atómica.
5. Dedupe real.
6. Notification exactly-once efectiva.
7. EmailLog único por intención.
8. Claim e intento atómicos.
9. No hay DB transaction durante fetch.
10. Frontera persistida antes de fetch.
11. Crash pre-provider recuperable.
12. Crash post-frontera no se reenvía.
13. Crash post-fetch queda unknown.
14. Worker tardío no sobrescribe unknown.
15. Unknown no es retryable.
16. Retry/backoff correctos.
17. Máximo cinco intentos.
18. Dos workers máximo un efecto.
19. Corrida sin transiciones drena pendientes.
20. Un solo camino de envío.
21. Resumen sin PII.
22. Auth segura.
23. Migración valida desde cero.
24. Prisma genera.
25. Typecheck pasa.
26. Lint pasa.
27. Puras pasan.
28. Suite completa pasa.
29. No existen skips en los archivos de esta fase.
30. Fixtures limpios.
31. No se envían emails reales.
32. No se llama Mercado Pago real.
33. No hay hallazgos críticos, altos o medios abiertos.

# Informe final

Entrega:

1. Resumen ejecutivo.
2. Estado de Git.
3. Alcance del diff.
4. Verificación de Claude.
5. Schema.
6. Migración.
7. Dedupe key.
8. Creación atómica.
9. Destinatarios.
10. Selección.
11. Claim.
12. Intentos.
13. IN_APP.
14. EmailLog.
15. Frontera del proveedor.
16. Clasificación.
17. DELIVERY_UNKNOWN.
18. Recovery.
19. Fencing.
20. Backoff.
21. Dispatcher.
22. Camino único.
23. Resumen.
24. Autenticación.
25. Seams.
26. Conteo de pruebas.
27. Cobertura de requisitos.
28. Riesgos N-01…N-05.
29. Compatibilidad.
30. Ejecución.
31. Limpieza.
32. Hallazgos.
33. Riesgos aceptados.
34. Lista para commit.
35. Comandos `git add`.
36. Mensaje de commit.
37. Recomendación.
38. Veredicto:

* APROBADA.
* APROBADA CON RIESGOS MENORES.
* REQUIERE CORRECCIONES.
* RECHAZADA.

## Finalización

1. Guarda el informe en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/06-respuesta-codex-revision-final-outbox-idempotencia.md`

2. Confirma que guardaste el prompt en:

`docs/programa-mejora/05-notificaciones-email-idempotencia/05-prompt-codex-revision-final-outbox-idempotencia.md`

3. No modifiques código.

4. No hagas commit.

5. No hagas push.

6. No crees tags.

7. No inicies otra subfase.

8. Detente después del informe.
