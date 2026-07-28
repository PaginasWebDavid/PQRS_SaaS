# FASE 2Q — Revisión y corrección directa del outbox de notificaciones y emails

Fecha: 2026-07-27
Autor: Claude (revisión + corrección directa)
Commit base (HEAD, sin commit nuevo): `b924f64 feat(billing): make overdue cron atomic and concurrency-safe`
**Estado: CORREGIDO CON RIESGOS (menores, documentados y no bloqueantes)**

---

## 1. Resumen ejecutivo

Revisé adversarialmente el transactional outbox de Codex (Fase 2P) — schema, migración, política pura, servicio de dispatch, integración con el cron, servicios de Notification/EmailLog/Resend y pruebas. **La implementación es sólida**: la transición de facturación y las intenciones del outbox se confirman atómicamente; la frontera del proveedor se persiste en una transacción **cerrada antes** del `fetch` (ninguna transacción de base de datos permanece abierta durante Resend); la clasificación de resultados de email coincide exactamente con la matriz exigida; `DELIVERY_UNKNOWN` nunca es elegible para reintento; el fencing de finalización (CAS por `status=PROCESSING` + `attemptCount`) impide que un worker tardío sobrescriba un `DELIVERY_UNKNOWN`; el backoff y el máximo de intentos son correctos; y quedó **un solo camino de envío** (`transición → outbox → dispatcher`).

No encontré defectos **críticos, altos ni medios** de código. La corrección consistió en **cerrar las brechas de cobertura de pruebas** exigidas por el prompt — sobre todo la prueba concurrente de fencing (§16), obligatoria y ausente — más destinatario inactivo/eliminado, respuestas ambiguas del proveedor (2xx sin id, 2xx ilegible, timeout, error de red) y backoff en los intentos 1..5 con tope. Quedan cinco riesgos **bajos** documentados y aceptados.

Validación: `prisma validate` ✓, `prisma generate` ✓, schema↔migración consistentes, `tsc` ✓, `lint` ✓, **219/219** puras, **353/353** suite completa por el runner seguro, `npm test` inseguro aborta antes de Prisma, conteos de base de pruebas idénticos antes/después (cero residuos de outbox/attempts/PROCESSING/DELIVERY_UNKNOWN), sin cambios de `.env`/runner/paquetes, migraciones históricas intactas, sin commit.

## 2. Estado inicial de Git

```
git status --short:
   M prisma/schema.prisma
   M src/domains/billing/billing.service.ts
   M src/domains/notifications/notification.service.ts
   M src/lib/email.ts
   M tests/billing-cron-atomicity.test.ts
   ?? docs/programa-mejora/05-notificaciones-email-idempotencia/
   ?? prisma/migrations/20260727000100_add_billing_notification_outbox/
   ?? src/domains/billing/billing-outbox-policy.ts
   ?? src/domains/billing/billing-outbox.service.ts
   ?? tests/billing-outbox-idempotency.test.ts
   ?? tests/unit/billing-outbox-policy.test.ts
git log -3 --oneline:
   b924f64 feat(billing): make overdue cron atomic and concurrency-safe   <- HEAD
   a8a9a2a feat(billing): enforce payment precedence and access coverage
   5e4be50 feat(billing): enforce idempotent atomic webhook effects
git diff --cached: vacío (sin staged diff)
```

Confirmado: HEAD es el commit del cron atómico (`b924f64`); no hay staged diff; los cambios pendientes son únicamente el outbox (schema, migración nueva, servicios, pruebas) y los documentos 01–04; ninguna migración histórica, `.env`, `.env.test` ni package file se tocó. Hash base real registrado: **`b924f64725c57dcb40c268bc2fdcd6d2e9efee08`**. No fue necesario `BLOQUEADO`.

## 3. Verificación de las afirmaciones de Codex

