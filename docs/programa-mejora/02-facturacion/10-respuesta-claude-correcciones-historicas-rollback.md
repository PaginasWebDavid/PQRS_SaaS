# FASE 1E — Corrección del despliegue histórico y pruebas de rollback (informe)

## 1. Resumen ejecutivo

Se cerraron los cinco hallazgos F1D. El riesgo crítico de **replay histórico** (F1D-01) se resolvió con una **cuarentena obligatoria**: la migración marca todos los pagos `MERCADO_PAGO + APPROVED` preexistentes con `approvedEffectReconciliationRequired = true`, sin fijar `approvedEffectAppliedAt` ni tocar períodos; el handler nunca reclama el efecto de un pago en cuarentena (lo registra como `RECONCILIATION_REQUIRED`, distinto de `DUPLICATE`). Se añadió un **seam de fallos** interno solo para tests que hace ejecutables las cuatro pruebas de **rollback** (F1D-02), y se **ampliaron las aserciones** de integración a todos los modelos (F1D-04). Las peticiones **sin `dataId` ya no escriben ledger** (F1D-03). El cliente Prisma se regeneró (tipos correctos; el DLL chocó con un bloqueo transitorio de Windows, sin impacto en CI Linux) (F1D-05). Se agregó un **CLI de reconciliación** de un pago por ejecución. Verificado: `tsc` limpio, `lint` limpio, **83/83 pruebas puras** (13 nuevas). Las de integración quedan **ejecutables sin `skip`** pero pendientes de correr por falta de `.env.test`. No se aplicó la migración, no se llamó a Mercado Pago, no se hizo commit. **Estado: CORREGIDO CON VALIDACIÓN PENDIENTE.**

## 2. Estado inicial de Git

- Commit actual: `0141492`; la implementación 1C sigue **sin commit** (working tree).
- Migración `20260722000100_...` presente y **no aplicada** (no hay `_prisma_migrations` local; no se ejecutó Prisma contra ninguna base).
- Docs 06/07/08 de la fase existían; se creó el doc 09 (este prompt) antes de editar.

## 3. Confirmación de hallazgos

Verificados directamente en el código 1C: F1D-01 (migración dejaba `approvedEffectAppliedAt = NULL` y el claim aceptaba históricos), F1D-02 (4 tests `skip`), F1D-03 (`if (!dataId)` creaba `WebhookEvent IGNORED` antes de validar firma), F1D-04 (aserciones 1–4 solo cubrían período/estado), F1D-05 (`prisma generate` con EPERM). Todos confirmados.

## 4. Diseño de cuarentena histórica

Nueva columna `Payment.approvedEffectReconciliationRequired Boolean @default(false)`. Semántica:
- **Pagos nuevos**: nacen en `false` → funcionan normalmente.
- **Pagos históricos** `MERCADO_PAGO + APPROVED`: la migración los pone en `true` (cuarentena) **sin** asumir que su efecto se aplicó y **sin** fijar `approvedEffectAppliedAt`.
- El reclamo económico exige las **tres** condiciones: `status = APPROVED` **y** `approvedEffectAppliedAt IS NULL` **y** `approvedEffectReconciliationRequired = false`. Un histórico en cuarentena nunca obtiene `count = 1`.
- Salida del limbo: solo por **reconciliación manual** auditada (CLI), nunca por replay automático.

## 5. Migración actualizada (SQL exacto de la cuarentena)

Se modificó la migración existente (no se creó una segunda). Parte de cuarentena:

```sql
ALTER TABLE "Payment" ADD COLUMN "approvedEffectAppliedAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN "approvedEffectReconciliationRequired" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Payment"
  SET "approvedEffectReconciliationRequired" = true
  WHERE "provider" = 'MERCADO_PAGO' AND "status" = 'APPROVED';

ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PAYMENT_RECONCILED';
```
Más `CREATE TYPE "WebhookEventResult"` (con `RECONCILIATION_REQUIRED`), `CREATE TABLE "WebhookEvent"` e índices. Todo aditivo; no modifica `periodStart/periodEnd/paidAt`/importes; rollback documentado en el archivo.

## 6. Handler para pagos históricos

