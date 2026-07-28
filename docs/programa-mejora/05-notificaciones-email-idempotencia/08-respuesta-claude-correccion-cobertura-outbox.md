# FASE 2S — Corrección acotada de cobertura del outbox (cierre de R-01)

Fecha: 2026-07-28
Autor: Claude (corrección acotada de pruebas)
Commit base (HEAD, sin commit nuevo): `b924f64 feat(billing): make overdue cron atomic and concurrency-safe`
**Estado: CORREGIDO CON RIESGOS** (R-01 cerrado; riesgo residual **ambiental**, no de código: ver §24)

---

## 1. Resumen ejecutivo

Cerré **R-01** (única observación abierta por Codex en la revisión final): las cinco ventanas obligatorias que antes se afirmaban por inspección ahora se **provocan con pruebas reales**, y la prueba de fencing se **fortaleció para usar el camino real de recuperación** (ya no updates directos). Para la ventana post-marcador/pre-fetch añadí **un solo seam test-only** (`AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED`) que se ejecuta después de confirmar `providerAttemptStartedAt` y antes del `fetch`. No modifiqué schema, migración, política, dedupe, backoff, límites, resumen, autenticación ni contratos.

Las pruebas revelaron **cero defectos funcionales**: cada ventana se comporta exactamente como el diseño garantiza. **Los 33 casos afectados (18 integración de outbox + 15 puras de outbox) pasan 33/33** ejecutados de forma aislada por el guard seguro.

