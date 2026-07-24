# FASE 1C — Implementación de idempotencia y atomicidad de facturación (informe)

## 1. Resumen ejecutivo

Se implementó la primera subfase bloqueante de facturación: **idempotencia del efecto económico** de un pago APPROVED, **atomicidad** del webhook (pago y preapproval), un **ledger de entregas** de webhook, y una **fuente única** de cálculo de período. El efecto económico (extender la licencia) ahora se reclama mediante un marcador atómico `Payment.approvedEffectAppliedAt` (update condicional respaldado por PostgreSQL), de modo que un APPROVED repetido o concurrente **no vuelve a extender**. `Payment`, el reclamo del efecto, `Subscription`, `Tenant` y `AuditLog` se aplican dentro de una **transacción interactiva** con rollback total ante fallo. Las entregas quedan trazadas en `WebhookEvent` con metadata sanitizada. Verificado: `tsc` limpio, `lint` limpio, **8/8 pruebas puras** nuevas (70/70 puras totales). Las pruebas de integración se añadieron pero su ejecución queda **pendiente** por no existir `.env.test` dedicada. No se llamó a Mercado Pago real, no se aplicó la migración, no se hizo commit. **Estado: IMPLEMENTADO CON RIESGOS** (los riesgos son los bloqueantes fuera de alcance —precedencia, cron, cancelación— y la ejecución de integración pendiente).

## 2. Estado inicial de Git

- Commit actual: `0141492` ("chore(test): isolate test database and protect Prisma execution").
- Working tree sin cambios de código; única carpeta sin trackear al inicio: `docs/programa-mejora/02-facturacion/` (con docs 01–04 de esta fase).
- Se creó el doc 05 con el prompt exacto antes de editar código.

## 3. Diagnóstico previo a cambios

Confirmado en código y contra el doc 04 (Codex): la fila `Payment` ya es idempotente (`mercadoPagoPaymentId @unique` + `upsert`), pero `upsertMercadoPagoPayment` actualizaba la `Subscription` **incondicionalmente** tras el upsert → un APPROVED repetido reextendía `currentPeriodEnd` (F1-01). Las escrituras (Payment, Subscription, Tenant, AuditLog) eran awaits separados sin transacción (F1-04). No existía ledger (`WebhookEvent`) ni trazabilidad de entregas (F1-08/F1-12). El cálculo de período y `BILLING_PERIOD_DAYS` estaban duplicados en `billing.service.ts` y `mercado-pago.service.ts` (F1-07).

## 4. Diseño de idempotencia elegido

**Alternativa B — marcador atómico en `Payment`** (`approvedEffectAppliedAt DateTime?`).

Justificación frente a la Alternativa A (tabla `PaymentEffect`):
- **Mínima**: una sola columna nullable, sin tabla ni FK nuevas.
- **Robusta**: el reclamo es un `UPDATE ... WHERE approvedEffectAppliedAt IS NULL` (compare-and-set) que PostgreSQL serializa por bloqueo de fila; dos transacciones concurrentes → una obtiene `count === 1`, la otra `count === 0`.
- **Correctamente acotada**: hoy existe exactamente **un** efecto económico por pago (extensión de período al aprobar). La columna representa ese efecto sin necesidad de una clave compuesta genérica. Si en el futuro hubiera múltiples tipos de efecto por pago, se migraría a la tabla `PaymentEffect` sin romper datos.
- **Compatible con `PENDING → APPROVED`**: el marcador es independiente de `status`; el efecto se reclama la primera vez que el pago es APPROVED, sin impedir la transición legítima de estado en la fila.

La clave conceptual `MERCADO_PAGO:{paymentId}:PERIOD_EXTENSION_APPROVED` (`buildPaymentEffectKey`) se registra en la auditoría para trazabilidad legible, pero **no** es la garantía persistente (esa es el marcador). Deliberadamente **no** se usa `x-request-id` ni `data.id` como clave económica.

## 5. Diferencia entre ledger y efecto económico

- **Ledger (`WebhookEvent`)**: registra cada **entrega HTTP** recibida y su resultado (`RECEIVED/PROCESSED/DUPLICATE/IGNORED/FAILED/ENTITY_NOT_FOUND/UNSUPPORTED_TOPIC`). Es trazabilidad, no idempotencia. Puede haber varias filas para el mismo pago (varias entregas).
- **Efecto económico**: garantía persistente en `Payment.approvedEffectAppliedAt`, reclamada atómicamente dentro de la transacción. Impide extender dos veces el mismo pago. El ledger **no** se usa como garantía económica.