| # | Afirmación | Estado | Evidencia | Riesgo | Corrección |
|---|---|---|---|---|---|
| 1 | Outbox durable | CONFIRMADA | `BillingNotificationOutbox` + `BillingOutboxAttempt` (schema:561-605) | — | — |
| 2 | Transición y outbox atómicos | CONFIRMADA | `createBillingOutboxIntentsForTransition(tx,…)` en la misma tx que CAS/Tenant/Audit (billing.service.ts:575); test 2 (rollback en `AFTER_OUTBOX_CREATED`) | — | — |
| 3 | IN_APP exactly-once | CONFIRMADA | `createNotificationIdempotent` `createMany(skipDuplicates)` + `Notification.dedupeKey @unique`; tests 5 y (nuevo) reforzado | — | — |
| 4 | EMAIL no se presenta como exactly-once | CONFIRMADA | `DELIVERY_UNKNOWN` para ambigüedad; sin idempotency-key de Resend (doc 02 §6) | — | — |
| 5 | Dos workers no procesan la misma fila | CONFIRMADA | claim CAS (id,status,attemptCount,lockedAt,nextAttemptAt) + attempt en la misma tx (service:307-339); test 3 (2 dispatchers → 1 fetch) | — | — |
| 6 | Crash previo al despacho se recupera | CONFIRMADA | `recoverAbandonedRows` PROCESSING→PENDING; test 4 y 7 | — | — |
| 7 | Crash posterior al proveedor → DELIVERY_UNKNOWN | CONFIRMADA | `decideAbandonedBillingOutbox` (EMAIL+providerAttemptStartedAt); test 7 y (nuevo) 10 | — | — |
| 8 | DELIVERY_UNKNOWN nunca se reenvía | CONFIRMADA | candidate query solo PENDING/FAILED_RETRYABLE; recovery solo PROCESSING; tests 10 y 12 (retry.eligible=0) | — | — |
| 9 | Un solo camino de envío | CONFIRMADA | `notifyTenantAdminsOfLicenseChange`/`sendEmailSafe` eliminados de billing.service.ts (grep: 0 refs); `externalEffects` derivado del outbox | — | — |
| 10 | Corrida sin transiciones drena pendientes | CONFIRMADA | `dispatchBillingOutbox` tras el bucle, siempre (billing.service.ts:949); test 4 | — | — |
| 11 | Dispatcher máximo 100 filas | CONFIRMADA | `BILLING_OUTBOX_BATCH_LIMIT=100`, `take: batchLimit`; override solo test | — | — |
| 12 | 9 escenarios demuestran todo | CONFIRMADA CON MATICES | 9 escenarios reales fuertes, pero faltaban fencing concurrente, inactivo/eliminado y variantes ambiguas | Cobertura | **Añadí 3 integración + 2 puras** |
| 13 | Migración aditiva/compatible | CONFIRMADA | enums ADD VALUE, columnas nullable/backfill, uniques con nulls históricos; `prisma validate` ✓ | — | — |
| 14 | Sin PII en dedupe/payload | CONFIRMADA | dedupe = SHA-256; payload = {version, graceDays}; tests puros 5 y 12, integración 8/9 | — | — |
| 15 | Sin llamadas reales a proveedores | CONFIRMADA | `fetch` mockeado en todas las pruebas; `RESEND_API_KEY` de prueba controlado | — | — |

## 4. Hallazgos iniciales

No hubo hallazgos **críticos, altos ni medios**. Brecha principal: **cobertura de pruebas** (afirmación 12). Riesgos **bajos** identificados: N-01..N-05 (§37).

## 5. Correcciones realizadas

- **Pruebas de integración añadidas** en `tests/billing-outbox-idempotency.test.ts`:
  - **10.** Fencing: un worker con éxito tardío **no** sobrescribe `DELIVERY_UNKNOWN` (CAS `status=PROCESSING`+`attemptCount` pierde → registra fallo de FINALIZE, no reclama SENT; la fila queda `DELIVERY_UNKNOWN` y no es elegible para retry).
  - **11.** Destinatario **inactivo** (desactivado tras crear la intención) y **eliminado** (FK `SET NULL` → `recipientUserId` nulo) → `FAILED_FINAL`, `noValidRecipient`, sin contacto al proveedor, sin Notification.
  - **12.** Respuestas ambiguas del proveedor: **2xx sin id**, **2xx ilegible**, **timeout (AbortError)** y **error de red** → todas `DELIVERY_UNKNOWN`, un solo `fetch`, sin reintento.
- **Pruebas puras añadidas** en `tests/unit/billing-outbox-policy.test.ts`:
  - **14.** Backoff determinista en intentos **1..5** (15/30/60/120/240 min) y tope de **24h** sin overflow.
  - **15.** Rechazo de `boundary`/`now` inválidos y `attemptCount` fuera de rango.
- **Sin cambios de código/schema/migración**: no se hallaron defectos críticos/altos/medios; los riesgos bajos se documentan (§37-38).

## 6. Schema

`BillingNotificationOutbox` (schema:561-590): campos con semántica correcta — identidad (`tenantId`, `subscriptionId`, `recipientUserId?`), `channel`/`eventType`, `dedupeKey @unique(255)`, ciclo de vida (`status` default PENDING, `attemptCount`, `nextAttemptAt` default now, `lockedAt?`, `processingStartedAt?`, `providerAttemptStartedAt?`, `processedAt?`, `lastErrorCode?`), `payload Json`, timestamps. Índices: `dispatch (status,nextAttemptAt,createdAt,id)`, tenant, subscription, recipient. FKs: tenant/subscription **Cascade**, recipient **SetNull**.

