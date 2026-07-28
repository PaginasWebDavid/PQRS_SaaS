# FASE 2T - Revision final acotada del cierre de R-01

## 1. Resumen

R-01 queda cerrado. La revision estatica confirma que las siete verificaciones usan caminos productivos reales, el nuevo seam esta correctamente ubicado y no cambia el comportamiento de produccion. No encontre defectos funcionales nuevos en el outbox. La subfase puede convertirse en commit, con la condicion operativa de separar la base de pruebas y obtener una suite completa verde antes de produccion.

## 2. Estado de Git

- HEAD: `b924f64 feat(billing): make overdue cron atomic and concurrency-safe`.
- HEAD anterior: `a8a9a2a feat(billing): enforce payment precedence and access coverage`.
- Staged diff: vacio.
- `git diff --check`: sin errores; solo advertencias historicas LF/CRLF.
- No hay cambios inesperados fuera de la subfase.
- En Fase 2S solo cambiaron `src/domains/billing/billing-outbox.service.ts`, `tests/billing-outbox-idempotency.test.ts` y documentos 07-10.
- Schema y migracion conservan las dimensiones y el contenido aprobados antes de Fase 2S.

## 3. Alcance revisado

Lei completamente los documentos 06, 07 y 08. Revise el servicio de outbox, la prueba de integracion, el diff de Fase 2S y confirme que schema/migracion no recibieron cambios en 2S. No repeti la revision completa de la arquitectura aprobada en 2Q/2R.

## 4. R-01.1 a R-01.7

| Punto | Estado | Evidencia |
| --- | --- | --- |
| R-01.1 Dos dispatchers IN_APP | CERRADO | Dos `dispatchBillingOutbox` reales se sincronizan en `AFTER_OUTBOX_SELECTED`; un claim gana, queda una Notification, un Attempt, estado COMPLETED y cero PROCESSING. |
| R-01.2 Crash despues de Notification | CERRADO | `AFTER_NOTIFICATION_CREATE` lanza dentro de la transaccion; Notification y AuditLog revierten, no se completa el Attempt y el retry real crea exactamente una Notification. |
| R-01.3 Crash post-marcador/pre-fetch | CERRADO | El seam nuevo lanza con marcador durable y cero fetch; recovery real produce DELIVERY_UNKNOWN y una corrida posterior no reintenta. |
| R-01.4 Fencing con recovery real | CERRADO | Worker A espera antes de finalizar; otro `dispatchBillingOutbox` recupera por lease vencido; A pierde el CAS final, no marca SENT y solo existe un fetch. |
| R-01.5 Eliminacion real de User | CERRADO | `prisma.user.delete` ejerce `SET NULL`; el outbox se conserva, no hay proveedor ni Notification, termina FAILED_FINAL y el lote continua. |
| R-01.6 Unique real de EmailLog | CERRADO | PostgreSQL produce P2002 real por `outboxId` y `dedupeKey`; queda un EmailLog y el claim CAS conserva la proteccion concurrente. |
| R-01.7 Unique real de Attempt | CERRADO | El conflicto real `(outboxId, attemptNumber)` revierte claim y Attempt en la misma transaccion; queda PENDING con `attemptCount=0` y el intento posterior completa. |

## 5. Seam

`AFTER_EMAIL_PROVIDER_ATTEMPT_MARKED` esta unido al tipo de pasos y se ejecuta despues del commit de `providerAttemptStartedAt`, dentro de `beforeProviderAttempt`, antes de que `sendBillingOutboxEmail` invoque `fetch`. `runOutboxStep` solo ejecuta hooks con `NODE_ENV === "test"`. No tiene entrada HTTP, sleeps ni trabajo pendiente, se resetea en cleanup y es inerte en produccion. No introduce un cambio productivo observable.

## 6. Pruebas especificas

- Evidencia de Claude: `33/33 PASS`, compuesta por 18 pruebas de integracion y 15 puras.
- En esta revision, los intentos de construir el proceso acotado abortaron antes de descubrir pruebas por quoting/interoperabilidad del wrapper.
- La ejecucion efectiva fue bloqueada antes de crear PrismaClient por el guard: `.env DATABASE_URL` y `.env.test TEST_DATABASE_URL` tienen el mismo `projectRef` de Supabase.
- No se eludio el guard, no se creo PrismaClient, no se mutaron datos y no se repitio el fallo ambiental.
- La evidencia previa `33/33`, el diff estatico y las aserciones inspeccionadas son coherentes. No hay un fallo del outbox que analizar.
- No se ejecuto la suite completa, Prisma generate, migraciones, typecheck ni lint.

