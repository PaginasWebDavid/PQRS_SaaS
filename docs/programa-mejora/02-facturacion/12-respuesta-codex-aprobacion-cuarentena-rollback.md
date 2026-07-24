# FASE 1F — Respuesta Codex: aprobación final de cuarentena histórica y rollback

Fecha de revisión: 2026-07-22  
Revisor: Codex, revisión técnica independiente en modo solo lectura  
Alcance: correcciones de la Fase 1E para cuarentena histórica, reconciliación, rollback y eventos sin `dataId`.

## 1. Resumen ejecutivo

La corrección de la Fase 1E resuelve el riesgo crítico de replay histórico en el flujo principal: la migración marca como cuarentena únicamente los pagos existentes con `provider = MERCADO_PAGO` y `status = APPROVED`; el handler detecta esa marca, no reclama el efecto, no cambia períodos ni términos pendientes y finaliza el ledger como `RECONCILIATION_REQUIRED`.

Los pagos nuevos nacen sin cuarentena y el reclamo atómico exige estado `APPROVED`, marcador económico nulo y cuarentena desactivada. El seam de fallos no está expuesto por HTTP, no depende de variables de entorno y los cuatro escenarios de rollback ya no están marcados `skip`. Las peticiones sin `dataId` retornan sin escribir ledger ni llamar al proveedor.

La migración es aditiva y coherente en sus columnas, enum, tabla e índices. TypeScript, lint y las pruebas puras pasan.

No obstante, la aprobación final queda bloqueada por dos deficiencias de calidad dentro del alcance: las pruebas de rollback no verifican todos los efectos exigidos por la Fase 1F, y el modo `list` del CLI cuenta evidencia de auditoría usando el `tenantId` como `targetId`, aunque los eventos de webhook auditan el `subscriptionId`. El código puede avanzar a una base dedicada para validación controlada, pero la fase no está lista para commit como aprobación final.

**Veredicto: REQUIERE CORRECCIONES.**

## 2. Estado de Git

El working tree contiene cambios sin commit:

- Modificados: `prisma/schema.prisma`, `src/domains/billing/billing.service.ts`, `src/domains/billing/mercado-pago.service.ts`, `src/domains/platform/audit.service.ts`.
- Nuevos: la migración `20260722000100_add_webhook_event_ledger_and_payment_effect`, `src/domains/billing/reconciliation.ts`, `scripts/reconcile-historical-payment-effects.ts`, `src/domains/billing/period.ts`, `src/domains/billing/webhook-metadata.ts` y las pruebas asociadas.
- Documentos de Fase 1E y Fase 1F están en `docs/programa-mejora/02-facturacion/`.
- No hay cambios en `package-lock.json` ni archivos generados rastreados.
- La nueva migración no fue aplicada durante esta revisión: no se ejecutó Prisma ni se conectó ninguna base. No es posible confirmar estáticamente el estado de una base externa sin conectarse a ella.

No se hizo commit ni push.

## 3. Alcance

El diff revisado se limita a facturación, auditoría, schema/migración, utilidades de reconciliación, CLI y pruebas de facturación. No se observaron cambios nuevos en cron, precedencia completa de eventos, cancelación, métricas, UI, legal, autenticación, storage o soporte.

La extracción de la fuente única de períodos pertenece al alcance de facturación y no introduce un módulo operativo adicional.

## 4. Cuarentena histórica

La migración realiza, en este orden:

1. Agrega `Payment.approvedEffectAppliedAt` nullable.
2. Agrega `Payment.approvedEffectReconciliationRequired BOOLEAN NOT NULL DEFAULT false`.
3. Ejecuta:

```sql
UPDATE "Payment"
SET "approvedEffectReconciliationRequired" = true
WHERE "provider" = 'MERCADO_PAGO' AND "status" = 'APPROVED';
```

4. Agrega `AuditAction.PAYMENT_RECONCILED`.
5. Crea `WebhookEventResult`, incluyendo `RECONCILIATION_REQUIRED`.
6. Crea la tabla `WebhookEvent` e índices.

El `UPDATE` no modifica períodos, importes ni `paidAt`, y no fija `approvedEffectAppliedAt`. Los pagos nuevos usan el default `false`.

El SQL usa los nombres y tipos que coinciden con `schema.prisma`. El enum de auditoría se modifica antes de cualquier uso de `PAYMENT_RECONCILED` por el código de aplicación; el valor no se utiliza dentro de la operación SQL de la migración.

### Replay histórico