## 6. Schema y migración

`prisma/schema.prisma`:
- `Payment.approvedEffectAppliedAt DateTime?` (marcador de idempotencia).
- `model WebhookEvent` (id, provider, topic, dataId, requestId?, rawStatus?, tenantId?, subscriptionId?, result, errorCode?, metadata Json?, receivedAt, processedAt?, createdAt, updatedAt) con índices `[provider, topic]`, `[dataId]`, `[tenantId]`, `[receivedAt]`. `tenantId`/`subscriptionId` son texto plano sin FK, para mantener el ledger desacoplado y la migración puramente aditiva.
- `enum WebhookEventResult`.

Migración: `prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql` (aditiva; `ADD COLUMN` nullable + `CREATE TYPE` + `CREATE TABLE` + índices). **No aplicada.** El cliente Prisma se regeneró con `npx prisma generate` (solo tipos, sin DB); el renombrado del DLL del motor chocó con un bloqueo transitorio de Windows (EPERM), pero los tipos del cliente quedaron actualizados (verificado), que es lo que `tsc` necesita.

## 7. Flujo del webhook después del cambio

1. Extraer `dataId`, `topic`, `x-request-id`. Si falta `dataId` → ledger `IGNORED` y salir.
2. **Validar firma HMAC** (autenticidad primero; firma inválida aborta antes del ledger).
3. **Registrar recepción** en `WebhookEvent` (`RECEIVED`).
4. **Consultar Mercado Pago fuera de la transacción** (GET preapproval / payment / authorized_payment).
5. **Transacción corta** que aplica el estado local y marca el ledger.
6. Si algo falla (consulta externa o transacción) → ledger `FAILED` con `errorCode` seguro y se relanza el error (la ruta responde según la política existente: 200/500).

## 8. Transacción de Payment

`upsertMercadoPagoPayment` (ahora transaccional):
- **Upsert** de la fila `Payment` (idempotente por `mercadoPagoPaymentId`).
- Si `APPROVED`: **reclamo atómico** `updateMany({ where: { id, status: "APPROVED", approvedEffectAppliedAt: null }, data: { approvedEffectAppliedAt: now } })`.
  - `count === 1` (**primera vez**): `computeNextPeriod` (fuente única), aplica términos pendientes, actualiza `Subscription` (ACTIVE + período + limpieza de pendientes), fija `Payment.periodStart/End`, sincroniza `Tenant`, audita (`effectApplied: true`, prev/next estado y período), ledger `PROCESSED`.
  - `count === 0` (**repetido/concurrente**): no toca período ni pendientes; audita `duplicate: true`, ledger `DUPLICATE`.
- Si no-APPROVED (PENDING/REJECTED): se conserva el comportamiento actual (mover a `GRACE_PERIOD`) pero **dentro de la transacción**. La precedencia de eventos fuera de orden queda fuera de alcance.

## 9. Transacción de preapproval

`updateSubscriptionFromPreapproval` ahora: lee la suscripción (fuera de tx); si no existe → ledger `ENTITY_NOT_FOUND`. Calcula `status` (con la regla intacta de no activar sin pago aprobado). Abre `$transaction`: actualiza `Subscription`, sincroniza `Tenant` (`applyTenantStatusInTx`), audita, marca ledger `PROCESSED`. No se cambió la política de estados (solo se envolvió en transacción).

## 10. Fuente única del período

Nuevo módulo puro `src/domains/billing/period.ts`: única `BILLING_PERIOD_DAYS = 30`, `addDays`, `resolveEffectiveTerms`, `computeNextPeriod` (devuelve `periodStart`, `periodEnd`, `effectiveTerms`, `clearPending` sin efectos secundarios). Lo consumen el webhook (`upsertMercadoPagoPayment`) y la renovación simulada (`renewSubscriptionWithSimulatedPayment`). Se eliminaron las constantes/duplicados de `addDays` y `BILLING_PERIOD_DAYS` en ambos servicios. No se cambió el comportamiento comercial de la renovación simulada (solo comparte la matemática de fechas).

## 11. Cambios de auditoría