## 7. Conteo

Linea base `353`; seis pruebas nuevas; total teorico `359`. Outbox: 18 integraciones + 15 puras = 33 especificas.

## 8. Incidente ambiental

La evidencia de cuatro corridas muestra fallos variables solo en webhook/cron, timeouts de transacciones interactivas y latencias de 6-79 segundos; ninguna prueba del outbox fallo y los conteos finales quedaron limpios. Se clasifica como limitacion de infraestructura de pruebas, no como defecto del outbox ni de las pruebas nuevas. No bloquea commit. Si bloquea declarar produccion lista y exige una base separada/estable con `359/359` antes del despliegue. No deben aumentarse timeouts productivos para ocultarlo.

## 9. Hallazgos

No hay hallazgos funcionales nuevos ni defectos criticos, altos o medios abiertos en R-01. Se conserva la observacion operativa conocida: la configuracion actual de `.env.test` apunta al mismo proyecto que la base normal y el runner seguro la rechaza salvo que se vacie artificialmente `DATABASE_URL`. Esto no debe eludirse en la validacion previa a produccion.

## 10. Riesgos aceptados

N-01 a N-07 permanecen bajos/informativos y sin cambios. Tambien permanecen: conciliacion manual de DELIVERY_UNKNOWN, aplicacion pendiente de la migracion en produccion y separacion fisica de la base de pruebas.

## 11. Bloqueos

- Bloquea commit: **No**.
- Bloquea produccion: **Si**, hasta aplicar la migracion, configurar una base de pruebas separada y obtener `359/359` mediante el runner oficial.

## 12. Lista exacta autorizada para commit

`prisma/schema.prisma`; `prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql`; `src/domains/billing/billing.service.ts`; `src/domains/billing/billing-outbox-policy.ts`; `src/domains/billing/billing-outbox.service.ts`; `src/domains/notifications/notification.service.ts`; `src/lib/email.ts`; `tests/unit/billing-outbox-policy.test.ts`; `tests/billing-outbox-idempotency.test.ts`; `tests/billing-cron-atomicity.test.ts`; y los documentos 01-10 de `docs/programa-mejora/05-notificaciones-email-idempotencia/`.

No incluir `.env`, `.env.test`, package files, migraciones historicas, generados, logs, resultados de pruebas ni cambios ajenos. El escaneo encontro solo dos valores ficticios de Resend marcados como test; no encontro secretos reales.

## 13. Comandos `git add`

```text
git add -- prisma/schema.prisma prisma/migrations/20260727000100_add_billing_notification_outbox/migration.sql
git add -- src/domains/billing/billing.service.ts src/domains/billing/billing-outbox-policy.ts src/domains/billing/billing-outbox.service.ts src/domains/notifications/notification.service.ts src/lib/email.ts
git add -- tests/unit/billing-outbox-policy.test.ts tests/billing-outbox-idempotency.test.ts tests/billing-cron-atomicity.test.ts
git add -- docs/programa-mejora/05-notificaciones-email-idempotencia
```

Mensaje eventual exacto: `feat(billing): add durable notification outbox`.

## 14. Recomendacion y veredicto

Autorizar el commit acotado. Antes de produccion, crear una base de pruebas fisicamente separada, actualizar `.env.test`, ejecutar una vez la suite oficial hasta obtener `359/359`, aplicar la migracion y comprobar que no queden residuos.

**Veredicto: APROBADA CON CONDICION OPERATIVA.**

El prompt fue guardado exactamente en `09-prompt-codex-revision-final-cierre-r01.md` (SHA-256 `03634C4ECF3D8A83F9FEE4B320866CE1B36F53D4A022BDFB86F023FB6D0EF2C3`). Este informe quedo guardado en el documento 10. Solo cree/modifique los documentos 09 y 10; no modifique codigo, pruebas, schema, migracion ni documentos 01-08. No hice commit, push ni tags, no inicie otra subfase y me detuve tras esta revision.