El flujo queda así:

1. Existe un `Payment` histórico `APPROVED`.
2. La migración lo deja con `approvedEffectReconciliationRequired = true` y marcador nulo.
3. Mercado Pago reenvía el pago.
4. El `upsert` actualiza únicamente estado/metadatos permitidos y conserva la marca de cuarentena.
5. `isHistoricalQuarantined(payment)` devuelve `true`.
6. El código no ejecuta el reclamo condicional.
7. No actualiza `Subscription.currentPeriodStart/currentPeriodEnd`.
8. No limpia términos pendientes.
9. No llama a `applyTenantStatusInTx`, por lo que no reactiva `Tenant`.
10. El evento se marca `RECONCILIATION_REQUIRED`.

No encontré una ruta alternativa dentro del webhook `APPROVED` que pueda saltarse esta condición. El claim posterior exige además `approvedEffectReconciliationRequired = false`.

## 5. Pagos nuevos

El comportamiento es correcto:

- Un `Payment` nuevo nace con `approvedEffectReconciliationRequired = false` por el default del schema/migración.
- Un `PENDING` conserva `approvedEffectAppliedAt = NULL`.
- Al pasar a `APPROVED`, el reclamo exige simultáneamente estado aprobado, marcador nulo y cuarentena falsa.
- Si el reclamo obtiene una fila, se aplica el período y se fija el marcador.
- Un segundo `APPROVED` no vuelve a extender y se clasifica como `DUPLICATE`.
- Dos solicitudes simultáneas siguen protegidas por `mercadoPagoPaymentId @unique` y el `updateMany` condicional.

El `upsert` no incluye `approvedEffectReconciliationRequired` en su bloque `update`, por lo que no puede limpiar accidentalmente la cuarentena de un pago histórico. La creación sí omite el campo y recibe el default correcto.

## 6. Reconciliación

El comando `mark-applied --payment-id <id> --reason "<motivo>"` opera sobre un único pago por ejecución.

Verificado estáticamente:

- exige `--payment-id`;
- exige motivo no vacío;
- rechaza un pago que no esté en cuarentena;
- no acepta wildcard ni comando masivo;
- no tiene comando de extensión;
- fija `approvedEffectAppliedAt` usando `paidAt` o, si no existe, la fecha actual;
- limpia `approvedEffectReconciliationRequired`;
- no modifica `Subscription` ni `Tenant`;
- no modifica `Payment.periodStart` ni `Payment.periodEnd`;
- crea `PAYMENT_RECONCILED` dentro de la misma transacción;
- conserva el motivo en la auditoría;
- no llama a Mercado Pago.

Después de reconciliar, un replay encuentra el marcador ya fijado, no reclama el efecto y termina como `DUPLICATE`.

El modo `list` es el predeterminado cuando no se proporcionan argumentos y es de solo lectura. Muestra el external ID enmascarado y no imprime URLs, credenciales ni secretos.

### Defecto en la evidencia del CLI

El listado calcula `auditCount` filtrando `AuditLog.targetId = payment.tenantId`. En cambio, el webhook escribe el audit log con `targetId = subscription.id`. Por eso la evidencia mostrada puede ser incorrecta o cero aunque exista auditoría del webhook. Esto no cambia el pago ni permite doble extensión, pero puede inducir una decisión manual equivocada durante la reconciliación.

La corrección mínima es consultar la evidencia por el `Payment.id`, `subscription.id` o una combinación explícita de `tenantId` y metadata del efecto, según el contrato definitivo de auditoría.

## 7. Seguridad del CLI

La herramienta no se expone desde una ruta HTTP ni acepta parámetros de query, body o headers. `mark-applied` valida el destino: si la base no parece de pruebas, exige el flag explícito `--confirm-production`.

La confirmación no puede activarse mediante una variable de entorno. No existe wildcard, no hay operación “todos”, y el CLI no resuelve ni consulta Mercado Pago.

`--confirm-production` es una protección operativa válida para esta herramienta interna, aunque para producción recomiendo una segunda confirmación humana, por ejemplo repetir el ID interno del pago o exigir una referencia de cambio. Esa mejora es recomendable, no bloqueante para crear la base de pruebas.

## 8. Seam de fallos

`__unsafeSetBillingTestHooks` está exportado desde `mercado-pago.service.ts`, pero el valor productivo inicial es `{}` y el código no recibe hooks desde HTTP ni desde variables de entorno.

Los pasos se invocan dentro de la transacción:

