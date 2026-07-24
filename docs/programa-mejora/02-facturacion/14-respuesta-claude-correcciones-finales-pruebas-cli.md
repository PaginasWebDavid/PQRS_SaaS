# FASE 1G — Correcciones finales de pruebas y CLI de reconciliación (informe)

## 1. Resumen ejecutivo

Se cerraron los cuatro hallazgos F1F. Las **aserciones de rollback** (F1F-01) ahora verifican estrictamente todos los modelos: en los escenarios 5–8 el Payment es nuevo, así que se afirma que la fila **no existe** tras el rollback (sin aserción ambigua), más Subscription (todos los campos económicos + pendientes), Tenant (sin reactivación parcial ni divergencia), AuditLog (0 económicas parciales) y WebhookEvent (`FAILED`, nunca `DUPLICATE`/`PROCESSED`). El escenario 8 comprueba el reintento con la matriz completa (una sola fila, marcador, cuarentena, ambos períodos alineados con Subscription, estados ACTIVE, una auditoría económica, `FAILED`+`PROCESSED` sin `DUPLICATE`). El escenario histórico 13 verifica períodos del Payment sin cambios, Subscription/Tenant sin cambios, pendientes no limpiados y metadata de auditoría (`reconciliationRequired: true`, `effectApplied: false`). La **evidencia de auditoría del CLI** (F1F-02) ahora consulta por `subscriptionId` y filtra por `metadata.externalId` con un helper puro (nunca por `tenantId`). Se añadió **doble confirmación** en producción (`--confirm-production` + `--confirm-payment-id` coincidente) (F1F-03) y se documentó con precisión el **rollback no simétrico del enum** (F1F-04). Verificado: `tsc` limpio, `lint` limpio, **95/95 pruebas puras** (12 nuevas), **0 `skip`** en integración. No se aplicó la migración, no se llamó a Mercado Pago, no se hizo commit.

## 2. Estado inicial

Commit `0141492`; 1C+1E sin commit; migración `20260722000100_...` presente y **no aplicada**. Docs 10/11/12 existían; se creó el doc 13 (este prompt) antes de editar.

## 3. Confirmación de hallazgos

Verificados directamente: F1F-01 (`assertRollback` aceptaba `pay === null || marcador null` y omitía períodos de Payment, estado, cuarentena; el escenario 8 no verificaba período de Payment, ledger ni no-duplicación); F1F-02 (`runList` filtraba `AuditLog.targetId = tenantId` mientras el webhook audita `targetId = subscriptionId`); F1F-03 (`--confirm-production` de una sola señal); F1F-04 (rollback comentado no explicaba el enum). Todos confirmados.

## 4. Aserciones de rollback

Nueva `assertRollbackOfNewPayment(subBefore, tenantId, externalId)`: captura el snapshot de la Subscription **antes** del fallo y afirma tras el rollback:
- **Payment**: la fila nueva **no existe** (`pay === null`) — aserción estricta, no ambigua.
- **Subscription**: `currentPeriodStart`, `currentPeriodEnd`, `status`, `graceEndsAt`, `pendingUnitsSnapshot`, `pendingPriceCents` iguales al snapshot.
- **Tenant**: `status = TRIAL`, igual a `sub.status` (sin divergencia ni reactivación parcial).
- **AuditLog**: 0 auditorías económicas parciales.
- **WebhookEvent**: existe `FAILED`; no existe `DUPLICATE` ni `PROCESSED`.
Se usa en 5, 6, 7 (fallo en `AFTER_EFFECT_CLAIM`, `AFTER_SUBSCRIPTION_UPDATE`, `BEFORE_AUDIT_LOG`) y en el primer intento de 8.

## 5. Reintento (escenario 8)

Tras el primer intento fallido (rollback verificado) y el reintento sin hooks: una **única** fila Payment; `status = APPROVED`; `approvedEffectAppliedAt` no nulo; `approvedEffectReconciliationRequired = false`; `Payment.periodStart == Subscription.currentPeriodStart` y `Payment.periodEnd == Subscription.currentPeriodEnd`; Subscription `ACTIVE`; Tenant `ACTIVE`; exactamente un período nuevo; exactamente una auditoría económica; una entrega `FAILED` y una `PROCESSED`; **sin** `DUPLICATE`; pendientes no limpiados dos veces.

## 6. Pruebas históricas