`registerAuditLog(input, client = prisma)` acepta un cliente transaccional opcional (`Prisma.TransactionClient | typeof prisma`), manteniendo compatibilidad total con todos los callers de un solo argumento. Ahora la auditoría del webhook se crea **dentro** de la transacción. La metadata incluye provider, topic, paymentId externo, resultado, estado anterior/posterior, período anterior/posterior y `effectApplied`. La sanitización de claves sensibles (`sanitizeMetadata`) se mantiene.

## 12. Archivos modificados

- **Modificados**: `prisma/schema.prisma`, `src/domains/billing/mercado-pago.service.ts`, `src/domains/billing/billing.service.ts`, `src/domains/platform/audit.service.ts`.
- **Nuevos**: `src/domains/billing/period.ts`, `src/domains/billing/webhook-metadata.ts`, `prisma/migrations/20260722000100_add_webhook_event_ledger_and_payment_effect/migration.sql`, `tests/unit/billing-period.test.ts`, `tests/billing-webhook-idempotency.test.ts`, y los docs 05/06.
- **No modificados**: la ruta del webhook (`route.ts`) no requirió cambios; ningún archivo fuera de alcance.

## 13. Pruebas puras

`tests/unit/billing-period.test.ts` (8 casos, ejecutados y en verde): (1) período vencido arranca en `now`; (2) período vigente encadena desde `currentPeriodEnd`; (3) aplica términos pendientes; (4) sin pending no hay términos ni limpieza; (5) `resolveEffectiveTerms` usa `fallbackCurrency`; (6) metadata segura conserva primitivos y descarta objetos; (7) `buildPaymentEffectKey` formato; (8) `sanitizeWebhookMetadata` nunca filtra secretos/firmas/tarjetas.

## 14. Pruebas de integración

`tests/billing-webhook-idempotency.test.ts` (12 escenarios, **no ejecutados**, con mock de `fetch` y firma HMAC de prueba): 1) APPROVED nuevo extiende una vez; 2) mismo APPROVED ×2 extiende una vez; 3) PENDING→APPROVED extiende una vez; 4) dos APPROVED concurrentes → un efecto; 5–8) rollback y reintento (marcados `skip`: requieren un seam de inyección de fallo que se añadirá en una subfase posterior); 9) ledger `PROCESSED`; 10) ledger `DUPLICATE`; 11) preapproval sincroniza Tenant+Subscription en transacción; 12) términos pendientes aplicados y limpiados una vez.

## 15. Comandos ejecutados

`git status`; `npx prisma generate` (solo tipos, sin DB; EPERM transitorio en el DLL); `npx tsc --noEmit`; `npm run lint`; `npx tsx --test tests/unit/billing-period.test.ts`; `npx tsx --test tests/unit/*.test.ts`.

## 16. Resultados

- `tsc --noEmit`: **0 errores** (incluye los tests de integración, que tipan).
- `lint`: **0 warnings/errores**.
- Pruebas puras: **70/70** (62 aislamiento + 8 facturación).
- Alcance de archivos: solo billing/audit en `src/`, más módulos puros y tests.

## 17. Validaciones no realizadas

- `npm test` / pruebas de integración: **no ejecutadas** (no existe `.env.test` dedicada; el runner seguro abortaría). Quedan pendientes para un entorno con base de pruebas.
- No se aplicó la migración, no se ejecutó Prisma contra ninguna base, no se llamó a Mercado Pago, no se hizo build ni se levantó el servidor.
- Escenarios de rollback (5–8) quedan `skip` hasta añadir el seam de inyección de fallo.

## 18. Diff resumido

```
prisma/schema.prisma                         | + Payment.approvedEffectAppliedAt; + model WebhookEvent; + enum WebhookEventResult
prisma/migrations/2026072200.../migration.sql| (nueva) aditiva: columna + tabla + enum + indices (NO aplicada)
src/domains/billing/period.ts                | (nuevo, puro) BILLING_PERIOD_DAYS unico, computeNextPeriod, resolveEffectiveTerms
src/domains/billing/webhook-metadata.ts      | (nuevo, puro) buildPaymentEffectKey, sanitizeWebhookMetadata
src/domains/billing/mercado-pago.service.ts  | ledger; reclamo atomico; transacciones (payment + preapproval); usa period.ts
src/domains/billing/billing.service.ts       | usa BILLING_PERIOD_DAYS/computeNextPeriod compartidos; elimina duplicados
src/domains/platform/audit.service.ts        | registerAuditLog acepta cliente transaccional opcional
tests/unit/billing-period.test.ts            | (nuevo) 8 pruebas puras
tests/billing-webhook-idempotency.test.ts    | (nuevo) 12 escenarios de integracion (pendientes de ejecucion)
```