- `AFTER_PAYMENT_UPSERT`;
- `AFTER_EFFECT_CLAIM`;
- `AFTER_SUBSCRIPTION_UPDATE`;
- `AFTER_TENANT_UPDATE`;
- `BEFORE_AUDIT_LOG`;
- `BEFORE_WEBHOOK_RESULT`.

Un `throw` interrumpe la transacción y el `catch` marca el ledger como `FAILED`. Las pruebas limpian el hook en `finally` y también en el `after` global.

El riesgo de que otro desarrollador importe deliberadamente la función es teórico y de gobernanza del código. No existe una ruta accidental accesible en runtime. No es un bloqueante real para esta fase, pero el nombre explícito `__unsafe` y un comentario de uso exclusivo ayudan a mantener la frontera.

## 9. Pruebas de rollback

Los escenarios 5–8 ya no contienen `skip`:

- 5: falla después del reclamo y antes de Subscription.
- 6: falla después de Subscription y antes de Tenant.
- 7: falla antes de crear AuditLog.
- 8: falla después de Tenant y luego reintenta sin hook.

Los escenarios 5–7 comprueban período y estado de Subscription, estado de Tenant, marcador nulo, ausencia de auditoría económica parcial y ledger `FAILED`. El escenario 8 comprueba que el reintento deja Subscription `ACTIVE`, extiende un solo período y fija el marcador.

### Aserciones faltantes

La función compartida `assertRollback` no verifica:

- `Payment.periodStart`;
- `Payment.periodEnd`;
- `Payment.status`;
- `Payment.approvedEffectReconciliationRequired`;
- la existencia/ausencia exacta de la fila Payment más allá de permitir `null` o marcador nulo.

El escenario 8 tampoco verifica:

- período de `Payment`;
- estado de cuarentena;
- estado final de `Tenant`;
- resultado final del ledger;
- cantidad de auditorías económicas, incluyendo ausencia de duplicado.

Esto incumple literalmente la matriz de aserciones exigida por la Fase 1F. No demuestra un fallo de atomicidad en el código, pero sí deja una cobertura insuficiente para aprobar F1-04 de forma definitiva.

## 10. Pruebas históricas

Los escenarios 13–15 existen y no están omitidos:

- 13 crea un pago histórico en cuarentena, comprueba que no extiende, conserva marcador nulo y cuarentena verdadera, y verifica `RECONCILIATION_REQUIRED`.
- 14 crea un pago reconciliado, comprueba que un replay no extiende y verifica `DUPLICATE`.
- 15 comprueba que un pago nuevo no queda marcado para reconciliación.

La cobertura es funcional, pero el escenario 13 no comprueba explícitamente términos pendientes, estado de Tenant ni que los períodos del Payment hayan permanecido sin cambios. Es una omisión importante de aserciones, no una ruta de doble extensión observada.

## 11. Missing `dataId`

El camino sin `dataId` retorna antes de validar firma, crear ledger o invocar fetch:

```text
{ processed: false, reason: "missing-data-id" }
```

No crea `WebhookEvent`, no consulta Mercado Pago, no modifica Payment, Subscription o Tenant y no registra el payload. La prueba 16 verifica conteo de ledger sin cambios y usa un `fetch` que lanza si se invoca.

Esta decisión es coherente: sin `dataId` no existe un manifiesto HMAC válido que validar.

## 12. Enums y migración

Verificado:

- `PAYMENT_RECONCILED` existe en `schema.prisma` y la migración lo agrega a `AuditAction`.
- `audit.service.ts` lo incluye en la categoría de facturación.
- `WebhookEventResult.RECONCILIATION_REQUIRED` existe en schema y SQL.
- La tabla y las columnas coinciden en nombres, tipos, defaults y nulabilidad.
- La migración es aditiva y el `UPDATE` histórico no toca períodos ni importes.
- Los índices de ledger están presentes.

La reversión del valor de enum `AuditAction.PAYMENT_RECONCILED` no es trivial en PostgreSQL. El rollback documentado puede retirar la tabla y columnas, pero debe dejar el valor de enum o requerir una migración especial de reconstrucción del tipo. Esto es aceptable como riesgo de migración, siempre que el release no prometa rollback completamente simétrico.

No se ejecutó la migración.

## 13. Pruebas unitarias

Las pruebas unitarias no importan Prisma ni abren conexiones. Se ejecutó:

```text
npx tsx --test tests/unit/*.test.ts
```

Resultado: **83 tests, 83 passed, 0 failed, 0 skipped**.