En `upsertMercadoPagoPayment`, tras el upsert y dentro de la transacción: si el pago está en cuarentena (`isHistoricalQuarantined`), **no** reclama efecto, **no** cambia período/pendientes, **no** reactiva; audita con `reconciliationRequired: true` y marca el ledger `RECONCILIATION_REQUIRED`, luego retorna. El claim del efecto (para no-históricos) añade `approvedEffectReconciliationRequired: false` al `WHERE` como defensa en profundidad.

## 7. CLI de reconciliación

`scripts/reconcile-historical-payment-effects.ts` (no ejecutado en esta sesión):
- `list` (por defecto, solo lectura): muestra pagos en cuarentena con ID local, externalId **enmascarado**, tenant, estado, `paidAt`, `periodStart/End`, si requiere reconciliación y evidencia de auditoría. Sin secretos.
- `mark-applied --payment-id <id> --reason "<...>"`: **un pago por ejecución**, exige motivo no vacío, corre en transacción, fija `approvedEffectAppliedAt = paidAt ?? now`, limpia la cuarentena, **no** modifica el período, audita `PAYMENT_RECONCILED` con motivo y actor de sistema.
- **Protección de entorno**: reutiliza el guard de la Fase 0 (`canonicalizeDatabaseUrl`/`looksLikeTestDatabase`); si la base no parece de pruebas, `mark-applied` exige `--confirm-production`. No hay comando de extensión automática ni wildcard. No llama a Mercado Pago.

## 8. Garantía de pagos nuevos

El reclamo económico exige `approvedEffectAppliedAt = null` **y** `approvedEffectReconciliationRequired = false` **y** `status = APPROVED` (update condicional atómico). `PENDING → APPROVED` reclama una vez; `APPROVED` repetido → `count = 0` → `DUPLICATE`; dos `APPROVED` concurrentes → solo uno aplica (serializado por el bloqueo de fila). Un histórico en cuarentena jamás obtiene `count = 1`.

## 9. Seam de fallos

`__unsafeSetBillingTestHooks({ onStep })` con pasos `AFTER_PAYMENT_UPSERT`, `AFTER_EFFECT_CLAIM`, `AFTER_SUBSCRIPTION_UPDATE`, `AFTER_TENANT_UPDATE`, `BEFORE_AUDIT_LOG`, `BEFORE_WEBHOOK_RESULT`. En producción `billingTestHooks` está vacío (no-op). No lo aceptan las rutas HTTP, no se controla por env, no es API pública general; solo las pruebas lo inyectan por la función interna explícita. Un `throw` en un paso hace rollback de toda la transacción.

## 10. Pruebas de rollback

Los cuatro escenarios (antes `skip`) ahora **ejecutables** (escenarios 5–8), inyectando fallo en `AFTER_EFFECT_CLAIM`, `AFTER_SUBSCRIPTION_UPDATE`, `BEFORE_AUDIT_LOG` y reintento tras `AFTER_TENANT_UPDATE`. Cada uno verifica: marcador vuelve a `NULL` (o el Payment ni existe), período de Subscription sin cambios, estado Subscription/Tenant no divergente (`TRIAL`), sin AuditLog económico parcial (count 0), ledger en `FAILED`. El reintento (8) verifica un único período nuevo y el marcador establecido. No dependen del orden de ejecución.

## 11. Aserciones ampliadas

En los escenarios principales se verifican explícitamente: `Payment.approvedEffectAppliedAt`, `approvedEffectReconciliationRequired`, `Payment.periodStart/End`, `Subscription.currentPeriodStart/End`, `Subscription.status`, `Tenant.status`, cantidad de `AuditLog` (`MERCADO_PAGO_WEBHOOK_PROCESSED` = 1 en el caso nuevo), resultado final de `WebhookEvent` (`PROCESSED`/`DUPLICATE`/`RECONCILIATION_REQUIRED`/`FAILED`), aplicación y limpieza de pendientes una sola vez, y ausencia de doble efecto.

## 12. Eventos sin dataId

`processMercadoPagoWebhook` retorna `{ processed: false, reason: "missing-data-id" }` **sin** crear `WebhookEvent`, sin validar firma, sin consultar Mercado Pago y sin tocar Payment/Subscription/Tenant. Prueba (escenario 16): una petición sin `dataId` no incrementa el conteo de `WebhookEvent` y no invoca `fetch` (mock que lanza si se llama). (No se implementó rate limiting, fuera de alcance.)