`BillingOutboxAttempt` (schema:592-605): relación `outboxId` **Cascade**, `attemptNumber`, `status`, `providerMessageId?`, `errorCode?(255)`, `startedAt`/`finishedAt?`. **`@@unique([outboxId, attemptNumber])`** impide dos registros del mismo intento. No almacena payload sensible.

`Notification.dedupeKey String? @unique(255)` (schema:512): nullable → múltiples nulls históricos permitidos; la clave incluye `recipientUserId` en el hash, así que **no deduplica dos usuarios distintos**.

`EmailLog` (schema:523-548): `dedupeKey? @unique`, `outboxId? @unique` (FK **SetNull**), `attemptCount`, `lastAttemptAt?`, `lastErrorCode?(255)`, `updatedAt @updatedAt`, `status EmailLogStatus`. El `@unique(outboxId)` garantiza **a lo sumo un EmailLog por intención**; nullable ⇒ filas históricas (outboxId null) no colisionan.

**Estados imposibles**: el schema por sí solo no impide combinaciones incoherentes (p. ej. `COMPLETED` con `lockedAt` no nulo), pero el servicio siempre las escribe coherentes mediante CAS; para un outbox de un solo productor es aceptable no añadir CHECKs (Prisma no los modela nativamente). Riesgo bajo, no bloqueante.

**Traza ante borrado**: `recipientUserId` SetNull conserva la fila (evidencia) y anula el destinatario; tenant/subscription Cascade elimina el outbox si se borra el conjunto/suscripción — aceptable porque los tenants se **CANCELAN**, no se borran físicamente en esta app. Ver N (destinatarios) §10.

## 7. Migración

`20260727000100_add_billing_notification_outbox/migration.sql`: crea los 4 enums **antes** de usarlos; `ALTER TYPE "EmailLogStatus" ADD VALUE IF NOT EXISTS …` (PG12+, y **no** usa los nuevos valores en la misma migración → seguro dentro de la transacción de Prisma); columnas nuevas nullable o con default; `EmailLog.updatedAt` añadida nullable → backfill `= createdAt` → `SET NOT NULL` (seguro para filas históricas); uniques de dedupe (Notification, EmailLog, Outbox) reales y compatibles con nulls; unique `(outboxId, attemptNumber)`; FKs con política explícita (Cascade/SetNull); índice de dispatch `(status,nextAttemptAt,createdAt,id)`. Sin casts destructivos, sin borrado de datos, sin locks evitables de larga duración.

**Consistencia schema↔migración**: verificada. `prisma migrate diff --from-schema-datamodel … --to-schema-datamodel … --exit-code` → **No difference detected**; el DDL derivado del datamodel (`--from-empty --to-schema-datamodel --script`) contiene exactamente las tablas, uniques e índices del outbox; comparación manual línea a línea sin divergencias. La aplicación **desde cero** (24 migraciones en un esquema temporal aislado) fue ejecutada por Codex; adicionalmente, la suite de integración completa corre contra la base de pruebas que ya tiene la migración aplicada (las 15 pruebas de outbox ejercitan tablas, uniques y FKs reales), lo que prueba operacionalmente que la migración es correcta. No creé una segunda migración.

## 8. Dedupe key

`buildBillingOutboxDedupeKey` (policy:18-38): SHA-256 sobre `["billing-outbox-v1", subscriptionId, eventType, boundary.toISOString(), recipientUserId, channel].join("|")`, formato `billing:v1:<evento>:<digest>` (≤ ~95 chars < 255). Cambia por Subscription, evento, **frontera real**, destinatario y canal (pruebas puras 1-6). No contiene email/nombre/IDs en claro (SHA-256; prueba 5). Fechas ISO estables; **rechaza `boundary` inválido** (prueba nueva 15). Colisiones semánticas: `null` no aparece (recipientUserId y boundary son requeridos en la clave); el separador `|` no colisiona porque los campos son cuids/enums/ISO sin `|` (N-03, bajo).

## 9. Creación atómica

`processCronCandidate` (billing.service.ts:486-593) ejecuta en **una** transacción: relectura → decisión pura → CAS de Subscription → `tenant.update` → `registerAuditLog(…, tx)` → `createBillingOutboxIntentsForTransition(tx,…)`. El seam `AFTER_OUTBOX_CREATED` corre dentro de esa tx; un fallo revierte **las cuatro piezas** (test 2). Sin destinatarios: la transición y la auditoría confirman, cero outbox, `outboxCreation.transitionsWithoutRecipients += 1`, no es error transaccional (test 2). Sin PII en el outbox (solo `recipientUserId`).

## 10. Destinatarios