## 19. Compatibilidad con datos existentes

- `approvedEffectAppliedAt` nace `NULL` en todos los pagos históricos; no se modifica ningún Payment existente. Los pagos históricos no vuelven a extender porque el efecto solo se aplica ante un webhook APPROVED nuevo que gane el update condicional.
- `WebhookEvent` es una tabla nueva vacía.
- Enums y columnas existentes intactos. Suscripciones y pagos históricos sin cambios.

## 20. Rollback

La migración es aditiva y reversible:
```
DROP TABLE "WebhookEvent";
DROP TYPE "WebhookEventResult";
ALTER TABLE "Payment" DROP COLUMN "approvedEffectAppliedAt";
```
A nivel de código, revertir los cuatro archivos modificados restaura el comportamiento anterior sin pérdida de datos (las columnas nuevas quedarían huérfanas hasta el DROP).

## 21. Riesgos restantes

- **Fuera de alcance (bloqueantes posteriores)**: precedencia de eventos fuera de orden (F1-02), `APPROVED→REJECTED` definitivo, carreras cron↔webhook (F1-03), ventana HMAC, `cancelledAt` por webhook (F1-06), exclusión de SIMULATED de métricas (F1-05), reconciliación MP↔DB (F1-09). Siguen abiertos.
- **No-APPROVED sigue degradando a GRACE** en cada llegada (comportamiento previo conservado); un PENDING/REJECTED tardío aún puede degradar (se corrige en la subfase de precedencia).
- **Ejecución de integración pendiente**: la idempotencia/atomicidad está verificada por diseño y pruebas puras, pero no ejecutada contra PostgreSQL por falta de `.env.test`.
- **Escenarios de rollback (5–8)** requieren un seam de inyección de fallo aún no añadido.
- **Regeneración del cliente Prisma**: el motor DLL no se renombró por un bloqueo de Windows; conviene re-ejecutar `prisma generate` en un entorno limpio antes de correr integración.

## 22. Elementos expresamente fuera de alcance

Precedencia completa de eventos, `APPROVED→REJECTED` definitivo, carreras cron/webhook, cambios en el cron de mora, ventana temporal HMAC, política de cancelación, exclusión de simulados de métricas, reconciliación MP↔DB, cambios de interfaz/legales, nuevos proveedores, colas/Redis/Kafka/microservicios. No se declara la facturación lista para producción.

## 23. Respuesta individual a los hallazgos

- **F1-01 (efecto no idempotente)** → **Corregido**: marcador atómico `approvedEffectAppliedAt` + reclamo condicional; APPROVED repetido/concurrente no reextiende. Pruebas de integración 1–4, 12 (pendientes de ejecución) + pruebas puras de período.
- **F1-04 (webhook no atómico)** → **Corregido**: Payment + reclamo + Subscription + Tenant + AuditLog + ledger dentro de una transacción interactiva (pago y preapproval).
- **F1-07 (lógica económica duplicada)** → **Corregido**: `period.ts` es la fuente única de `BILLING_PERIOD_DAYS` y `computeNextPeriod`; consumido por webhook y renovación simulada; eliminados los duplicados.
- **F1-08 (replay/trazabilidad, parte estructural)** → **Parcialmente corregido**: existe el ledger `WebhookEvent` y la idempotencia del efecto (que neutraliza el impacto económico del replay). La **ventana de frescura HMAC** queda fuera de alcance (subfase posterior).
- **F1-12 (auditoría incompleta de webhooks)** → **Corregido**: cada entrega se registra en `WebhookEvent` con resultado (recibido/procesado/duplicado/ignorado/fallido/entidad no encontrada/topic no soportado) y metadata sanitizada; la auditoría incluye estado y período antes/después.

## 24. Estado

**IMPLEMENTADO CON RIESGOS.**

Los objetivos de la subfase (idempotencia del efecto APPROVED, atomicidad de pago y preapproval, ledger de entregas, fuente única de período, auditoría transaccional) están implementados y verificados con `tsc`, `lint` y pruebas puras. Los riesgos son: (a) la ejecución de las pruebas de integración queda pendiente por falta de base dedicada, (b) los escenarios de rollback (5–8) requieren un seam posterior, y (c) permanecen abiertos los bloqueantes fuera de alcance (precedencia, cron, cancelación, métricas, reconciliación). No se hizo commit. Fin de la fase.