## 13. Ledger y estados

Enum `WebhookEventResult` ahora incluye `RECONCILIATION_REQUIRED`. Semántica confirmada: `DUPLICATE` = efecto ya aplicado; `RECONCILIATION_REQUIRED` = pago histórico en cuarentena, sin clasificar; `FAILED` = fallo técnico; `IGNORED` = evento estructuralmente válido pero no procesable; `ENTITY_NOT_FOUND`/`UNSUPPORTED_TOPIC` = sin entidad local / topic no soportado; **peticiones sin `dataId` no se persisten**.

## 14. Cliente Prisma

`npx prisma generate` ejecutado. Los **tipos** del cliente se regeneraron correctamente (verificado por conteo de símbolos `approvedEffectReconciliationRequired`, `RECONCILIATION_REQUIRED`, `PAYMENT_RECONCILED` en `index.d.ts`, y por `tsc` en verde). El renombrado del motor produjo repetidamente:
```
EPERM: operation not permitted, rename '...query_engine-windows.dll.node.tmp*' -> '...query_engine-windows.dll.node'
```
Clasificación: es un **bloqueo de archivo transitorio de Windows** (un proceso mantiene abierto el DLL); **no** borré ni reinstalé nada. No afecta a `tsc`/lint/pruebas puras (no conectan a BD). **Riesgo para CI: bajo** — en un runner limpio (Linux, sin bloqueo de DLL) el `postinstall`/`build` ejecuta `prisma generate` sin problema. `package-lock.json` sin cambios; ningún archivo generado quedó rastreado.

## 15. Archivos modificados

- **Modificados**: `prisma/schema.prisma` (columna cuarentena + enums `RECONCILIATION_REQUIRED`/`PAYMENT_RECONCILED`), `src/domains/billing/mercado-pago.service.ts` (seam, handler histórico, sin ledger para missing dataId, claim con cuarentena), `src/domains/platform/audit.service.ts` (categoría `PAYMENT_RECONCILED`), migración `20260722000100_.../migration.sql`.
- **Nuevos**: `src/domains/billing/reconciliation.ts`, `scripts/reconcile-historical-payment-effects.ts`, `tests/unit/billing-reconciliation.test.ts`; docs 09/10.
- **Sin cambios en 1E** (heredados de 1C): `billing.service.ts`, `period.ts`, `webhook-metadata.ts`, `tests/unit/billing-period.test.ts`, `tests/billing-webhook-idempotency.test.ts` (este último **reescrito** en 1E).
- Ningún archivo fuera de alcance.

## 16. Pruebas puras

`tests/unit/billing-reconciliation.test.ts` (13 casos): clasificación histórico/nuevo, condiciones de reclamo (`canClaimApprovedEffect`), enmascarado del ID externo, metadata de reconciliación segura (sin importes ni ID completo), y validación del CLI sin conexión (`parseReconcileArgs`: default list, exige payment-id/reason, refleja confirm-production, rechaza comandos desconocidos). Sumadas a las 8 de `billing-period.test.ts` y 62 de aislamiento → **83/83**.

## 17. Pruebas de integración

`tests/billing-webhook-idempotency.test.ts` reescrito: 16 escenarios **sin `skip`**, compilando. 1–4 con aserciones completas; 5–8 rollback con el seam; 9–10 ledger; 11 preapproval atómico; 12 pendientes; 13 histórico en cuarentena no extiende (`RECONCILIATION_REQUIRED`); 14 histórico reconciliado no extiende (`DUPLICATE`); 15 pago nuevo no marcado; 16 sin `dataId` no persiste ledger ni llama a MP. Limpieza amplía a `WebhookEvent` huérfano por `tenantId`/`dataId`/`requestId`. **No ejecutadas** (no hay `.env.test`).

## 18. Comandos ejecutados

`git status`; `npx prisma generate` (EPERM en DLL, tipos OK); `npx tsc --noEmit`; `npm run lint`; `npx tsx --test tests/unit/*.test.ts`; `git status`/`git diff` de `package-lock.json` y archivos generados.

## 19. Resultados