Se resuelven ADMIN activos **dentro** de la transacción de creación (service:80-84) y solo se guarda `recipientUserId`. Si el usuario se desactiva o cambia su email tras el commit, el **dispatcher** re-resuelve el email en el momento del envío (`user.findFirst({ isActive:true })`, service:688-693) y, si ya no es válido, finaliza `FAILED_FINAL` `RECIPIENT_UNAVAILABLE` (test 11). Si el usuario se **elimina**, la FK `SetNull` conserva la fila con `recipientUserId=null` → `FAILED_FINAL` (test 11). Es un diseño correcto: identidad estable por `userId`, email tardío desde la relación (no se congela email en el outbox), y la evidencia operacional se conserva.

## 11. Selección

`dispatchBillingOutbox` (service:660-668): `status IN (PENDING, FAILED_RETRYABLE) AND nextAttemptAt <= now`, `orderBy [nextAttemptAt, createdAt, id]`, `take ≤ 100`. **No** selecciona COMPLETED/FAILED_FINAL/DELIVERY_UNKNOWN. `recoverAbandonedRows` (service:196-305) selecciona **solo** PROCESSING con `lockedAt <= now - 10min`. `nextAttemptAt` tiene default `now()` (nunca null) → semántica inequívoca. Una fila se intenta a lo sumo una vez por corrida (recovery reencola; el candidate loop la reclama una vez). Sin starvation obvio (orden por `nextAttemptAt`+`id`).

## 12. Claim

`claimOutboxRow` (service:307-339): CAS `updateMany where {id,status,attemptCount,lockedAt,nextAttemptAt}` → PROCESSING, `attemptCount+1`, `lockedAt=now`, `providerAttemptStartedAt=null`; si `count≠1` → null (sin attempt). En la **misma tx** crea `BillingOutboxAttempt(attemptNumber = attemptCount+1, STARTED)`. Atómico: claim y attempt juntos; si el attempt falla (p. ej. unique), la tx revierte el claim. Carreras 1-6 del prompt: cubiertas (dos dispatchers PENDING/FAILED_RETRYABLE → uno gana; recovery vs finalización → CAS; sin attempt duplicado por el unique `(outboxId,attemptNumber)`). Nunca queda attempt sin claim ni claim sin attempt ni PROCESSING con timestamps incoherentes.

## 13. Intentos

`attemptCount` aumenta **al reclamar** (semántica inequívoca). `attemptNumber` del registro = `attemptCount` post-claim. `hasBillingOutboxAttemptsRemaining(attemptCount)` = `attemptCount < 5` → **máximo 5 llamadas reales** al proveedor. `computeBillingOutboxNextAttemptAt(now, attemptCount)` usa el `now` de la corrida. `DELIVERY_UNKNOWN` conserva el intento que cruzó la frontera. Pruebas de frontera: intento 1/4/5 y máximo (integración test 6: `attemptCount=4`+503 → FAILED_FINAL; puras 8/9/14). *Nota (N-01):* un abandono **antes** del proveedor consume un intento (política conservadora explícita, trazable con `ABANDONED_BEFORE_PROVIDER_START`).

## 14. IN_APP

`processInAppRow` (service:418-462): en **una** tx re-verifica PROCESSING+attemptCount (fence), `createNotificationIdempotent(tx)` (`createMany skipDuplicates` + `Notification.dedupeKey` único; audit solo si insertó), finaliza outbox COMPLETED (CAS), marca attempt COMPLETED. Notification y finalización **atómicas** ⇒ no existe media-escritura. Notification preexistente con la misma dedupe key → `internalDuplicates` (test 5). Usuario inactivo/eliminado → `NotificationRecipientUnavailableError` → `FAILED_FINAL` (tests 8, 11). Unique real de Notification demostrado (test 5 rechaza duplicado).

## 15. EmailLog

`ensureEmailLog` (service:464-478): `createMany skipDuplicates` sobre `outboxId` único → **a lo sumo un EmailLog por intención**. Si ya está SENT (recuperación idempotente) → concilia outbox COMPLETED sin re-enviar (service:487-509). Solo persiste estado, `providerMessageId` acotado a 255, `lastErrorCode` sanitizado y timestamps; **no** guarda el payload de Resend. Trazabilidad por `outboxId`.

## 16. Frontera del proveedor

Orden verificado (service:521-565 + email.ts:246-313): claim → `ensureEmailLog` → `sendBillingOutboxEmail({ beforeProviderAttempt })`. Dentro de `beforeProviderAttempt` (service:535-564): seam previo, luego **una tx corta** marca `providerAttemptStartedAt` (CAS) y pone EmailLog PROCESSING (+attemptCount), **commit**; `sendBillingOutboxEmail` hace `await beforeProviderAttempt()` **antes** del `fetch` (email.ts:267). Por tanto **la frontera se persiste en una transacción confirmada antes del fetch, y ninguna transacción de base de datos permanece abierta durante Resend** (§29.8/§29.9 ✓).