**Nota ambiental importante:** hoy (2026-07-28) la base de pruebas remota compartida (pooler de Supabase) está **fuertemente degradada** (latencias de 7–79 s por prueba). Esto provoca **timeouts de transacción interactiva (5 s)** en pruebas **ajenas** de webhook y cron (`billing-webhook-idempotency.test.ts`, `billing-cron-atomicity.test.ts`), que **fallan de forma intermitente y distinta en cada corrida** (runs sucesivos: #51; #2/#3; #2/#4/#10/#19/#21 + cron#2; 5 más). **Ninguna prueba del outbox falló en ninguna corrida.** Es el riesgo ya documentado de la base de pruebas compartida, fuera de los archivos permitidos para esta corrección.

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
git log -1 --oneline: b924f64 feat(billing): make overdue cron atomic and concurrency-safe
git diff --cached: vacío (sin staged diff)
```

Confirmado: HEAD sigue en `b924f64`; sin staged diff; los cambios pendientes son la Fase 2P/2Q/2S (outbox) más los documentos 01–08; `.env`, `.env.test`, package files y migraciones históricas intactos. Hash base: **`b924f64725c57dcb40c268bc2fdcd6d2e9efee08`**.

## 3. Alcance aplicado

- **1 seam** nuevo en `billing-outbox.service.ts` (post-marcador/pre-fetch).
- **1 prueba fortalecida** (fencing con recuperación real) + **6 pruebas nuevas** de integración en `tests/billing-outbox-idempotency.test.ts`.
- **0 cambios** en schema, migración, `billing-outbox-policy.ts`, `notification.service.ts`, `email.ts`, `billing.service.ts` (el seam no necesitó registro externo), pruebas históricas, package files ni entorno.
- Documentos 07 y 08.

No amplié el alcance: no se hallaron defectos que exigieran tocar otro archivo.

## 4. R-01

> R-01 · MEDIA · Cinco ventanas obligatorias no se provocan mediante pruebas reales.

Escenarios señalados por Codex, todos ahora provocados con el camino productivo real:

1. Dos dispatchers concurrentes sobre una fila IN_APP → **prueba 13**.
2. Crash tras crear Notification, antes de finalizar → **prueba 14**.
3. Crash tras persistir `providerAttemptStartedAt`, antes del fetch → **prueba 15** (seam nuevo).
4. Eliminación real del User destinatario → **prueba 16**.
5. Conflictos reales de EmailLog y BillingOutboxAttempt → **pruebas 17 y 18**.
6. Fencing con recuperación **real** (no updates directos) → **prueba 10** (fortalecida).

## 5. Seam añadido

`AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED` ([billing-outbox.service.ts], dentro de `beforeProviderAttempt`, justo después de `providerAttemptStarted = true; summary.providerAttempts += 1;`). Semántica: se ejecuta **después** del commit de la transacción del marcador (`providerAttemptStartedAt` durable) y **antes** del `fetch` (porque `sendBillingOutboxEmail` hace `await beforeProviderAttempt()` antes de llamar a Resend). Requisitos: solo bajo `NODE_ENV==="test"`; sin entrada HTTP; dirigible por `outboxId`; sin sleeps; reset en `finally`/`afterEach`/`after`; sin promesas colgadas; no altera producción (hook vacío por defecto). No se reutilizó un seam de posición distinta.

## 6. Dos dispatchers IN_APP (prueba 13)

`13. two concurrent dispatchers on one IN_APP row`. Seam: `AFTER_OUTBOX_SELECTED` como **barrera determinista** (ambos dispatchers seleccionan la MISMA fila y esperan a que `readers===2` antes de reclamar; sin sleeps). Ventana: dos claims reales compiten. Aserciones: `claimed` total = 1; el otro reporta `skippedConcurrentClaim` = 1; `completedInApp` total = 1; **exactamente una Notification** (por `dedupeKey`); **un solo AuditLog** `NOTIFICATION_CREATED`; **un solo attempt** (sin dos con el mismo número); outbox `COMPLETED`; **cero PROCESSING residual**. Dos `dispatchBillingOutbox` reales vía `Promise.all` (no dos crons).

## 7. Rollback tras Notification (prueba 14)

`14. a crash after Notification (before finalize) rolls back atomically`. Seam: `AFTER_NOTIFICATION_CREATE` lanza. Ventana: Notification creada dentro de la misma transacción que la finalización. Comportamiento real verificado: como Notification + finalización comparten transacción, el throw **revierte ambas** → Notification count 0, **sin AuditLog** `NOTIFICATION_CREATED`, outbox **no** `COMPLETED`, attempt#1 **no** `COMPLETED`. El manejador de error del dispatcher reclasifica la fila a `FAILED_RETRYABLE`. Un **retry posterior** (reloj > `nextAttemptAt`) crea **exactamente una** Notification y completa el outbox. Atomicidad real demostrada (no una Notification insertada a mano).

## 8. Crash post-marcador/pre-fetch (prueba 15)

`15. a crash after the provider marker (before fetch) recovers as DELIVERY_UNKNOWN`. Seam: el nuevo `AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED` lanza. Verificado: `fetch` = 0; la fila conserva **evidencia durable** (`providerAttemptStartedAt instanceof Date`) y sigue `PROCESSING`. Luego, la **recuperación real** (`dispatchBillingOutbox` con reloj +11 min, que ejecuta `recoverAbandonedRows`) la convierte en `DELIVERY_UNKNOWN` — **sin** fetch, **no** vuelve a `PENDING`; `EmailLog` y `attempt#1` quedan `DELIVERY_UNKNOWN`; `summary.deliveryUnknown` = 1; corrida posterior `eligible` = 0 y `fetch` = 0. No se simuló la frontera con un update directo.

## 9. Fencing con recuperación real (prueba 10, fortalecida)

`10. a late worker cannot overwrite DELIVERY_UNKNOWN (real recovery fencing)`. A reclama, marca la frontera y recibe un éxito de proveedor (mock), y queda detenido en `BEFORE_OUTBOX_FINALIZE`. En esa pausa se ejecuta la **recuperación REAL** (`dispatchBillingOutbox` con reloj +11 min → `recoverAbandonedRows` marca `DELIVERY_UNKNOWN` vía CAS). A continúa e intenta `COMPLETED`: el CAS final `(status=PROCESSING, attemptCount)` **pierde** → registra fallo de FINALIZE y **no sobrescribe**. Verificado: outbox permanece `DELIVERY_UNKNOWN`; `completedEmail` no aumenta para A; `EmailLog` no queda `SENT`; attempt#1 `DELIVERY_UNKNOWN`; **un solo fetch**; **cero PROCESSING residual**; `eligible` posterior = 0. Ya **no** se usan updates directos como sustituto de la recuperación.

## 10. Eliminación real del User (prueba 16)

`16. a real User deletion applies SET NULL and finalizes as FAILED_FINAL`. Se ejecuta `prisma.user.delete()` REAL sobre el destinatario tras crear la intención. Verificado: la FK aplica **`SET NULL`** (`recipientUserId` queda null y la fila outbox se conserva); el dispatcher **no** contacta al proveedor (`fetch`=0); **no** crea Notification; finaliza `FAILED_FINAL`; `noValidRecipient` = 1; sin EmailLog para el ausente; **el lote continúa** (una fila válida de otro tenant queda `COMPLETED` con su Notification); el resumen **no filtra** el email eliminado. No se reemplazó la eliminación por `recipientUserId = null`.

## 11. Conflicto real de EmailLog (prueba 17)

`17. EmailLog uniques (outboxId, dedupeKey) are enforced by PostgreSQL`. Tras un despacho normal (una fila `SENT`), se **provoca la restricción real** de PostgreSQL: un segundo `emailLog.create` con el mismo `outboxId` **rechaza** (P2002) y con el mismo `dedupeKey` **rechaza** (P2002). Queda **exactamente un** EmailLog por intención. "Dos workers no crean dos EmailLogs" se garantiza además por el CAS de claim (solo el ganador llega a `ensureEmailLog`; demostrado en pruebas 3 y 13). Se ejerce la restricción real, no solo el schema.

## 12. Conflicto real de Attempt (prueba 18)

`18. a real BillingOutboxAttempt unique conflict reverts the claim atomically` (enfoque de conflicto controlado). Se pre-inserta `attempt #1` para forzar el conflicto real de `@@unique([outboxId, attemptNumber])` durante el claim. Como claim y Attempt comparten transacción, el conflicto **revierte todo**: outbox sigue `PENDING`, `attemptCount` = 0 (no incrementado sin Attempt propio), sin duplicado de attempt; el resumen cuenta un error de claim. Tras limpiar el conflicto, un intento posterior limpio funciona (outbox `COMPLETED`, un attempt `COMPLETED`). Se ejerce el unique real, no un conteo tras una corrida normal.

## 13. Mapeo actualizado de requisitos

Los seis requisitos señalados pasan a **CUBIERTO** con el camino productivo real:

| Req | Prueba | Seam / mecanismo | Ventana provocada | Aserciones principales |
|---|---|---|---|---|
| 4 · dos dispatchers IN_APP | 13 | `AFTER_OUTBOX_SELECTED` (barrera) | dos claims reales sobre una fila | 1 claim, 1 Notification, 1 attempt, COMPLETED, sin PROCESSING |
| 6 · crash tras Notification | 14 | `AFTER_NOTIFICATION_CREATE` (throw) | Notification+finalización en una tx | rollback de ambas, retry crea 1 Notification y completa |
| 8 · crash post-marcador pre-fetch | 15 | `AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED` (throw) + recovery real | frontera durable sin fetch | fetch=0, recovery→DELIVERY_UNKNOWN, sin retry |
| 10 · worker tardío | 10 | recovery real vía `dispatchBillingOutbox` | éxito tardío vs DELIVERY_UNKNOWN | CAS final pierde, no sobrescribe, 1 fetch |
| 13 · eliminación real de User | 16 | `prisma.user.delete()` real | FK SET NULL en PostgreSQL | recipient null, FAILED_FINAL, lote continúa |
| 26 · unique EmailLog/Attempt | 17, 18 | P2002 real + conflicto de claim | duplicados reales | rechazo P2002; claim revierte atómicamente |

Los demás requisitos (1,2,5,9,11,12,14–25,27,28) ya estaban cubiertos (Fase 2Q, confirmados por Codex).

## 14. Archivos modificados (por mí, en 2S)

- `src/domains/billing/billing-outbox.service.ts` — **solo** el seam `AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED` (tipo + una llamada `runOutboxStep`).
- `tests/billing-outbox-idempotency.test.ts` — prueba 10 fortalecida + pruebas 13–18 nuevas.
- Documentos 07 (prompt) y 08 (este informe).

`src/domains/billing/billing.service.ts` **no** se modificó en 2S (el seam no requirió registro/reset externo). No se tocó `billing-outbox-policy.ts`, `notification.service.ts`, `email.ts` ni pruebas históricas.

## 15. Schema y migración intactos

Sin cambios en `prisma/schema.prisma` ni en la migración. `npx prisma validate` → válido; `npx prisma generate` → OK. Ninguna prueba reveló una divergencia funcional bloqueante que exigiera tocarlos.

## 16. Pruebas añadidas o fortalecidas

- **Fortalecida:** 10 (fencing con recuperación real).
- **Nuevas (integración):** 13, 14, 15, 16, 17, 18.
- **Puras:** sin cambios en 2S (219 se conservan).

## 17. Conteos

- **Puras:** 219/219 (sin cambios en 2S).
- **Integración outbox (`billing-outbox-idempotency.test.ts`):** de 12 → **18 escenarios** (fortalecí 1, añadí 6).
- **Total suite:** de 353 → **359** (+6).
- **Ejecución AISLADA de los archivos afectados** (guard oficial, solo los dos archivos de outbox): **33/33 PASS** (18 integración + 15 puras), 0 fail/skip/todo.

Sin ajustar pruebas para alcanzar un número: el incremento (+6) corresponde exactamente a las 6 pruebas de integración nuevas.

## 18. Compatibilidad

Los contratos públicos, el resumen, la autenticación y los servicios existentes no cambiaron. El seam nuevo es inerte en producción. Las pruebas históricas no se modificaron.

## 19. Procedimiento seguro

`npm test` inseguro aborta antes de Prisma (guard: mismo destino `TEST_DATABASE_URL == DATABASE_URL`). Las corridas usaron `env DATABASE_URL= DIRECT_URL= npm test` (runner oficial). La ejecución aislada de los archivos afectados reutilizó el **mismo** guard y merge del runner (mismo `assertSafeTestDatabase`, `DATABASE_URL` forzado al destino de pruebas, marca `PQRS_TEST_RUNNER`), limitada a los dos archivos de outbox, sin exponer credenciales. No se modificó runner, guard ni entorno.

## 20. Comandos ejecutados

```
git status/log/diff (lectura)
npx prisma validate            -> válido
npx prisma generate            -> OK
npx tsc --noEmit               -> PASS
npm run lint                   -> PASS (0 warnings)
node --import tsx --test tests/unit/*.test.ts -> puras PASS
npm test (inseguro)            -> abortado por el guard (esperado)
env DATABASE_URL= DIRECT_URL= npm test -> suite completa (x4; ver §21)
(aislado) archivos afectados de outbox vía guard oficial -> 33/33 PASS
```
Sin build, servidor, `db push`, seed, proveedor real, commit ni push.

## 21. Resultados

- `tsc` PASS; `lint` PASS; puras PASS.
- **Archivos afectados (outbox), aislados: 33/33 PASS** — todas las ventanas de R-01 verdes.
- **Suite completa:** cuatro corridas hoy, todas con fallos **intermitentes y distintos** exclusivamente en pruebas **ajenas** de webhook/cron por **timeout de transacción interactiva (5 s)** bajo latencia remota de 6–79 s:
  - Run 1: webhook #51.
  - Run 2: webhook #2, #3.
  - Run 3: webhook #4/#10/#19/#21 + cron #2.
  - Run 4: 5 fallos análogos.
  - **En ninguna corrida falló una prueba del outbox.**

## 22. Limpieza

Conteos de la base de pruebas antes y después (idénticos): `tenants:6, users:17, subscriptions:6, payments:5, webhooks:0, auditLogs:164, notifications:42, emailLogs:26, pricingRules:7, outbox:0, attempts:0, processing:0, unknown:0`; residuos outbox/cron = 0. Variables restauradas (RESEND_API_KEY, MP), seams reseteados (`afterEach`/`after`), barreras liberadas (`finally`), `.env` intacto, `.env.test` ignorado. Cero emails/Mercado Pago reales. Archivos temporales de diagnóstico eliminados.

## 23. Hallazgos funcionales descubiertos

**Ninguno.** Cada ventana provocada se comportó exactamente como el diseño garantiza (atomicidad, fencing por `(status, attemptCount)`, recuperación por `providerAttemptStartedAt`, FK `SET NULL`, uniques reales). No hubo que corregir código de producción ni schema.

## 24. Riesgos restantes

- **AMBIENTAL (no de código) — base de pruebas remota compartida degradada:** hoy el pooler de Supabase compartido produce timeouts de transacción interactiva (5 s) en pruebas de webhook/cron **ajenas** al outbox, de forma intermitente y distinta por corrida. Es el riesgo ya documentado (N-0x / "separar la base de pruebas antes de producción"). Las 18 pruebas de outbox añadidas son más lentas bajo esa latencia y **prolongan la ventana de contención**, aumentando la probabilidad del timeout ajeno, pero **no** introducen un defecto lógico. Corregirlo excede los archivos permitidos (requeriría subir el timeout de `runBillingTransaction` en `mercado-pago.service.ts`, o separar la base). **Recomendación:** re-ejecutar la suite completa cuando la base remota esté sana, o tras separar la base de pruebas; la corrección de R-01 en sí está verde (33/33 afectados).
- Riesgos previos N-01..N-07 de Codex (bajos/informativos) siguen aceptados y sin cambios.

## 25. Recomendación para Codex

R-01 está cerrado: seam post-marcador/pre-fetch añadido; fencing con recuperación real; y las cinco ventanas (dos dispatchers IN_APP, rollback tras Notification, crash post-marcador, borrado real de User, uniques reales de EmailLog/Attempt) provocadas con el camino productivo. **Los 33 casos afectados pasan 33/33** en ejecución aislada por el guard oficial. Recomiendo repetir la revisión final **re-ejecutando la suite completa cuando la base de pruebas remota esté sana** (o tras separarla): los fallos observados hoy son timeouts de transacción en pruebas ajenas de webhook/cron, no del outbox, y son distintos en cada corrida. Ningún cambio de schema, producción ni contrato fue necesario.

## 26. Estado

**CORREGIDO CON RIESGOS.**

- R-01 cerrado; los 33 casos afectados pasan 33/33 aislados; typecheck/lint/puras verdes; schema/migración intactos; sin commit/push/tags; sin iniciar otra subfase.
- Riesgo residual **exclusivamente ambiental**: la suite completa no puede demostrarse verde hoy por la degradación de la base de pruebas remota compartida (timeouts de transacción en pruebas ajenas de webhook/cron), fuera de los archivos permitidos para esta corrección.

- Prompt guardado en: [`07-prompt-claude-correccion-cobertura-outbox.md`](07-prompt-claude-correccion-cobertura-outbox.md).