Escenario 13 ampliado: se fijan términos pendientes y períodos históricos propios en el Payment; tras el webhook se verifica `Payment.periodStart/End` sin cambios, `Subscription.currentPeriodStart/End`/`status` sin cambios, `pendingUnitsSnapshot/pendingPriceCents` intactos (no limpiados), `Tenant.status = TRIAL`, `approvedEffectAppliedAt` nulo, cuarentena verdadera, ledger `RECONCILIATION_REQUIRED`, y metadata de auditoría `reconciliationRequired: true` + `effectApplied: false`. Escenario 14 (reconciliado → `DUPLICATE`, sin cambios) y 15 (pago nuevo con cuarentena falsa) se conservan. Sin `skip`.

## 7. Evidencia de auditoría

Helpers puros nuevos en `reconciliation.ts`: `auditMetadataMatchesPayment(metadata, externalId)` (estricto, tolerante a nula/malformada, exige `provider = MERCADO_PAGO` y `externalId` exacto) y `summarizeAuditEvidence(rows, externalId)` (cuenta, acciones distintas, fecha más reciente; sin secretos). El CLI expone `findPaymentAuditEvidence(subscriptionId, externalId)` que consulta `AuditLog` por `targetId = subscriptionId` + acción de webhook y filtra en memoria por `externalId` — **nunca** por `tenantId`. Una auditoría de otro pago de la misma suscripción no cuenta.

## 8. Cambios del CLI

`runList` incluye `subscriptionId` en el select y muestra `auditEvidenceCount`, `latestAuditAt` y `auditActions` (sin metadata completa). `runMarkApplied` valida la confirmación de producción antes de tocar la base. `main()` solo corre cuando el script es el **entrypoint directo** (guard `import.meta.url === pathToFileURL(process.argv[1]).href`), lo que permite importar `findPaymentAuditEvidence` desde la prueba de integración sin ejecutar el CLI.

## 9. Doble confirmación

`parseReconcileArgs` ahora captura `confirmPaymentId` y rechaza wildcard (`*`) y múltiples `--payment-id`. `validateProductionConfirmation({ isTestTarget, paymentId, confirmProduction, confirmPaymentId })` (pura): en base de pruebas no exige repetir el ID; en un destino que no parece de pruebas exige `--confirm-production` **y** `--confirm-payment-id` **igual** a `--payment-id`; rechaza si falta cualquiera o si el ID repetido no coincide. La confirmación nunca proviene de variables de entorno.

## 10. Protección de datos

Confirmado: el external ID se muestra enmascarado (`maskExternalId`); `summarizeAuditEvidence` devuelve solo count/acciones/fecha (sin metadata completa, sin secretos — probado con un fixture que incluye `authorization`); no se imprimen URLs, credenciales, firmas ni motivos de auditoría de otros pagos; los errores del guard de producción usan `describeDatabaseTarget` (host/base, sin credenciales) — nunca `DATABASE_URL` completa.

## 11. Rollback del enum

Comentario de la migración reescrito: `WebhookEvent` (tabla) y las dos columnas de `Payment` son eliminables; `WebhookEventResult` se elimina **una vez** que la tabla ya no exista; `AuditAction.PAYMENT_RECONCILED` **no** puede eliminarse con `ALTER TYPE ... DROP VALUE` (PostgreSQL no lo soporta) → en un rollback normal queda **huérfano e inocuo**; retirarlo exigiría una migración especial de reconstrucción del tipo (destructiva), que **no** debe ejecutarse automáticamente.

## 12. Archivos modificados

- **Modificados en 1G**: `scripts/reconcile-historical-payment-effects.ts` (evidencia por subscription, doble confirmación, main guardado, export de `findPaymentAuditEvidence`), `src/domains/billing/reconciliation.ts` (confirmPaymentId, `validateProductionConfirmation`, helpers de evidencia), `tests/billing-webhook-idempotency.test.ts` (aserciones ampliadas, escenario 17), `tests/unit/billing-reconciliation.test.ts` (12 pruebas nuevas), `prisma/migrations/.../migration.sql` (comentario de rollback del enum).
- Sin cambios en 1G (heredados): `schema.prisma`, `mercado-pago.service.ts`, `billing.service.ts`, `audit.service.ts`, `period.ts`, `webhook-metadata.ts`, `webhook-metadata`/`period` tests.
- Ningún archivo fuera de alcance; no se tocó el diseño de idempotencia/cuarentena/transacciones.

## 13. Pruebas puras