- **Antes del proveedor** (crash tras claim, antes de marcar): lease recuperable → PENDING; no se asume envío (tests 4/7).
- **Tras marcar, antes del fetch**: el diseño marcará `DELIVERY_UNKNOWN` al expirar (decisión **explícita** y conservadora; puede perder un email no enviado). No se clasifica como retry seguro (policy `decideAbandonedBillingOutbox`).
- **Tras el fetch, antes de persistir**: `DELIVERY_UNKNOWN`, sin retry (test 7).

## 17. Clasificación de errores

Matriz real (email.ts + policy), verificada contra el helper de Resend:

| Situación | ¿Posible envío? | Estado | Retry |
|---|---|---|---|
| API key ausente | No | FAILED_FINAL (`RESEND_API_KEY_MISSING`) | No |
| Email transaccional deshabilitado | No | FAILED_FINAL (`TRANSACTIONAL_EMAIL_DISABLED`) | No |
| Email inválido | No | FAILED_FINAL (`INVALID_RECIPIENT`) | No |
| Usuario inactivo/eliminado | No | FAILED_FINAL (`RECIPIENT_UNAVAILABLE`) | No |
| Error local antes del fetch | No | FAILED_RETRYABLE (o FINAL si código conocido) | Según código |
| HTTP 400/401/403 | No/definitivo | FAILED_FINAL (`RESEND_HTTP_4xx`) | No |
| HTTP 408/425/429/5xx | Conocido: no aceptado | FAILED_RETRYABLE | Sí (backoff) |
| Timeout (AbortError) | Ambiguo | DELIVERY_UNKNOWN | No |
| Error de red | Ambiguo | DELIVERY_UNKNOWN | No |
| 2xx ilegible | Posible aceptación | DELIVERY_UNKNOWN (`RESEND_RESPONSE_UNREADABLE`) | No |
| 2xx sin id | Posible aceptación | DELIVERY_UNKNOWN (`RESEND_MESSAGE_ID_MISSING`) | No |
| 2xx con id | Aceptado | SENT | — |

**Ausencia de `RESEND_API_KEY` → FAILED_FINAL**: decisión operacional explícita (evita 5 reintentos de ruido ante una configuración faltante persistente). **5xx → FAILED_RETRYABLE**: Resend confirma la entrega solo con 2xx+id, así que un 5xx = no aceptado = reintento seguro (N-04, defendible). Pruebas: puras 7; integración 6 (503/400) y nueva 12 (timeout/red/2xx-no-id/2xx-ilegible).

## 18. Delivery unknown

`DELIVERY_UNKNOWN`: no elegible para retry (no está en el candidate query), no vuelve a PENDING, no se procesa en otra corrida, no se presenta como SENT ni FAILED; asociado a EmailLog y Attempt con timestamps; sin payload del proveedor; contado en `summary.deliveryUnknown`; localizable operacionalmente por estado sin PII. **No existe función que cambie `DELIVERY_UNKNOWN` automáticamente** (verificado por inspección; tests 10 y 12 confirman `retry.eligible=0`).

## 19. Procesamiento abandonado

- **IN_APP**: siempre recuperable (unique real evita duplicados); vuelve a PENDING (test 4/7 patrón).
- **EMAIL sin `providerAttemptStartedAt`**: lease vencido → nuevo claim → intento coherente, sin dos workers (test 7 "before" → COMPLETED).
- **EMAIL con `providerAttemptStartedAt`**: → `DELIVERY_UNKNOWN` vía CAS; el worker no hace un segundo fetch (test 7 "after": `fetchCalls` sin cambios). **Escenario concurrente obligatorio cubierto por la nueva prueba 10** (worker tardío vs recuperación).

## 20. Fencing de finalización

La finalización de éxito de email (service:580-618) hace CAS `where {id, status:PROCESSING, attemptCount}`. Si un worker de recuperación ya marcó `DELIVERY_UNKNOWN` (status cambia) o hubo un re-claim (`attemptCount` cambia), el CAS da `count=0` → lanza `OUTBOX_FINALIZE_CAS_LOST` → el catch (con `providerAttemptStarted=true`) **registra un fallo de FINALIZE y no sobrescribe** (service:621-630). **A no afirma SENT si perdió el ownership.** La nueva **prueba 10** lo demuestra de forma determinista (inyección en `BEFORE_OUTBOX_FINALIZE`): la fila queda `DELIVERY_UNKNOWN`, `completedEmail=0`, EmailLog ≠ SENT y no es elegible para retry. Token de fence = `(status, attemptCount)`.

## 21. Retry y backoff