La cobertura incluye clasificación histórico/nuevo, condiciones del reclamo, metadata segura, enmascarado del external ID, parseo del CLI, protección de la base de pruebas, fuente única del período y sanitización de metadata.

Las pruebas unitarias no pueden demostrar transacciones PostgreSQL, concurrencia real, rollback ni la ejecución SQL de la migración.

## 14. Typecheck y lint

Ejecutados con resultado exitoso:

```text
npx tsc --noEmit
npm run lint
```

TypeScript terminó con cero errores y lint reportó `No ESLint warnings or errors`.

El primer intento de las pruebas dentro del sandbox produjo `spawn EPERM`; el reintento permitido fuera del sandbox terminó con los 83 casos exitosos. No se modificaron archivos por ese reintento.

## 15. Preparación de pruebas de integración

La suite `tests/billing-webhook-idempotency.test.ts` contiene 16 escenarios y no contiene `skip`. Importa Prisma únicamente en esa suite de integración, usa IDs con prefijo único por ejecución, mockea `fetch`, construye la firma HMAC y restaura hooks/fetch en cleanup.

La limpieza incluye ledger por `tenantId`, `dataId` y `requestId`, cubriendo eventos huérfanos.

Estáticamente está lista para una base dedicada configurada mediante `.env.test`. La ejecución real sigue pendiente porque esta fase prohíbe pruebas que importen Prisma y no hay que ejecutar la migración aquí.

La principal limitación antes de declarar la fase aprobada no es que la suite no pueda arrancar, sino que sus aserciones de rollback e histórica todavía deben ampliarse según la matriz de la sección 9.

## 16. Prisma generate

No se ejecutó Prisma en esta revisión, conforme a la restricción.

El reporte de la Fase 1E indica un `EPERM` de Windows al renombrar el DLL del motor, con tipos regenerados y typecheck exitoso. El cliente generado no está rastreado; `postinstall` y `build` regeneran Prisma. Esto no bloquea crear la base de pruebas desde este diff, pero debe verificarse en un entorno limpio/CI antes de producción.

Clasificación:

- ¿Bloquea pasar a pruebas de integración?: No, si CI/entorno dedicado puede ejecutar `prisma generate` correctamente.
- ¿Bloquea el commit?: No por sí solo; requiere comprobación de CI.
- ¿Bloquea producción?: Sí como verificación operativa pendiente, no como defecto demostrado del código.

## 17. Hallazgos

### F1F-01 — Aserciones incompletas en rollback

- Severidad: Importante.
- Archivo/símbolo: `tests/billing-webhook-idempotency.test.ts`, `assertRollback` y escenario 8.
- Comportamiento: las pruebas comprueban algunos efectos, pero no verifican períodos de Payment, estado de Payment, cuarentena ni todos los estados/ledger/auditoría del reintento.
- Escenario: una regresión podría dejar `Payment.periodEnd` alterado o una auditoría duplicada y las pruebas actuales podrían seguir pasando.
- Impacto: F1-04 queda parcialmente demostrado, aunque la transacción inspeccionada usa el cliente correcto.
- Evidencia: líneas de `assertRollback` 197–210 y escenario 8, líneas 251–264.
- Corrección mínima: ampliar la matriz de aserciones para Payment, marcador, cuarentena, ambos períodos, estados, Tenant, auditoría y resultado ledger; verificar también no duplicación tras reintento.
- Prueba requerida: ejecutar los escenarios 5–8 contra PostgreSQL dedicado.
- ¿Bloquea crear la base de test?: No.
- ¿Bloquea el commit?: Sí, si el commit se presenta como aprobación final de F1-04.

### F1F-02 — Evidencia de auditoría incorrecta en `list`

- Severidad: Importante.
- Archivo/símbolo: `scripts/reconcile-historical-payment-effects.ts`, `runList`.
- Comportamiento: busca `AuditLog.targetId = p.tenantId`, mientras los audits del webhook usan como `targetId` el `Subscription.id`.
- Escenario: el operador consulta un pago en cuarentena y recibe `auditEvidence=0` o un conteo ajeno.
- Impacto: reconciliación manual basada en evidencia incompleta o incorrecta.
- Evidencia: `runList` líneas 67–69 frente al audit de webhook de `upsertMercadoPagoPayment`, que usa `targetId: subscription.id`.
- Corrección mínima: resolver la suscripción del pago y consultar por su ID, o usar una consulta explícita por `tenantId`, `resourceId` y metadata.
- Prueba requerida: fixture con auditoría de webhook y assertion del conteo correcto en modo list.
- ¿Bloquea crear la base de test?: No.
- ¿Bloquea el commit?: Sí, por riesgo operativo del CLI de reconciliación.