`tests/unit/billing-reconciliation.test.ts` (25 casos, +12): `parseReconcileArgs` con `confirmPaymentId`, rechazo de wildcard/múltiples IDs; `validateProductionConfirmation` (test sin ID, prod exige ambos flags, ID no coincidente rechazado, coincidente aceptado); `auditMetadataMatchesPayment` (mismo/otro pago, nula/malformada sin lanzar); `summarizeAuditEvidence` (cuenta exacta, no filtra secretos ni IDs completos). Total suite pura: **95/95**.

## 14. Pruebas de integración preparadas

`tests/billing-webhook-idempotency.test.ts`: **17 escenarios, 0 `skip`**, compilando. Escenario 17 nuevo importa `findPaymentAuditEvidence` (con `main()` guardado) y verifica que la evidencia distingue dos pagos de la misma suscripción y devuelve 0 para uno inexistente. **No ejecutadas** (sin `.env.test`).

## 15. Comandos ejecutados

`git status`; `npx tsc --noEmit`; `npm run lint`; `npx tsx --test tests/unit/*.test.ts`; `git diff --stat` de `package-lock.json`; `grep` de `skip`.

## 16. Resultados

- `tsc --noEmit`: **0 errores**. `lint`: **0 warnings/errores**. Pruebas puras: **95/95**.
- Integración: **0 `skip`**. `package-lock.json` sin cambios. Sin archivos generados rastreados.

## 17. Validaciones pendientes

- Ejecutar los 17 escenarios de integración (rollback/histórico/evidencia CLI) contra una base de pruebas dedicada (`.env.test`), tras aplicar la migración **solo** a esa base.
- Confirmar `prisma generate` en un CI limpio (el EPERM del DLL es un bloqueo local de Windows).
- No se aplicó la migración, no se corrió `npm test`, no se ejecutó el CLI contra ninguna base, no se llamó a Mercado Pago.

## 18. Diff resumido

```
scripts/reconcile-historical-payment-effects.ts | evidencia por subscriptionId; doble confirmacion;
                                                | main() guardado; export findPaymentAuditEvidence
src/domains/billing/reconciliation.ts           | confirmPaymentId; validateProductionConfirmation;
                                                | auditMetadataMatchesPayment; summarizeAuditEvidence
tests/billing-webhook-idempotency.test.ts       | assertRollbackOfNewPayment estricto; escenario 8 completo;
                                                | escenario 13 ampliado; escenario 17 (evidencia CLI)
tests/unit/billing-reconciliation.test.ts       | +12 pruebas puras
prisma/migrations/.../migration.sql             | comentario rollback del enum (no simetrico)
```

## 19. Riesgos restantes

- **Ejecución de integración pendiente** (sin `.env.test`): correcciones verificadas por diseño, tipos y pruebas puras; no ejecutadas contra PostgreSQL.
- **Reconciliación histórica manual**: requiere evidencia operativa; el CLI la facilita pero no la automatiza.
- **Rollback del enum no simétrico** (documentado; valor huérfano inocuo).
- **Fuera de alcance (bloqueantes posteriores)**: precedencia de eventos, carreras cron↔webhook, `cancelledAt` por webhook, ventana HMAC, exclusión de simulados de métricas, reconciliación MP↔DB, retención del ledger, rate-limit.
- `prisma generate` en Windows local (EPERM del DLL; sin efecto en CI).

## 20. Respuesta a F1F-01…F1F-04

- **F1F-01 (aserciones rollback)** → **Corregido**: `assertRollbackOfNewPayment` estricto (fila inexistente vs revertida), matriz completa en 5–8 y escenario 13 histórico ampliado.
- **F1F-02 (evidencia CLI)** → **Corregido**: `findPaymentAuditEvidence` por `subscriptionId` + filtro puro por `externalId`; nunca `tenantId`. Pruebas puras + escenario 17.
- **F1F-03 (confirmación producción)** → **Corregido**: doble confirmación `--confirm-production` + `--confirm-payment-id` coincidente; rechazo de wildcard/múltiples IDs; sin confirmación por env. Pruebas puras.
- **F1F-04 (rollback enum)** → **Corregido**: documentado con precisión en la migración y en este informe (valor de enum huérfano inocuo; reconstrucción destructiva no automática).

## 21. Estado

**CORREGIDO CON VALIDACIÓN PENDIENTE.**

Los cuatro hallazgos F1F están cerrados en código, CLI, migración y pruebas, verificados con `tsc`, `lint` y 95/95 pruebas puras, sin `skip` en integración. La única validación restante es ejecutar la suite de integración contra una base de pruebas dedicada y confirmar `prisma generate` en un CI limpio. No se aplicó la migración, no se llamó a Mercado Pago, no se hizo commit, y no se continuó con cron, precedencia, cancelación ni métricas.