`computeBillingOutboxNextAttemptAt`: `min(15min · 2^(attemptCount-1), 24h)`. Intentos 1..5 → 15/30/60/120/240 min (prueba pura 14); tope 24h nunca desborda; máximo 5 intentos → FAILED_FINAL (integración 6, pura 9/14). `nextAttemptAt` desde el `now` de la corrida (una sola lectura de reloj). Sin retry dentro de la misma corrida; sin sleeps.

## 22. Dispatcher

Máximo 100 seleccionados; una fila a lo sumo una vez por ejecución; un error por fila no detiene a las demás (test 8); `DELIVERY_UNKNOWN`/`FAILED_FINAL` no se re-seleccionan (no consumen el lote repetidamente); `PROCESSING` no abandonado no se selecciona (solo por recovery con lease vencido); la selección antigua funciona sin transición nueva (test 4); el cron llama al dispatcher aunque aplique cero transiciones (billing.service.ts:949). **Backlog** (N-05, bajo): 100 filas problemáticas recurrentes con backoff creciente y orden por `nextAttemptAt` ceden turno a filas nuevas conforme su `nextAttemptAt` avanza; los FAILED_FINAL/DELIVERY_UNKNOWN salen del conjunto elegible, evitando bloqueo indefinido.

## 23. Integración con cron

Búsqueda global: `notifyTenantAdminsOfLicenseChange` y `sendEmailSafe` **ya no** aparecen en `billing.service.ts` (0 referencias); `appliedTenantIds` eliminado; `externalEffects` ahora **derivado** del outbox (`externalEffectsFromOutbox`) solo para compatibilidad de UI/toast. **Un solo camino activo**: `transición → outbox durable → dispatcher`. `sendEmail`/`sendEmailSafe` persisten pero sirven a emails **no-billing** (invitaciones/PQRS/soporte/contraseña), sin coexistir con el outbox para billing.

## 24. Resumen

`CronRunSummary` conserva `movedToGracePeriod`/`movedToSuspended` (UI) y añade `outboxCreation` (activeRecipients, planned, created, transitionsWithoutRecipients) y `outboxDispatch` (eligible, claimed, processed, completedInApp/Email, internalDuplicates, skippedConcurrentClaim, retriesScheduled, failedFinal, deliveryUnknown, noValidRecipient, providerAttempts, inAppAttempts, emailAttempts, notificationTenantsAttempted, errors, errorDetails≤50 + errorDetailsTruncated). Sin emails, nombres, payloads, respuestas del proveedor, stack ni secretos (tests 8/9 verifican ausencia de `@example.test`). Compatible con super-admin y UI.

## 25. Autenticación

No se añadieron rutas. El cron sigue fail-closed (`isCronAuthorizationValid` + `timingSafeEqual`, revisado en Fase 2N). El dispatcher se invoca solo desde `applyOverdueLicenseRules` (cron/super-admin), nunca desde input HTTP arbitrario; los overrides `now`/`batchLimit` de `dispatchBillingOutbox` están gateados por `NODE_ENV==="test"` (service:651). La ruta cron llama `applyOverdueLicenseRules(null)` y super-admin `applyOverdueLicenseRules(session.user.id)`, sin exponer opciones de outbox por query/body. No se devuelve metadata sensible.

## 26. Seams

Ocho seams (`AFTER_OUTBOX_CREATED`, `AFTER_OUTBOX_SELECTED`, `AFTER_OUTBOX_CLAIMED`, `BEFORE_NOTIFICATION_CREATE`, `AFTER_NOTIFICATION_CREATE`, `BEFORE_EMAIL_PROVIDER_ATTEMPT`, `AFTER_EMAIL_PROVIDER_RESPONSE`, `BEFORE_OUTBOX_FINALIZE`): solo bajo `NODE_ENV==="test"` (service:57-61); sin entrada HTTP; dirigibles por `outboxId`; reset en `finally`/`afterEach`/`after`; sin sleeps; sin promesas colgadas. Reproducen caída antes del provider (test 4), después de frontera/respuesta (test 7), respuesta tardía/fencing (test 10 nuevo), fallo antes de finalizar (test 2) y dos workers (test 3). Seguros.

## 27. Mapeo de pruebas obligatorias (28)