### F1F-03 — Confirmación de producción de una sola señal

- Severidad: Menor/recomendación.
- Archivo/símbolo: `parseReconcileArgs` y `runMarkApplied`.
- Comportamiento: `--confirm-production` habilita la escritura en un destino no identificado como test sin pedir repetir el ID del pago.
- Escenario: una persona opera sobre el pago equivocado en producción.
- Impacto: posible reconciliación manual incorrecta, sin extensión automática, pero con pérdida del estado de cuarentena.
- Evidencia: el flag booleano se valida sin confirmación adicional.
- Corrección mínima recomendada: exigir una segunda confirmación explícita del ID interno o de una referencia de cambio.
- Prueba requerida: rechazo cuando la segunda confirmación no coincide.
- ¿Bloquea crear la base de test?: No.
- ¿Bloquea el commit?: No; es una mejora operativa recomendada.

### F1F-04 — Rollback del enum no simétrico

- Severidad: Menor.
- Archivo/símbolo: migración `migration.sql`, rollback comentado.
- Comportamiento: el rollback retira tabla y columnas, pero no puede retirar fácilmente `AuditAction.PAYMENT_RECONCILED`.
- Impacto: una reversión deja un valor de enum huérfano, aunque no afecta el funcionamiento.
- Evidencia: PostgreSQL no admite eliminar valores de enum de forma directa y el rollback comentado no lo revierte.
- Corrección mínima: documentar explícitamente que el valor queda conservado o añadir una migración de reconstrucción del enum solo si alguna vez fuera imprescindible.
- Prueba requerida: revisión de rollback en CI/documentación, sin aplicar destrucción automática.
- ¿Bloquea crear la base de test?: No.
- ¿Bloquea el commit?: No, si se acepta como comportamiento de rollback de enum.

## 18. Riesgos aceptados

- Las pruebas de integración requieren una base dedicada y no se ejecutaron.
- `prisma generate` debe validarse en CI limpio para evitar el bloqueo de DLL de Windows.
- La reconciliación histórica sigue siendo manual y requiere evidencia operativa.
- Eventos fuera de orden, carreras cron/webhook, cancelación, métricas, retención del ledger y rate limiting permanecen fuera de esta fase.
- El seam exportado es utilizable por código interno, pero no es accesible por HTTP ni por configuración externa.
- El ledger puede conservar eventos `RECEIVED` si el proceso muere entre crear la entrega y actualizar su resultado.
- La confirmación de producción podría reforzarse con doble confirmación humana.

## 19. Recomendación

**REQUIERE CORRECCIONES** antes de declarar la fase completamente aprobada.

El código ya está en condiciones de preparar una base de pruebas dedicada sin aplicar todavía la migración en producción. La validación dedicada debe ejecutarse solo después de completar las aserciones faltantes y corregir la consulta de evidencia del CLI; de lo contrario, la suite puede pasar sin cubrir todos los efectos que esta fase exige proteger.

## 20. Recomendación sobre commit

No recomiendo hacer commit de release todavía. Sí se puede conservar el trabajo actual y crear una base de pruebas aislada para validar el comportamiento, porque no encontré un escape del handler que permita extender un pago histórico en cuarentena ni un seam accesible desde HTTP.

Antes del commit final:

1. Completar las aserciones de rollback e histórica.
2. Corregir `auditEvidence` del CLI.
3. Ejecutar los 16 escenarios contra `.env.test` tras aplicar la migración únicamente a esa base.
4. Confirmar `prisma generate` en CI limpio.

## 21. Veredicto

# REQUIERE CORRECCIONES

La cuarentena histórica, reconciliación, aislamiento del seam y manejo de `dataId` faltante están correctamente encaminados. Las validaciones estáticas pasan con **83/83 pruebas puras**, typecheck limpio y lint limpio.

La aprobación final no procede todavía porque faltan aserciones exigidas en rollback y el CLI muestra evidencia de auditoría potencialmente incorrecta. La revisión termina aquí; no se modificó código, schema, migración, scripts ni pruebas, no se ejecutó integración, no se ejecutó Prisma, no se conectó PostgreSQL, no se hizo commit/push y no se continuó con cron, precedencia, cancelación o métricas.