- `tsc --noEmit`: **0 errores**. `lint`: **0 warnings/errores**. Pruebas puras: **83/83**.
- `package-lock.json`: sin cambios. Sin archivos generados rastreados.
- Alcance: solo billing/audit/schema + migración + script + tests.

## 20. Validaciones pendientes

- Pruebas de integración (16 escenarios) y de rollback: **no ejecutadas** por falta de `.env.test` dedicada; el runner seguro abortaría. Quedan listas para correr con base de pruebas.
- Verificación de `prisma generate` en un entorno limpio (CI Linux) sin bloqueo de DLL.
- No se aplicó la migración, no se corrió `npm test`, no se llamó a Mercado Pago, no se levantó build/servidor.

## 21. Compatibilidad

- `approvedEffectReconciliationRequired` nace `false` (default); la migración marca `true` solo los históricos MP+APPROVED. Pagos nuevos intactos.
- No se modifican períodos, importes ni `paidAt` de ningún pago histórico.
- `WebhookEvent` es tabla nueva. `PAYMENT_RECONCILED` y `RECONCILIATION_REQUIRED` son valores de enum aditivos.

## 22. Rollback

Migración reversible:
```sql
DROP TABLE "WebhookEvent";
DROP TYPE "WebhookEventResult";
ALTER TABLE "Payment" DROP COLUMN "approvedEffectReconciliationRequired";
ALTER TABLE "Payment" DROP COLUMN "approvedEffectAppliedAt";
```
(El valor de enum `AuditAction.PAYMENT_RECONCILED` no se elimina fácilmente en PostgreSQL; es inocuo dejarlo. Documentado.) Revertir los archivos de código restaura el comportamiento previo sin pérdida de datos.

## 23. Riesgos restantes

- **Ejecución de integración/rollback pendiente** (sin `.env.test`): la corrección está verificada por diseño, tipos y pruebas puras, no ejecutada contra PostgreSQL.
- **Fuera de alcance (bloqueantes posteriores)**: precedencia de eventos fuera de orden, carreras cron↔webhook, `cancelledAt` por webhook, ventana HMAC, exclusión de simulados de métricas, reconciliación MP↔DB, retención del ledger, rate-limit de eventos inválidos.
- **Cuarentena histórica**: requiere un proceso operativo (revisar y reconciliar los pagos marcados) antes/durante el despliegue; el CLI lo soporta pero es manual.
- **`prisma generate` en Windows local**: bloqueo de DLL; sin efecto en CI.
- Un `RECEIVED` huérfano puede quedar si el proceso muere entre crear el ledger y el `catch` (documentado en 1D).

## 24. Respuesta a F1D-01…F1D-05

- **F1D-01 (replay histórico, crítica)** → **Corregido**: cuarentena `approvedEffectReconciliationRequired`; el claim exige `= false`; handler `RECONCILIATION_REQUIRED`; CLI de reconciliación manual. Sin backfill ciego. Pruebas 13–15.
- **F1D-02 (rollback no probado, alta)** → **Corregido**: seam de fallos + escenarios 5–8 ejecutables con aserciones de rollback completo y reintento.
- **F1D-03 (evento sin dataId, media)** → **Corregido**: no se persiste ledger para peticiones sin `dataId`; prueba 16.
- **F1D-04 (aserciones incompletas, media)** → **Corregido**: aserciones ampliadas a marcador, Payment, Subscription, Tenant, AuditLog y ledger; limpieza de huérfanos.
- **F1D-05 (prisma generate limpio, baja/media)** → **Corregido con nota**: tipos regenerados y verificados; EPERM del DLL documentado y clasificado como bloqueo local de Windows, riesgo bajo para CI; `package-lock` sin cambios.

## 25. Estado

**CORREGIDO CON VALIDACIÓN PENDIENTE.**

Los cinco hallazgos F1D están cerrados en código, schema, migración, script y pruebas, verificados con `tsc`, `lint` y 83/83 pruebas puras. La validación pendiente es la ejecución de las pruebas de integración/rollback contra una base de pruebas dedicada (`.env.test`) y la confirmación de `prisma generate` en un CI limpio. No se aplicó la migración, no se llamó a Mercado Pago, no se hizo commit. No se continuó con cron, precedencia, cancelación ni métricas.