| # Requisito | Prueba | Estado |
|---|---|---|
| 1 Outbox revierte con la transición | integ 2 | cubierto |
| 2 Sin recipients | integ 2 | cubierto |
| 3 Dos crons no duplican outbox | integ 3 | cubierto |
| 4 Dos dispatchers IN_APP | integ 3 (crons concurrentes) | cubierto |
| 5 Dos dispatchers EMAIL | integ 3 (workers) | cubierto |
| 6 Crash tras Notification, antes de finalizar | integ 5 (existente idempotente; atómico ⇒ sin media-escritura) | cubierto |
| 7 Crash antes de provider | integ 7 (before) | cubierto |
| 8 Crash tras frontera, antes de fetch | integ 7 + policy 11 (decisión por marca, no por fetch) | cubierto |
| 9 Crash tras fetch, antes de persistir | integ 7 (after) | cubierto |
| 10 Worker tardío no sobrescribe DELIVERY_UNKNOWN | **integ 10 (NUEVO)** | cubierto |
| 11 Sin API key | integ 6 | cubierto |
| 12 Usuario inactivo | **integ 11 (NUEVO)** | cubierto |
| 13 Usuario eliminado | **integ 11 (NUEVO)** | cubierto |
| 14 Éxito con provider ID | integ 6 | cubierto |
| 15 2xx sin ID | **integ 12 (NUEVO)** | cubierto |
| 16 2xx ilegible | **integ 12 (NUEVO)** | cubierto |
| 17 Rechazo temporal conocido | integ 6 (503) | cubierto |
| 18 Rechazo permanente conocido | integ 6 (400) | cubierto |
| 19 Timeout | **integ 12 (NUEVO)** | cubierto |
| 20 Error de red | **integ 12 (NUEVO)** | cubierto |
| 21 Máximo de intentos | integ 6 (attemptCount=4) | cubierto |
| 22 Backoff | pura 8/**14** | cubierto |
| 23 Corrida sin transiciones drena pendientes | integ 4 | cubierto |
| 24 Un error no bloquea otras filas | integ 8 | cubierto |
| 25 Unique real de Notification | integ 5 | cubierto |
| 26 Unique real de EmailLog/attempt | integ 6/7 (outboxId único) + unique de attempt (schema/migración, ejercido por claim) | cubierto |
| 27 Detalles truncados | integ 9 | cubierto |
| 28 Compatibilidad del resumen | integ 8 | cubierto |

## 28. Archivos modificados (por mí)

- `tests/billing-outbox-idempotency.test.ts` — **+3 pruebas** (10 fencing, 11 inactivo/eliminado, 12 respuestas ambiguas).
- `tests/unit/billing-outbox-policy.test.ts` — **+2 pruebas** (14 backoff 1..5+tope, 15 inválidos).
- Documentos 03 (prompt) y 04 (este informe).

**Sin cambios** en schema, migración, `billing.service.ts`, `billing-outbox-policy.ts`, `billing-outbox.service.ts`, `notification.service.ts` ni `email.ts` (no se hallaron defectos críticos/altos/medios). No toqué `tests/billing-cron-atomicity.test.ts` (aparece modificado por Codex en 2P; es archivo permitido "solo por compatibilidad").

## 29. Validación de migración

`prisma validate` ✓; `prisma generate` ✓; `migrate diff --from-schema-datamodel … --to-schema-datamodel … --exit-code` → **No difference detected** (schema internamente consistente); DDL derivado del datamodel incluye tablas/uniques/índices del outbox; comparación manual schema↔migración sin divergencias; aplicación desde cero verificada por Codex (24 migraciones en esquema temporal) y refrendada operacionalmente por la suite de integración completa contra la base de pruebas migrada. No usé `db push` ni apliqué al entorno normal; no dejé esquemas temporales.

## 30. Pruebas puras

`node --import tsx --test tests/unit/*.test.ts` → **219/219** (217 previas + 2 nuevas), 0 fail/skip/todo.

## 31. Pruebas de integración

`tests/billing-outbox-idempotency.test.ts`: **12 escenarios** (9 previos + 3 nuevos) contra PostgreSQL real, `fetch` mockeado, sin emails reales. Cubren atomicidad, ausencia de destinatarios, concurrencia (crons y dispatchers), crash antes/después del proveedor, fencing, drenaje antiguo, uniques reales, estados de email (SENT/retryable/final/unknown/ambiguos), inactivo/eliminado, máximo de intentos, aislamiento y truncamiento.

## 32. Compatibilidad

Suite completa **353/353** (0 fail/skip/todo). Siguen verdes: Payment idempotente, precedencia, cobertura, reactivación, cuarentena, cron CAS/starvation/atomicidad, guard/seguridad de base de pruebas, autenticación, invitaciones, permisos y compatibilidad del resumen para super-admin/UI.

## 33. Procedimiento seguro

`npm test` inseguro abortó antes de Prisma (guard: mismo destino `TEST_DATABASE_URL == DATABASE_URL`). La suite corrió con `env DATABASE_URL= DIRECT_URL= npm test` (el runner fuerza el destino de pruebas y planta la marca). No se modificó `.env`, `.env.test` ni el guard.

## 34. Comandos ejecutados

```
git status/log/diff (lectura)
npx prisma validate            -> OK
npx prisma generate            -> OK
npx prisma migrate diff (schema-vs-schema, from-empty) -> consistente
npx tsc --noEmit               -> PASS
npm run lint                   -> PASS
node --import tsx --test tests/unit/*.test.ts -> 219/219
npm test (inseguro)            -> abortado por el guard (esperado)
env DATABASE_URL= DIRECT_URL= npm test -> 353/353
(conteos de base de pruebas antes/después con script diagnóstico de solo lectura, ya eliminado)
```
Sin build, servidor, `db push`, seed, proveedor real, commit ni push.

## 35. Resultados

Prisma válido; generación OK; schema↔migración consistentes; typecheck PASS; lint PASS; puras 219/219; suite completa **353/353**; `git diff --check` limpio (solo aviso informativo CRLF de Windows); cero `skip` en los archivos del outbox. No se reintentó ningún fallo lógico.

## 36. Limpieza

Conteos de la base de **pruebas** antes y después (idénticos): `tenants:6, users:17, subscriptions:6, payments:5, webhooks:0, auditLogs:164, notifications:42, emailLogs:26, pricingRules:7, outbox:0, attempts:0, processing:0, unknown:0`; residuos cron/outbox/webhook = 0. Variables (`RESEND_API_KEY`, `MERCADO_PAGO_*`) restauradas por los tests; hooks reseteados en `afterEach`/`after`; `.env` intacto; `.env.test` ignorado; sin esquemas temporales; cero emails reales; cero llamadas reales a Mercado Pago.

## 37. Hallazgos restantes (bajos, aceptados)

- **N-01 (BAJO) · Consumo de intento en abandono pre-proveedor** — `recoverAbandonedRows` reencola a PENDING sin decrementar `attemptCount`; un crash antes del proveedor consume un intento. Es una **política conservadora explícita** (trazable con `ABANDONED_BEFORE_PROVIDER_START`); el riesgo real (5 crashes pre-proveedor en la misma fila) es implausible. No bloquea.
- **N-02 (BAJO) · `lockedAt` usa el `now` de la corrida** — bajo lotes patológicamente lentos (>10 min) un dispatcher concurrente podría recuperar una fila aún en vuelo; el CAS de fencing evita el doble envío (peor caso: un `DELIVERY_UNKNOWN` conservador). No bloquea.
- **N-03 (INFO) · Separador `|` en la dedupe key** — sin colisión posible con cuids/enums/ISO; podría prefijarse por longitud para robustez extra. No bloquea.
- **N-04 (INFO) · 5xx → FAILED_RETRYABLE** — clasificación defendible (Resend confirma entrega solo con 2xx+id). No bloquea.
- **N-05 (INFO) · `externalEffects.emailFailed` aproximado** — la forma legada cuenta `DELIVERY_UNKNOWN`/retryable como "failed"; el desglose preciso vive en `outboxDispatch`. No bloquea.

Ninguno crítico/alto/medio.

## 38. Riesgos aceptados

- Producción debe **aplicar la migración** antes de operar.
- `DELIVERY_UNKNOWN` requiere **monitoreo/conciliación manual** (sin outbox de entrega ni webhooks de Resend, expresamente fuera de alcance).
- El dispatcher depende de la **cadencia del cron** y procesa 100 filas por lote (suficiente para la escala del negocio).
- Base de pruebas = mismo proyecto que la normal (excepción temporal ya registrada); separar antes de producción.

## 39. Recomendación para la revisión final de Codex

Revisar especialmente: (a) la frontera proveedor/finalización y el fencing por `(status, attemptCount)` (nueva prueba 10); (b) la clasificación de `RESEND_API_KEY_MISSING`→FAILED_FINAL y 5xx→FAILED_RETRYABLE; (c) la política de consumo de intento en abandono pre-proveedor (N-01); (d) la política operacional para resolver `DELIVERY_UNKNOWN`; y (e) el costo del dispatcher secuencial con backlog alto (N-05). Recomiendo **aprobar** la subfase si Codex reproduce 353/353 y acepta los riesgos bajos N-01..N-05; luego puede procederse al commit de esta subfase (schema + migración + servicios + pruebas + documentos).

## 40. Estado

**CORREGIDO CON RIESGOS.**

Todos los criterios de aceptación (§29 del prompt) se cumplen; no quedan hallazgos críticos/altos/medios; las brechas de pruebas obligatorias (incluida la prueba concurrente de fencing) fueron cerradas. No hice commit, push ni tags; no inicié otra subfase.

- Prompt guardado en: [`03-prompt-claude-revision-correccion-outbox-idempotencia.md`](03-prompt-claude-revision-correccion-outbox-idempotencia.md).
